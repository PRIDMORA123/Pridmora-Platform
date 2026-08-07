import {
  COMPREHENSIVE_MARKER,
  SUMMARY_INSIGHTS_LIMITS,
  type SummaryInsightItem,
  type SummaryInsightsComprehensiveExtras,
} from "@/lib/summary-insights/types";

function asInsightItems(value: unknown, limit: number): SummaryInsightItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const title = typeof record.title === "string" ? record.title.trim() : "";
      const description =
        typeof record.description === "string" ? record.description.trim() : "";
      if (!title && !description) return null;
      return { title: title || "Pattern", description };
    })
    .filter((item): item is SummaryInsightItem => Boolean(item))
    .slice(0, limit);
}

function asStringArray(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, limit);
}

export function normaliseComprehensiveExtras(
  value: unknown
): SummaryInsightsComprehensiveExtras | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const extras: SummaryInsightsComprehensiveExtras = {
    developmentTrajectory:
      typeof record.developmentTrajectory === "string"
        ? record.developmentTrajectory.trim() || null
        : null,
    behaviouralPatterns: asInsightItems(
      record.behaviouralPatterns,
      SUMMARY_INSIGHTS_LIMITS.behaviouralPatterns
    ),
    evidenceConfidenceNote:
      typeof record.evidenceConfidenceNote === "string"
        ? record.evidenceConfidenceNote.trim() || null
        : null,
    evidenceCoverageNote:
      typeof record.evidenceCoverageNote === "string"
        ? record.evidenceCoverageNote.trim() || null
        : null,
    contradictoryOrLimitedEvidence: asStringArray(
      record.contradictoryOrLimitedEvidence,
      SUMMARY_INSIGHTS_LIMITS.contradictoryOrLimitedEvidence
    ),
    developmentRisks: asStringArray(
      record.developmentRisks,
      SUMMARY_INSIGHTS_LIMITS.developmentRisks
    ),
    recommendedNextConversation:
      typeof record.recommendedNextConversation === "string"
        ? record.recommendedNextConversation.trim() || null
        : null,
  };

  const hasContent = Boolean(
    extras.developmentTrajectory ||
      (extras.behaviouralPatterns && extras.behaviouralPatterns.length > 0) ||
      extras.evidenceConfidenceNote ||
      extras.evidenceCoverageNote ||
      (extras.contradictoryOrLimitedEvidence &&
        extras.contradictoryOrLimitedEvidence.length > 0) ||
      (extras.developmentRisks && extras.developmentRisks.length > 0) ||
      extras.recommendedNextConversation
  );

  return hasContent ? extras : null;
}

export function packQualificationAndComprehensive(input: {
  qualification?: string | null;
  comprehensive?: SummaryInsightsComprehensiveExtras | null;
}): string {
  const qualification = input.qualification?.trim() || "";
  const comprehensive = normaliseComprehensiveExtras(input.comprehensive);
  if (!comprehensive) return qualification;
  const packed = `${qualification}\n\n${COMPREHENSIVE_MARKER}\n${JSON.stringify(comprehensive)}`;
  return packed.trim();
}

export function unpackQualificationAndComprehensive(raw: string): {
  qualification: string | null;
  comprehensive: SummaryInsightsComprehensiveExtras | null;
} {
  const text = raw.trim();
  if (!text) {
    return { qualification: null, comprehensive: null };
  }

  const markerIndex = text.indexOf(COMPREHENSIVE_MARKER);
  if (markerIndex === -1) {
    return { qualification: text, comprehensive: null };
  }

  const qualification = text.slice(0, markerIndex).trim() || null;
  const jsonPart = text
    .slice(markerIndex + COMPREHENSIVE_MARKER.length)
    .trim();
  try {
    return {
      qualification,
      comprehensive: normaliseComprehensiveExtras(JSON.parse(jsonPart)),
    };
  } catch {
    return { qualification: text, comprehensive: null };
  }
}

export function hasComprehensiveExtras(
  extras: SummaryInsightsComprehensiveExtras | null | undefined
): boolean {
  return Boolean(normaliseComprehensiveExtras(extras));
}
