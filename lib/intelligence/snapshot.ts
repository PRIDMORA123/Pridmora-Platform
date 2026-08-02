import type {
  IntelligenceItem,
  IntelligenceSnapshot,
} from "@/lib/intelligence/types";

function topByCategory(
  items: IntelligenceItem[],
  category: string,
  fallback: string
): string {
  const match = items
    .filter(
      item =>
        item.status === "approved" &&
        !item.archivedAt &&
        item.category === category
    )
    .sort((a, b) => {
      const scoreDiff = (b.confidenceScore ?? 0) - (a.confidenceScore ?? 0);
      if (scoreDiff !== 0) return scoreDiff;
      return (b.evidenceCount ?? 0) - (a.evidenceCount ?? 0);
    })[0];
  return match?.title ?? fallback;
}

export function buildIntelligenceSnapshot(
  approved: IntelligenceItem[],
  allItems: IntelligenceItem[],
  nextSuggestedFocus = ""
): IntelligenceSnapshot {
  const awaitingReviewCount = allItems.filter(
    item => item.status === "proposed" && !item.archivedAt
  ).length;

  const opportunity = approved.find(
    item => item.category === "development_opportunity" && !item.archivedAt
  );
  const goal = approved.find(item => item.category === "goal" && !item.archivedAt);

  return {
    currentDevelopmentFocus:
      opportunity?.title || goal?.title || nextSuggestedFocus || "Not yet established",
    strongestSupportedStrength: topByCategory(
      approved,
      "strength",
      "No approved strengths yet"
    ),
    mostSupportedValue: topByCategory(approved, "value", "No approved values yet"),
    primaryRecurringTheme: topByCategory(
      approved,
      "recurring_theme",
      "No approved themes yet"
    ),
    nextSuggestedFocus: nextSuggestedFocus || opportunity?.title || "Review recent conversations",
    awaitingReviewCount,
  };
}
