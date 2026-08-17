import type { SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import {
  ORGANISATION_INTELLIGENCE_RETRY_ADDON,
  ORGANISATION_INTELLIGENCE_SYSTEM_PROMPT,
  buildOrganisationIntelligencePromptInput,
} from "@/lib/ai/organisation-intelligence-prompt";
import { buildOrganisationIntelligenceSnapshotView } from "@/lib/organisation-intelligence/build-snapshot";
import {
  ORGANISATION_INTELLIGENCE_PRIVACY_THRESHOLD,
  GENERATION_STAGE_LABELS,
  type GenerationStage,
  type PeriodPreset,
} from "@/lib/organisation-intelligence/constants";
import { resolveOrganisationIntelligencePeriod } from "@/lib/organisation-intelligence/periods";
import {
  acquireGenerationLock,
  fetchOrganisationIntelligenceSources,
  insertGeneratingSnapshot,
  markSnapshotFailed,
  persistSnapshotView,
  releaseGenerationLock,
} from "@/lib/organisation-intelligence/repository";
import {
  collectAllowedNumbers,
  validateOrganisationIntelligenceBrief,
} from "@/lib/organisation-intelligence/validate-output";
import type { OrganisationIntelligenceSnapshotView } from "@/lib/organisation-intelligence/types";

export type GenerateOrganisationIntelligenceResult =
  | {
      ok: true;
      view: OrganisationIntelligenceSnapshotView;
      stage: GenerationStage;
    }
  | {
      ok: false;
      error: string;
      code?: "locked" | "generation_failed" | "validation_failed";
    };

async function generateExecutiveBriefWithAi(input: {
  promptInput: ReturnType<typeof buildOrganisationIntelligencePromptInput>;
  allowedNumbers: number[];
  visibleThemeLabels?: string[];
}): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const openai = new OpenAI({ apiKey });
  let userPrompt = input.promptInput;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await openai.responses.create({
      model: process.env.OPENAI_ORG_INTELLIGENCE_MODEL?.trim() || "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content: ORGANISATION_INTELLIGENCE_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content:
            attempt === 0
              ? userPrompt
              : `${userPrompt}\n\n${ORGANISATION_INTELLIGENCE_RETRY_ADDON}`,
        },
      ],
      store: false,
    });

    const text = response.output_text?.trim() || "";
    const validation = validateOrganisationIntelligenceBrief(
      text,
      input.allowedNumbers,
      { visibleThemeLabels: input.visibleThemeLabels }
    );
    if (validation.ok) return validation.brief;
  }

  return null;
}

