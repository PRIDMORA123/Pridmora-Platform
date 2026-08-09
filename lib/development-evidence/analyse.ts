/**
 * Evidence analysis orchestration.
 * Uses canonical AI context builder. Prevents re-analysis of unchanged hashes.
 */

import OpenAI from "openai";
import { EVIDENCE_ANALYSIS_SYSTEM_PROMPT } from "@/lib/ai/evidence-analysis-prompt";
import {
  buildEvidenceAiContext,
  parseStructuredEvidenceJson,
} from "@/lib/development-evidence/ai-context";
import {
  preferenceFramedSummary,
  validateStructuredPsychometricEvidence,
} from "@/lib/development-evidence/psychometrics";
import {
  findExistingByContentHash,
  getEvidenceById,
  listEvidenceForClient,
  markEvidenceAnalysisFailed,
  recordEvidenceAiUsage,
  saveAnalysedEvidence,
} from "@/lib/development-evidence/repository";
import type { StructuredEvidence } from "@/lib/development-evidence/types";
import type { PrivateIdentityFields } from "@/lib/relationship-identity";
import type { SupabaseClient } from "@supabase/supabase-js";

function getOpenAiClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;
  return new OpenAI({ apiKey: key });
}

export async function analyseEvidenceDocument(input: {
  supabase: SupabaseClient;
  userId: string;
  evidenceId: string;
  client: {
    name: string;
    role?: string | null;
    organisation?: string | null;
    identityMode?: string | null;
    displayLabel?: string | null;
    confidentialReference?: string | null;
    aiNameAllowed?: boolean | null;
  };
  privateIdentity?: Partial<PrivateIdentityFields> | null;
  force?: boolean;
}): Promise<{
  evidenceId: string;
  structured: StructuredEvidence;
  reusedExistingAnalysis: boolean;
}> {
  const detail = await getEvidenceById(
    input.supabase,
    input.userId,
    input.evidenceId
  );

  if (!detail.document?.extractedText?.trim()) {
    throw new Error("No extracted text is available to analyse.");
  }

  if (
    !input.force &&
    detail.evidence.contentHash &&
    detail.evidence.processingStatus === "ready" &&
    (detail.evidence.structuredEvidence.observations?.length ?? 0) > 0
  ) {
    return {
      evidenceId: detail.evidence.id,
      structured: detail.evidence.structuredEvidence,
      reusedExistingAnalysis: true,
    };
  }

  if (!input.force && detail.evidence.contentHash) {
    const existing = await findExistingByContentHash({
      supabase: input.supabase,
      clientId: detail.evidence.clientId,
      contentHash: detail.evidence.contentHash,
    });
    if (
      existing &&
      existing.id !== detail.evidence.id &&
      (existing.structuredEvidence.observations?.length ?? 0) > 0
    ) {
      const saved = await saveAnalysedEvidence({
        supabase: input.supabase,
        userId: input.userId,
        evidenceId: detail.evidence.id,
        structured: existing.structuredEvidence,
        sourceSummary: existing.sourceSummary,
      });
      return {
        evidenceId: saved.evidence.id,
        structured: saved.evidence.structuredEvidence,
        reusedExistingAnalysis: true,
      };
    }
  }

  const approved = (await listEvidenceForClient(
    input.supabase,
    input.userId,
    detail.evidence.clientId
  ))
    .filter(
      item =>
        item.includeInIntelligence &&
        item.id !== detail.evidence.id &&
        item.freshnessClass !== "historic"
    )
    .slice(0, 6)
    .map(item => ({
      title: item.title,
      evidenceType: item.evidenceType,
      freshnessClass: item.freshnessClass,
      sourceSummary: item.sourceSummary,
      observations: (item.structuredEvidence.observations ?? []).slice(0, 2).map(
        observation => ({
          title: observation.title,
          description: observation.description,
          behaviouralEvidence: observation.behaviouralEvidence,
          developmentImplication: observation.developmentImplication,
          capabilityKey: observation.capabilityKey,
        })
      ),
    }));

  const aiContext = buildEvidenceAiContext({
    client: input.client,
    privateIdentity: input.privateIdentity,
    document: {
      fileName: detail.document.fileName,
      evidenceType: detail.evidence.evidenceType,
      evidenceDate: detail.evidence.evidenceDate,
      purpose: detail.evidence.purpose,
      extractedText: detail.document.extractedText,
      contentHash: detail.evidence.contentHash,
    },
    approvedEvidence: approved,
    contradictions: detail.evidence.structuredEvidence.contradictoryEvidence,
  });

  const openai = getOpenAiClient();
  let structured: StructuredEvidence;
  let sourceSummary: string;
  const ANALYSE_TIMEOUT_MS = 25_000;

  try {
    if (!openai) {
      structured = buildDeterministicExtraction({
        evidenceType: detail.evidence.evidenceType,
        text: detail.document.extractedText,
      });
      sourceSummary =
        structured.observations?.[0]?.description ??
        "Deterministic extraction produced limited observations for review.";
    } else {
      const completion = await openai.chat.completions.create(
        {
          model: process.env.OPENAI_EVIDENCE_MODEL?.trim() || "gpt-4.1-mini",
          temperature: 0.2,
          messages: [
            {
              role: "system",
              content: `${EVIDENCE_ANALYSIS_SYSTEM_PROMPT}\n\n${aiContext.systemAddendum}`,
            },
            { role: "user", content: aiContext.userPrompt },
          ],
          response_format: { type: "json_object" },
        },
        { signal: AbortSignal.timeout(ANALYSE_TIMEOUT_MS) }
      );

      const content = completion.choices[0]?.message?.content ?? "{}";
      structured = validateStructuredPsychometricEvidence(
        detail.evidence.evidenceType,
        parseStructuredEvidenceJson(content)
      );
      sourceSummary =
        structured.observations?.[0]?.description ??
        "Aurelia proposed observations for human review.";

      await recordEvidenceAiUsage({
        supabase: input.supabase,
        organisationId: detail.evidence.organisationId,
        clientId: detail.evidence.clientId,
        evidenceId: detail.evidence.id,
        usageKind: "evidence_processing",
        model: completion.model,
        promptTokens: completion.usage?.prompt_tokens ?? null,
        completionTokens: completion.usage?.completion_tokens ?? null,
        contentHash: detail.evidence.contentHash,
      });
    }

    const saved = await saveAnalysedEvidence({
      supabase: input.supabase,
      userId: input.userId,
      evidenceId: detail.evidence.id,
      structured,
      sourceSummary,
    });

    return {
      evidenceId: saved.evidence.id,
      structured: saved.evidence.structuredEvidence,
      reusedExistingAnalysis: false,
    };
  } catch (error) {
    await markEvidenceAnalysisFailed({
      supabase: input.supabase,
      evidenceId: detail.evidence.id,
    });
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        "Analysis timed out. Your uploaded evidence was saved — retry analysis without re-uploading."
      );
    }
    throw error;
  }
}

function buildDeterministicExtraction(input: {
  evidenceType: Parameters<typeof preferenceFramedSummary>[0]["evidenceType"];
  text: string;
}): StructuredEvidence {
  const snippet = input.text.replace(/\s+/g, " ").trim().slice(0, 280);
  const summary = preferenceFramedSummary({
    evidenceType: input.evidenceType,
    theme: "workplace behaviour and communication preferences",
    supportingBehaviour: null,
  });

  return {
    observations: [
      {
        title: "Extracted development signal",
        description: summary,
        behaviouralEvidence: snippet || undefined,
        developmentImplication:
          "Review with the manager and decide whether this should contribute to Development Intelligence.",
        sourceConfidence: "low",
        assessmentContext:
          "Deterministic extraction used because AI analysis was unavailable.",
        limitations:
          "This is a provisional extraction for human review. It does not establish ability or future performance.",
      },
    ],
    limitations: [
      "AI analysis was unavailable; observations are provisional and require human review.",
    ],
  };
}
