/**
 * Coach preparation support preferences.
 *
 * Effective style resolution:
 *   client override → coach preference → guided fallback
 *
 * Future enhancement (not in Release 1): infrequent preference suggestions
 * based on coach usage, with explicit consent and no automatic changes.
 */

export const PREPARATION_STYLES = ["minimal", "guided", "enhanced"] as const;

export type PreparationStyle = (typeof PREPARATION_STYLES)[number];

export const DEFAULT_PREPARATION_STYLE: PreparationStyle = "guided";

/** User-facing labels. Stored values remain minimal | guided | enhanced. */
export const PREPARATION_STYLE_LABELS: Record<PreparationStyle, string> = {
  minimal: "Manual",
  guided: "Standard",
  enhanced: "Comprehensive",
};

/** Short coach-facing descriptions shown beneath the selected approach. */
export const PREPARATION_STYLE_DESCRIPTIONS: Record<PreparationStyle, string> =
  {
    minimal:
      "No AI preparation. Use your own notes and professional judgement.",
    guided: "Concise insight for everyday management use.",
    enhanced:
      "Deeper analysis across development history, evidence and behavioural patterns.",
  };

/** Compact level labels shown beside the selected approach name. */
export const PREPARATION_STYLE_SHORT_DESCRIPTIONS: Record<
  PreparationStyle,
  string
> = {
  minimal: "No AI",
  guided: "Everyday insight",
  enhanced: "Longitudinal depth",
};

export type PreparationStyleSelectorCopy = {
  value: PreparationStyle;
  label: string;
  shortDescription: string;
  summary: string;
  bestFor: string;
  recommended?: boolean;
};

/** Copy for the approach selector cards. */
export const PREPARATION_STYLE_SELECTOR_OPTIONS: PreparationStyleSelectorCopy[] =
  [
    {
      value: "minimal",
      label: PREPARATION_STYLE_LABELS.minimal,
      shortDescription: PREPARATION_STYLE_SHORT_DESCRIPTIONS.minimal,
      summary: "Use your own preparation without generated guidance.",
      bestFor: "Coaches who want a completely manual process.",
    },
    {
      value: "guided",
      label: PREPARATION_STYLE_LABELS.guided,
      shortDescription: PREPARATION_STYLE_SHORT_DESCRIPTIONS.guided,
      summary:
        "Uses the latest approved evidence to suggest a focus and useful questions.",
      bestFor: "Everyday preparation before most development conversations.",
      recommended: true,
    },
    {
      value: "enhanced",
      label: PREPARATION_STYLE_LABELS.enhanced,
      shortDescription: PREPARATION_STYLE_SHORT_DESCRIPTIONS.enhanced,
      summary:
        "Uses the wider approved development journey to identify themes, patterns, evidence confidence and deeper questions.",
      bestFor: "Complex or continuing development relationships.",
    },
  ];

export const PREPARATION_STYLE_OPTIONS: Array<{
  value: PreparationStyle;
  label: string;
  description: string;
  recommended?: boolean;
}> = PREPARATION_STYLE_SELECTOR_OPTIONS.map(option => ({
  value: option.value,
  label: option.label,
  description: PREPARATION_STYLE_DESCRIPTIONS[option.value],
  recommended: option.recommended,
}));

export type PreparationApproachScope = "session" | "relationship" | "default";

export function preparationApproachScopeCopy(
  scope: PreparationApproachScope
): string {
  switch (scope) {
    case "session":
      return "This approach applies to this preparation only.";
    case "relationship":
      return "This approach will be used for future preparation in this coaching relationship.";
    case "default":
      return "This approach uses your default preparation preference.";
  }
}

export function isPreparationStyle(value: unknown): value is PreparationStyle {
  return (
    typeof value === "string" &&
    (PREPARATION_STYLES as readonly string[]).includes(value)
  );
}

export function parsePreparationStyle(
  value: unknown,
  fallback: PreparationStyle = DEFAULT_PREPARATION_STYLE
): PreparationStyle {
  return isPreparationStyle(value) ? value : fallback;
}

export function parsePreparationStyleOverride(
  value: unknown
): PreparationStyle | null {
  if (value === null || value === undefined || value === "") return null;
  return isPreparationStyle(value) ? value : null;
}

/**
 * Resolve the effective preparation style for a coaching relationship.
 */
export function resolvePreparationStyle(
  coachStyle: PreparationStyle | string | null | undefined,
  clientOverride: PreparationStyle | string | null | undefined
): PreparationStyle {
  const override = parsePreparationStyleOverride(clientOverride);
  if (override) return override;
  return parsePreparationStyle(coachStyle, DEFAULT_PREPARATION_STYLE);
}

/** Guidance-only estimated review times (minutes). */
export function estimatedReviewMinutes(style: PreparationStyle): number {
  switch (style) {
    case "minimal":
      return 2;
    case "guided":
      return 4;
    case "enhanced":
      return 7;
  }
}

export function estimatedReviewLabel(style: PreparationStyle): string {
  return `Approximately ${estimatedReviewMinutes(style)} minutes`;
}

export type PreparationSectionVisibility = {
  showAiSupport: boolean;
  showThemes: boolean;
  showExploration: boolean;
  showSuggestedQuestions: boolean;
  showCoachReflection: boolean;
  showPatterns: boolean;
  showDevelopmentDirection: boolean;
  showHistoricalContext: boolean;
  showAdditionalQuestions: boolean;
};

export function preparationSectionVisibility(
  style: PreparationStyle
): PreparationSectionVisibility {
  const guidedOrMore = style === "guided" || style === "enhanced";
  const enhanced = style === "enhanced";
  return {
    showAiSupport: guidedOrMore,
    showThemes: guidedOrMore,
    showExploration: guidedOrMore,
    showSuggestedQuestions: guidedOrMore,
    showCoachReflection: guidedOrMore,
    showPatterns: enhanced,
    showDevelopmentDirection: enhanced,
    showHistoricalContext: enhanced,
    showAdditionalQuestions: enhanced,
  };
}

export function effectiveStyleDescription(
  effective: PreparationStyle,
  clientOverride: PreparationStyle | null | undefined
): string {
  const label =
    PREPARATION_STYLE_LABELS[effective] ?? PREPARATION_STYLE_LABELS.guided;
  if (clientOverride) {
    return `${label} — selected for this client`;
  }
  return `${label} — using your default`;
}