export async function generateOrganisationIntelligence(input: {
  supabase: SupabaseClient;
  organisationId: string;
  organisationName: string;
  userId: string;
  preset?: PeriodPreset | string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
}): Promise<GenerateOrganisationIntelligenceResult> {
  const period = resolveOrganisationIntelligencePeriod({
    preset: input.preset,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
  });

  const snapshotId = await insertGeneratingSnapshot({
    supabase: input.supabase,
    organisationId: input.organisationId,
    period,
    userId: input.userId,
    privacyThreshold: ORGANISATION_INTELLIGENCE_PRIVACY_THRESHOLD,
  });

  const lock = await acquireGenerationLock({
    supabase: input.supabase,
    organisationId: input.organisationId,
    userId: input.userId,
    snapshotId,
  });

  if (!lock.ok) {
    await markSnapshotFailed({
      supabase: input.supabase,
      snapshotId,
      message: "Generation already in progress.",
    });
    return {
      ok: false,
      error: "Intelligence generation is already in progress for this organisation.",
      code: "locked",
    };
  }

  try {
    // Stage: gathering evidence
    // Authz already enforced by the generate route (intelligence.organisation.read).
    // Raw RPC is service-role only — never call with the Lead JWT.
    void GENERATION_STAGE_LABELS.gathering_evidence;
    const aggregates = await fetchOrganisationIntelligenceSources(
      input.organisationId,
      period
    );

    // Stage: calculating trends
    let view = buildOrganisationIntelligenceSnapshotView({
      id: snapshotId,
      organisationId: input.organisationId,
      organisationName: input.organisationName,
      period,
      generatedAt: new Date().toISOString(),
      generatedBy: input.userId,
      aggregates,
      status: "ready",
    });

    // Stage: preparing executive brief (Lead-safe payload only; deterministic is canonical)
    if (!view.emptyState) {
      const promptPayload = {
        organisationName: input.organisationName,
        periodLabel: period.label,
        comparisonLabel: period.comparisonLabel,
        comparisonAvailable: aggregates.hasEarlierPeriodActivity,
        confidenceLevel: view.confidenceLevel,
        sourceRelationshipCount: view.sourceRelationshipCount,
        sourceConversationCount: view.sourceConversationCount,
        sourceEvidenceCount: view.sourceEvidenceCount,
        restrictedEvidenceExcluded: view.restrictedEvidenceExcluded,
        privacyThreshold: view.privacyThreshold,
        metrics: view.metrics
          .filter(metric => !metric.suppressed)
          .map(metric => ({
            key: metric.metricKey,
            label: metric.metricLabel,
            value: metric.displayValue,
            direction: metric.direction,
            confidence: metric.confidenceLevel,
            evidenceCount: metric.evidenceCount,
            relationshipCount: metric.relationshipCount,
            suppressed: false,
          })),
        themes: view.themes.map(theme => ({
          key: theme.themeKey,
          label: theme.themeLabel,
          direction: theme.direction,
          confidence: theme.confidenceLevel,
          evidenceCount: theme.evidenceCount,
          relationshipCount: theme.relationshipCount,
          summary: theme.summary,
          evidencePosture:
            typeof theme.metadata?.evidencePosture === "string"
              ? theme.metadata.evidencePosture
              : null,
        })),
        // Foundations excluded from buyer narrative — do not supply to AI.
        capabilities: [] as Array<{
          key: string;
          label: string;
          direction: string;
          confidence: string;
          evidenceCount: number;
          relationshipCount: number;
          suppressed: boolean;
        }>,
        recommendations: view.recommendations.map(row => ({
          title: row.title,
          rationale: row.rationale,
          recommendation: row.recommendation,
          confidence: row.confidenceLevel,
        })),
        visibleThemeKeys: view.themes.map(theme => theme.themeKey),
        visibleThemeLabels: view.themes.map(theme => theme.themeLabel),
      };

      const allowedNumbers = collectAllowedNumbers([
        view.sourceRelationshipCount,
        view.sourceConversationCount,
        view.sourceEvidenceCount,
        view.privacyThreshold,
        ...view.metrics.flatMap(metric => [
          metric.metricValue,
          metric.previousValue,
          metric.evidenceCount,
          metric.relationshipCount,
        ]),
        ...view.themes.flatMap(theme => [
          theme.evidenceCount,
          theme.relationshipCount,
        ]),
      ]);

      try {
        const aiBrief = await generateExecutiveBriefWithAi({
          promptInput: buildOrganisationIntelligencePromptInput(promptPayload),
          allowedNumbers,
          visibleThemeLabels: promptPayload.visibleThemeLabels,
        });
        if (aiBrief) {
          view = { ...view, executiveBrief: aiBrief };
        }
      } catch {
        // Keep deterministic brief already present on the view.
      }
    }

    // Stage: completing checks
    if (view.executiveBrief) {
      const validation = validateOrganisationIntelligenceBrief(
        view.executiveBrief,
        collectAllowedNumbers([
          view.sourceRelationshipCount,
          view.sourceConversationCount,
          view.sourceEvidenceCount,
          ...view.metrics.map(metric => metric.metricValue),
        ]),
        { visibleThemeLabels: view.themes.map(theme => theme.themeLabel) }
      );
      if (!validation.ok) {
        // Fall back to deterministic brief rather than failing the snapshot.
        view = buildOrganisationIntelligenceSnapshotView({
          id: snapshotId,
          organisationId: input.organisationId,
          organisationName: input.organisationName,
          period,
          generatedAt: view.generatedAt,
          generatedBy: input.userId,
          aggregates,
          status: "ready",
        });
      }
    }

    await persistSnapshotView({
      supabase: input.supabase,
      view,
    });

    return {
      ok: true,
      view,
      stage: "completing_checks",
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Intelligence generation failed.";
    await markSnapshotFailed({
      supabase: input.supabase,
      snapshotId,
      message,
    });
    return {
      ok: false,
      error: message,
      code: "generation_failed",
    };
  } finally {
    await releaseGenerationLock({
      supabase: input.supabase,
      organisationId: input.organisationId,
    });
  }
}
