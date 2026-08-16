import {
  SIX_FOUNDATIONS,
  type FoundationKey,
  type TrendDirection,
} from "@/lib/organisation-intelligence/constants";
import { calculateConfidenceLevel } from "@/lib/organisation-intelligence/confidence";
import { meetsPrivacyThreshold } from "@/lib/organisation-intelligence/suppression";
import type {
  CapabilityTrendView,
  ProgressSignalCandidate,
  ThemeView,
} from "@/lib/organisation-intelligence/types";

/**
 * Map known theme foundations onto the Pridmora Six Foundations.
 * Direction reflects theme prevalence only — not behavioural progress.
 */
export function mapCapabilityTrends(input: {
  themes: ThemeView[];
  progressSignals: ProgressSignalCandidate[];
  hasEarlierPeriodActivity: boolean;
  threshold: number;
}): CapabilityTrendView[] {
  return SIX_FOUNDATIONS.map(foundation => {
    const relatedThemes = input.themes.filter(
      theme =>
        !theme.suppressed &&
        theme.relatedCapabilities.includes(foundation.key)
    );

    const signalRows = input.progressSignals.filter(signal =>
      signalMapsToFoundation(signal.signalName, foundation.key)
    );

    const relationshipIds = new Set<string>();
    let evidenceCount = 0;
    const sourceTypes = new Set<string>();

    for (const theme of relatedThemes) {
      evidenceCount += theme.evidenceCount;
      for (let i = 0; i < theme.relationshipCount; i += 1) {
        relationshipIds.add(`${theme.themeKey}:${i}`);
      }
      theme.evidenceTypes.forEach(type => sourceTypes.add(type));
    }

    for (const signal of signalRows) {
      evidenceCount += 1;
      relationshipIds.add(signal.relationshipId);
      sourceTypes.add("progress_signal");
    }

    const relationshipCount = Math.max(
      relatedThemes.reduce((sum, theme) => sum + theme.relationshipCount, 0),
      new Set(signalRows.map(row => row.relationshipId)).size
    );

    const suppressed = !meetsPrivacyThreshold(
      relationshipCount,
      input.threshold
    );

    const direction = suppressed
      ? "insufficient_evidence"
      : deriveCapabilityPrevalenceDirection(relatedThemes);

    const confidenceLevel = calculateConfidenceLevel({
      evidenceCount,
      relationshipCount,
      sourceTypeCount: Math.max(sourceTypes.size, relatedThemes.length > 0 ? 1 : 0),
      consistentDirection:
        direction === "unchanged_prevalence" ||
        direction === "increasing_prevalence" ||
        direction === "decreasing_prevalence" ||
        direction === "stable",
      multiPeriod: input.hasEarlierPeriodActivity,
      threshold: input.threshold,
    });

    return {
      key: foundation.key,
      label: foundation.label,
      direction,
      changeLabel: directionLabel(direction),
      evidenceCount,
      relationshipCount,
      confidenceLevel,
      suppressed,
    };
  });
}

function signalMapsToFoundation(
  signalName: string,
  foundation: FoundationKey
): boolean {
  const name = signalName.toLowerCase();
  const map: Record<FoundationKey, string[]> = {
    listening_and_presence: ["presence", "listening", "attention"],
    psychological_safety: ["safety", "trust", "psychological"],
    accountability_and_ownership: [
      "accountability",
      "ownership",
      "follow",
      "commitment",
    ],
    feedback_and_conversations: [
      "feedback",
      "conversation",
      "communication",
    ],
    emotional_intelligence: [
      "emotion",
      "self-management",
      "confidence",
      "resilience",
      "boundaries",
    ],
    collaboration_and_alignment: [
      "collaboration",
      "alignment",
      "team",
      "stakeholder",
    ],
  };
  return map[foundation].some(token => name.includes(token));
}

/** Prevalence roll-up from related themes — never behavioural strengthening. */
function deriveCapabilityPrevalenceDirection(
  themes: ThemeView[]
): TrendDirection {
  const themeDirections = themes
    .map(theme => theme.direction)
    .filter(Boolean) as TrendDirection[];

  if (themeDirections.includes("increasing_prevalence")) {
    return "increasing_prevalence";
  }
  if (themeDirections.includes("decreasing_prevalence")) {
    return "decreasing_prevalence";
  }
  if (
    themeDirections.includes("unchanged_prevalence") ||
    themeDirections.includes("stable")
  ) {
    return "unchanged_prevalence";
  }
  // Legacy snapshot directions — treat as unchanged prevalence, not progress.
  if (themeDirections.includes("strengthening")) {
    return "increasing_prevalence";
  }
  if (themeDirections.includes("requiring_attention")) {
    return "decreasing_prevalence";
  }
  if (themeDirections.length === 0) {
    return "insufficient_evidence";
  }
  return "unchanged_prevalence";
}

export function directionLabel(direction: TrendDirection): string {
  switch (direction) {
    case "increasing_prevalence":
      return "Increasing prevalence";
    case "decreasing_prevalence":
      return "Decreasing prevalence";
    case "unchanged_prevalence":
    case "stable":
      return "Unchanged prevalence";
    case "up":
      return "Higher activity";
    case "down":
      return "Lower activity";
    case "strengthening":
      return "Increasing prevalence";
    case "requiring_attention":
      return "Decreasing prevalence";
    case "unavailable":
      return "No earlier comparison is available";
    default:
      return "Insufficient evidence";
  }
}

export function directionScreenReaderLabel(direction: TrendDirection): string {
  switch (direction) {
    case "increasing_prevalence":
    case "strengthening":
    case "up":
      return "Trend direction: increasing prevalence";
    case "decreasing_prevalence":
    case "requiring_attention":
    case "down":
      return "Trend direction: decreasing prevalence";
    case "unchanged_prevalence":
    case "stable":
      return "Trend direction: unchanged prevalence";
    case "unavailable":
      return "Trend direction: no earlier comparison is available";
    default:
      return "Trend direction: insufficient evidence";
  }
}
