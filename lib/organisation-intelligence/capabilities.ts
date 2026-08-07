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
 * Map known theme foundations and validated progress signals onto the
 * Pridmora Six Foundations. Qualitative only — no invented percentages.
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
      // Approximate distinct relationships from theme counts without IDs.
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
      : deriveCapabilityDirection(relatedThemes, signalRows);

    const confidenceLevel = calculateConfidenceLevel({
      evidenceCount,
      relationshipCount,
      sourceTypeCount: Math.max(sourceTypes.size, relatedThemes.length > 0 ? 1 : 0),
      consistentDirection:
        direction === "strengthening" || direction === "stable",
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

function deriveCapabilityDirection(
  themes: ThemeView[],
  signals: ProgressSignalCandidate[]
): TrendDirection {
  const themeDirections = themes
    .map(theme => theme.direction)
    .filter(Boolean) as TrendDirection[];

  const improvingSignals = signals.filter(
    signal => signal.direction === "improving"
  ).length;
  const decliningSignals = signals.filter(
    signal => signal.direction === "declining"
  ).length;

  if (decliningSignals > improvingSignals) return "requiring_attention";
  if (improvingSignals > decliningSignals) return "strengthening";

  if (themeDirections.includes("requiring_attention")) {
    return "requiring_attention";
  }
  if (themeDirections.includes("strengthening")) return "strengthening";
  if (themeDirections.includes("stable")) return "stable";
  if (themeDirections.length === 0 && signals.length === 0) {
    return "insufficient_evidence";
  }
  return "stable";
}

export function directionLabel(direction: TrendDirection): string {
  switch (direction) {
    case "strengthening":
    case "up":
      return "Strengthening";
    case "requiring_attention":
    case "down":
      return "Requiring attention";
    case "stable":
      return "Stable";
    case "unavailable":
      return "No earlier comparison is available";
    default:
      return "Insufficient evidence";
  }
}

export function directionScreenReaderLabel(direction: TrendDirection): string {
  switch (direction) {
    case "strengthening":
    case "up":
      return "Trend direction: strengthening";
    case "requiring_attention":
    case "down":
      return "Trend direction: requiring attention";
    case "stable":
      return "Trend direction: stable";
    case "unavailable":
      return "Trend direction: no earlier comparison is available";
    default:
      return "Trend direction: insufficient evidence";
  }
}
