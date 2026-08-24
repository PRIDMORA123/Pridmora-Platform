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
  EVIDENCE_ANALYSIS_ATTEMPT_TIMEOUT_MS,
  EVIDENCE_ANALYSIS_MAX_COMPLETION_TOKENS,
} from "@/lib/development-evidence/constants";
import { constrainStructuredEvidenceObservations } from "@/lib/development-evidence/constrain-observations";
import {
  preferenceFramedSummary,
  validateStructuredPsychometricEvidence,
} from "@/lib/development-evidence/psychometrics";
import {
  findExistingByContentHash,
  getEvidenceById,
  listEvidenceForClient,
  beginEvidenceAnalysisRun,
  markEvidenceAnalysisFailed,
  recordEvidenceAiUsage,
  saveAnalysedEvidence,
} from "@/lib/development-evidence/repository";
import type { StructuredEvidence } from "@/lib/development-evidence/types";
import type { PrivateIdentityFields } from "@/lib/relationship-identity";
import {
  createPersonLevelChatCompletion,
} from "@/lib/ai/person-level-openai";
import { knownIdentitiesFromPublicClient } from "@/lib/ai/minimise-for-external";
import type { SupabaseClient } from "@supabase/supabase-js";

/** AI analysis attempts including the first try (one bounded retry). */
export const EVIDENCE_ANALYSIS_MAX_ATTEMPTS = 2;

export {
  EVIDENCE_ANALYSIS_ATTEMPT_TIMEOUT_MS,
  EVIDENCE_ANALYSIS_MAX_COMPLETION_TOKENS,
  EVIDENCE_ANALYSIS_MAX_OBSERVATIONS,
  EVIDENCE_ANALYSIS_MAX_OBSERVATIONS_PSYCHOMETRIC,
} from "@/lib/development-evidence/constants";

export const ZERO_OBSERVATION_ANALYSIS_USER_MESSAGE =
  "Analysis could not extract usable developmental observations from this evidence. The upload was saved — retry analysis, or upload a clearer text-based file. No observations were manufactured.";

function getOpenAiClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;
  return new OpenAI({ apiKey: key });
}

