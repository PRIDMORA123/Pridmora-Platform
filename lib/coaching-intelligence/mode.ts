import type { PreparationStyle } from "@/lib/preparation-style";
import {
  DEFAULT_COACHING_INTELLIGENCE_MODE,
  COACHING_INTELLIGENCE_MODE_VALUES,
} from "@/lib/coaching-intelligence/mode-config";
import type {
  CoachingIntelligenceMode,
  CoachingIntelligenceStatus,
  IntelligenceSource,
} from "@/types/coaching-intelligence";

export function isCoachingIntelligenceMode(
  value: unknown
): value is CoachingIntelligenceMode {
  return (
    typeof value === "string" &&
    (COACHING_INTELLIGENCE_MODE_VALUES as readonly string[]).includes(value)
  );
}

export function parseCoachingIntelligenceMode(
  value: unknown,
  fallback: CoachingIntelligenceMode = DEFAULT_COACHING_INTELLIGENCE_MODE
): CoachingIntelligenceMode {
  return isCoachingIntelligenceMode(value) ? value : fallback;
}

/** Bridge to the existing preparation_style column / generation pipeline. */
export function modeToPreparationStyle(
  mode: CoachingIntelligenceMode
): PreparationStyle {
  switch (mode) {
    case "manual":
      return "minimal";
    case "assisted":
      return "guided";
    case "comprehensive":
      return "enhanced";
  }
}

export function preparationStyleToMode(
  style: PreparationStyle | string | null | undefined
): CoachingIntelligenceMode {
  switch (style) {
    case "minimal":
      return "manual";
    case "enhanced":
      return "comprehensive";
    case "guided":
    default:
      return "assisted";
  }
}

export function isCoachingIntelligenceStatus(
  value: unknown
): value is CoachingIntelligenceStatus {
  return (
    value === "idle" ||
    value === "preparing" ||
    value === "ready" ||
    value === "error"
  );
}

export function parseCoachingIntelligenceStatus(
  value: unknown,
  fallback: CoachingIntelligenceStatus = "idle"
): CoachingIntelligenceStatus {
  return isCoachingIntelligenceStatus(value) ? value : fallback;
}

export function parseIntelligenceSources(value: unknown): IntelligenceSource[] {
  if (!Array.isArray(value)) return [];
  const allowed: IntelligenceSource[] = [
    "previous_conversations",
    "approved_summaries",
    "open_commitments",
    "approved_reflections",
    "journey_evidence",
    "development_themes",
    "approved_reports",
  ];
  return value.filter((item): item is IntelligenceSource =>
    allowed.includes(item as IntelligenceSource)
  );
}

export function getModeLabel(mode: CoachingIntelligenceMode): string {
  switch (mode) {
    case "manual":
      return "Manual";
    case "assisted":
      return "Standard";
    case "comprehensive":
      return "Comprehensive";
  }
}

export function getRefreshButtonLabels(mode: CoachingIntelligenceMode) {
  switch (mode) {
    case "manual":
      return {
        idle: "AI preparation off",
        loading: "AI preparation off",
        success: "AI preparation off",
      };
    case "assisted":
      return {
        idle: "Refresh assisted intelligence",
        loading: "Preparing assisted intelligence…",
        success: "Standard intelligence ready",
      };
    case "comprehensive":
      return {
        idle: "Refresh comprehensive intelligence",
        loading: "Preparing comprehensive intelligence…",
        success: "Comprehensive intelligence ready",
      };
  }
}
