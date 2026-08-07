/**
 * Prevent materially duplicated content across Summary & Insights sections.
 * Legitimate related evidence may remain; each section must still add value.
 */

import type {
  SummaryInsightItem,
  SummaryInsightsContent,
} from "@/lib/summary-insights/types";

function normaliseText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function significantTokens(value: string): Set<string> {
  return new Set(
    normaliseText(value)
      .split(" ")
      .filter(token => token.length > 3)
  );
}

/** Jaccard-like overlap on significant tokens. */
export function textSimilarity(a: string, b: string): number {
  const left = significantTokens(a);
  const right = significantTokens(b);
  if (left.size === 0 || right.size === 0) return 0;
  let overlap = 0;
  for (const token of left) {
    if (right.has(token)) overlap += 1;
  }
  return overlap / Math.max(left.size, right.size);
}

function itemText(item: SummaryInsightItem): string {
  return `${item.title} ${item.description}`.trim();
}

function isMateriallyDuplicate(candidate: string, against: string[]): boolean {
  const normalised = normaliseText(candidate);
  if (!normalised) return true;
  for (const existing of against) {
    if (!existing) continue;
    if (normaliseText(existing) === normalised) return true;
    if (textSimilarity(candidate, existing) >= 0.72) return true;
  }
  return false;
}

function filterInsightItems(
  items: SummaryInsightItem[],
  against: string[]
): SummaryInsightItem[] {
  const kept: SummaryInsightItem[] = [];
  const localAgainst = [...against];
  for (const item of items) {
    const text = itemText(item);
    if (isMateriallyDuplicate(text, localAgainst)) continue;
    kept.push(item);
    localAgainst.push(text);
  }
  return kept;
}

/**
 * Apply section purpose separation after per-section dedupe.
 * Priority order preserves distinctive development signal:
 * Development Evidence > Strengths > Key Insights > Summary prose.
 */
export function dedupeAcrossSummarySections(
  content: SummaryInsightsContent
): SummaryInsightsContent {
  const developmentEvidence = content.developmentEvidence;
  const evidenceTexts = developmentEvidence.map(itemText);

  const strengths = filterInsightItems(content.strengths, evidenceTexts);
  const strengthTexts = [...evidenceTexts, ...strengths.map(itemText)];

  const keyInsights = filterInsightItems(content.keyInsights, strengthTexts);
  const insightTexts = [...strengthTexts, ...keyInsights.map(itemText)];

  let sessionSummary = content.sessionSummary?.trim() || null;
  if (
    sessionSummary &&
    insightTexts.some(text => textSimilarity(sessionSummary!, text) >= 0.8)
  ) {
    // Keep summary but trim if it is essentially a restatement of one insight.
    // Prefer leaving summary when it still provides conversation context.
    const words = sessionSummary.split(/\s+/);
    if (words.length > 160) {
      sessionSummary = `${words.slice(0, 150).join(" ")}…`;
    }
  }

  let coachingContext = content.coachingContext?.trim() || null;
  if (
    coachingContext &&
    isMateriallyDuplicate(coachingContext, [
      sessionSummary ?? "",
      ...insightTexts,
    ])
  ) {
    coachingContext = null;
  }

  const possibleNextFocus = content.possibleNextFocus.filter(
    focus =>
      !isMateriallyDuplicate(focus, [
        ...insightTexts,
        ...content.commitments,
        coachingContext ?? "",
      ])
  );

  return {
    ...content,
    sessionSummary,
    keyInsights,
    strengths,
    developmentEvidence,
    coachingContext,
    possibleNextFocus,
  };
}