/** Observation is usable when it has both a non-empty title and description. */
export function hasUsableAnalysisObservations(
  structured: StructuredEvidence | null | undefined
): boolean {
  const observations = structured?.observations ?? [];
  return observations.some(observation => {
    const title = String(observation.title ?? "").trim();
    const description = String(observation.description ?? "").trim();
    return title.length > 0 && description.length > 0;
  });
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

  const extractedText = detail.document?.extractedText?.replace(/\s+/g, " ").trim() ?? "";
  if (!extractedText) {
    await markEvidenceAnalysisFailed({
      supabase: input.supabase,
      evidenceId: detail.evidence.id,
      actorUserId: input.userId,
    });
    throw new Error(
      "No readable text is available to analyse. The evidence was saved — export the DISC report as text or a text-based PDF and retry, or re-upload a clearer file."
    );
  }
  if (extractedText.length < 40) {
    await markEvidenceAnalysisFailed({
      supabase: input.supabase,
      evidenceId: detail.evidence.id,
      actorUserId: input.userId,
    });
    throw new Error(
      "Extracted text is too limited for reliable analysis. The evidence was saved — try a text-based PDF or plain-text export, then retry analysis."
    );
  }

  if (
    !input.force &&
    detail.evidence.contentHash &&
    detail.evidence.processingStatus === "ready" &&
    hasUsableAnalysisObservations(detail.evidence.structuredEvidence)
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
      hasUsableAnalysisObservations(existing.structuredEvidence)
    ) {
      const saved = await saveAnalysedEvidence({
        supabase: input.supabase,
        userId: input.userId,
        evidenceId: detail.evidence.id,
        structured: existing.structuredEvidence,
        sourceSummary: existing.sourceSummary,
        extractedSourceText: extractedText,
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
      fileName: detail.document?.fileName,
      evidenceType: detail.evidence.evidenceType,
      evidenceDate: detail.evidence.evidenceDate,
      purpose: detail.evidence.purpose,
      extractedText,
      contentHash: detail.evidence.contentHash,
    },
    approvedEvidence: approved,
    contradictions: detail.evidence.structuredEvidence.contradictoryEvidence,
  });

  const openai = getOpenAiClient();
  let structured: StructuredEvidence;
  let sourceSummary: string;
  let analysisDiagnostics: Record<string, unknown> | undefined;

  try {
    // Withdraw any prior intelligence authorisation before replacing analysis.
    await beginEvidenceAnalysisRun({
      supabase: input.supabase,
      userId: input.userId,
      evidenceId: detail.evidence.id,
      force: Boolean(input.force),
    });

    if (!openai) {
      structured = constrainStructuredEvidenceObservations(
        buildDeterministicExtraction({
          evidenceType: detail.evidence.evidenceType,
          text: extractedText,
        }),
        detail.evidence.evidenceType
      );
      sourceSummary =
        structured.observations?.[0]?.description ??
        "Deterministic extraction produced limited observations for review.";
      if (!hasUsableAnalysisObservations(structured)) {
        await markEvidenceAnalysisFailed({
          supabase: input.supabase,
          evidenceId: detail.evidence.id,
          actorUserId: input.userId,
          analysisDiagnostics: { reason: "zero_usable_observations" },
        });
        throw new Error(ZERO_OBSERVATION_ANALYSIS_USER_MESSAGE);
      }
    } else {
      let lastStructured: StructuredEvidence = { observations: [] };
      let lastSummary =
        "Aurelia proposed observations for human review.";
      let succeeded = false;
      const attemptDiagnostics: Array<Record<string, unknown>> = [];

      for (
        let attempt = 1;
        attempt <= EVIDENCE_ANALYSIS_MAX_ATTEMPTS;
        attempt += 1
      ) {
        const startedAt = Date.now();
        let finishReason: string | null = null;
        let completionTokens: number | null = null;
        try {
          const completion = await createPersonLevelChatCompletion(
            openai,
            {
              model: process.env.OPENAI_EVIDENCE_MODEL?.trim() || "gpt-4.1-mini",
              temperature: 0.2,
              max_tokens: EVIDENCE_ANALYSIS_MAX_COMPLETION_TOKENS,
              messages: [
                {
                  role: "system",
                  content: `${EVIDENCE_ANALYSIS_SYSTEM_PROMPT}\n\n${aiContext.systemAddendum}`,
                },
                { role: "user", content: aiContext.userPrompt },
              ],
              response_format: { type: "json_object" },
            },
            knownIdentitiesFromPublicClient(input.client),
            { signal: AbortSignal.timeout(EVIDENCE_ANALYSIS_ATTEMPT_TIMEOUT_MS) }
          );

          finishReason = completion.finishReason;
          completionTokens = completion.completionTokens;
          attemptDiagnostics.push({
            attempt,
            elapsedMs: Date.now() - startedAt,
            finishReason,
            promptTokens: completion.promptTokens,
            completionTokens,
            model: completion.model,
          });

          const content = completion.content || "{}";
          lastStructured = constrainStructuredEvidenceObservations(
            validateStructuredPsychometricEvidence(
              detail.evidence.evidenceType,
              parseStructuredEvidenceJson(content)
            ),
            detail.evidence.evidenceType
          );
          lastSummary =
            lastStructured.observations?.[0]?.description ??
            "Aurelia proposed observations for human review.";

          await recordEvidenceAiUsage({
            supabase: input.supabase,
            organisationId: detail.evidence.organisationId,
            clientId: detail.evidence.clientId,
            evidenceId: detail.evidence.id,
            usageKind: "evidence_processing",
            model: completion.model,
            promptTokens: completion.promptTokens,
            completionTokens,
            contentHash: detail.evidence.contentHash,
          });

          if (hasUsableAnalysisObservations(lastStructured)) {
            succeeded = true;
            break;
          }
        } catch (attemptError) {
          attemptDiagnostics.push({
            attempt,
            elapsedMs: Date.now() - startedAt,
            finishReason:
              finishReason ??
              (isAnalyseTimeoutError(attemptError) ? "timeout" : "error"),
            completionTokens,
            error:
              attemptError instanceof Error
                ? attemptError.message
                : String(attemptError),
          });
          analysisDiagnostics = {
            reason: isAnalyseTimeoutError(attemptError)
              ? "timeout"
              : "analyse_error",
            attempts: attemptDiagnostics,
          };
          throw attemptError;
        }
      }

      analysisDiagnostics = {
        reason: succeeded ? "completed" : "zero_usable_observations",
        attempts: attemptDiagnostics,
      };

      if (!succeeded) {
        await markEvidenceAnalysisFailed({
          supabase: input.supabase,
          evidenceId: detail.evidence.id,
          actorUserId: input.userId,
          analysisDiagnostics,
        });
        throw new Error(ZERO_OBSERVATION_ANALYSIS_USER_MESSAGE);
      }

      structured = lastStructured;
      sourceSummary = lastSummary;
    }

    const saved = await saveAnalysedEvidence({
      supabase: input.supabase,
      userId: input.userId,
      evidenceId: detail.evidence.id,
      structured: constrainStructuredEvidenceObservations(
        structured,
        detail.evidence.evidenceType
      ),
      sourceSummary,
      extractedSourceText: extractedText,
      analysisDiagnostics,
    });

    return {
      evidenceId: saved.evidence.id,
      structured: saved.evidence.structuredEvidence,
      reusedExistingAnalysis: false,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === ZERO_OBSERVATION_ANALYSIS_USER_MESSAGE
    ) {
      throw error;
    }
    await markEvidenceAnalysisFailed({
      supabase: input.supabase,
      evidenceId: detail.evidence.id,
      actorUserId: input.userId,
      analysisDiagnostics: analysisDiagnostics ?? {
        reason: isAnalyseTimeoutError(error) ? "timeout" : "analyse_error",
        error: error instanceof Error ? error.message : String(error),
      },
    });
    if (isAnalyseTimeoutError(error)) {
      throw new Error(
        "Analysis timed out. Your uploaded evidence was saved — retry analysis without re-uploading."
      );
    }
    throw error;
  }
}

function isAnalyseTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (
    error.name === "AbortError" ||
    error.name === "TimeoutError" ||
    error.name === "APIUserAbortError"
  ) {
    return true;
  }
  return /timeout|timed out|aborted/i.test(error.message);
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
