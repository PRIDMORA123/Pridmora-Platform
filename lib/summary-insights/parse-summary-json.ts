import { extractJsonObject } from "@/lib/intelligence/schema";
import { normaliseComprehensiveExtras } from "@/lib/summary-insights/comprehensive-pack";
import { normaliseSummaryContent } from "@/lib/summary-insights/normalise-summary-content";
import { serialiseSummaryContent } from "@/lib/summary-insights/serialise-summary-content";
import {
  EMPTY_SUMMARY_INSIGHTS_CONTENT,
  SUMMARY_INSIGHTS_LIMITS,
  type SummaryInsightItem,
  type SummaryInsightsContent,
} from "@/lib/summary-insights/types";
import type { StructuredDraftSections } from "@/lib/sessions";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => asString(item))
    .filter(Boolean)
    .slice(0, limit);
}

function asInsightItems(value: unknown, limit: number): SummaryInsightItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const title = asString(record.title);
      const description = asString(record.description);
      if (!title && !description) return null;
      return { title: title || "Insight", description };
    })
    .filter((item): item is SummaryInsightItem => Boolean(item))
    .slice(0, limit);
}

export function isSummaryInsightsJson(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    "sessionSummary" in record ||
    "keyInsights" in record ||
    "strengths" in record ||
    "developmentEvidence" in record ||
    "commitments" in record ||
    "possibleNextFocus" in record
  );
}

export function parseSummaryInsightsJson(
  value: unknown
): SummaryInsightsContent | null {
  if (!isSummaryInsightsJson(value)) return null;

  const comprehensive = normaliseComprehensiveExtras(
    (value as { comprehensive?: unknown }).comprehensive
  );

  const content: SummaryInsightsContent = {
    sessionSummary: asString(value.sessionSummary) || null,
    keyInsights: asInsightItems(
      value.keyInsights,
      SUMMARY_INSIGHTS_LIMITS.keyInsights
    ),
    strengths: asInsightItems(value.strengths, SUMMARY_INSIGHTS_LIMITS.strengths),
    developmentEvidence: asInsightItems(
      value.developmentEvidence,
      SUMMARY_INSIGHTS_LIMITS.developmentEvidence
    ),
    coachingContext: asString(value.coachingContext) || null,
    commitments: asStringArray(
      value.commitments,
      SUMMARY_INSIGHTS_LIMITS.commitments
    ),
    possibleNextFocus: asStringArray(
      value.possibleNextFocus,
      SUMMARY_INSIGHTS_LIMITS.possibleNextFocus
    ),
    evidenceQualification: asString(value.evidenceQualification) || null,
    depthMode: comprehensive ? "comprehensive" : "standard",
    comprehensive,
  };

  return normaliseSummaryContent({}, content);
}

export function parseSummaryInsightsFromModel(
  text: string
): SummaryInsightsContent | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  try {
    const json = extractJsonObject(trimmed);
    return parseSummaryInsightsJson(json);
  } catch {
    return null;
  }
}

export function summaryContentToStructuredSections(
  content: SummaryInsightsContent
): StructuredDraftSections {
  const fields = serialiseSummaryContent(content);
  return {
    aiDraftSummary: fields.summary,
    emergingThemes: fields.emergingThemes,
    strengthsObserved: fields.strengthsObserved,
    valuesBecomingVisible: fields.valuesBecomingVisible,
    professionalIdentityDevelopment: fields.professionalIdentityDevelopment,
    agreedActions: fields.agreedActions,
    suggestedFocus: fields.suggestedFocus,
    coachReflection: fields.coachReflection,
  };
}

export function emptySummaryInsightsContent(): SummaryInsightsContent {
  return { ...EMPTY_SUMMARY_INSIGHTS_CONTENT };
}
