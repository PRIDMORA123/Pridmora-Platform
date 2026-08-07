/**
 * Organisation Intelligence constants and shared labels.
 * UK English. Aggregated evidence only.
 */

/** Minimum contributing relationships before a theme/subgroup is displayed. */
export const ORGANISATION_INTELLIGENCE_PRIVACY_THRESHOLD = 5;

export const CONFIDENCE_LEVELS = ["low", "moderate", "high"] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export const PERIOD_PRESETS = [
  "last_30_days",
  "last_90_days",
  "last_12_months",
  "custom",
] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export const DEFAULT_PERIOD_PRESET: PeriodPreset = "last_90_days";

export const TREND_DIRECTIONS = [
  "up",
  "down",
  "stable",
  "strengthening",
  "requiring_attention",
  "insufficient_evidence",
  "unavailable",
] as const;
export type TrendDirection = (typeof TREND_DIRECTIONS)[number];

export const SNAPSHOT_STATUSES = [
  "generating",
  "ready",
  "failed",
  "superseded",
] as const;
export type SnapshotStatus = (typeof SNAPSHOT_STATUSES)[number];

export const GENERATION_STAGES = [
  "gathering_evidence",
  "calculating_trends",
  "preparing_executive_brief",
  "completing_checks",
] as const;
export type GenerationStage = (typeof GENERATION_STAGES)[number];

export const GENERATION_STAGE_LABELS: Record<GenerationStage, string> = {
  gathering_evidence: "Gathering evidence",
  calculating_trends: "Calculating trends",
  preparing_executive_brief: "Preparing executive brief",
  completing_checks: "Completing checks",
};

export const MOMENTUM_METHODOLOGY = [
  "Development Momentum is a directional measure of sustained coaching activity, action and recorded development.",
  "It is weighted from completed conversations, completed actions, completed reflections, development updates and evidence progression in the selected period.",
  "It is not a scientific or validated psychological score.",
].join(" ");

export const PRIVACY_NOTE =
  "Organisation Intelligence uses anonymised aggregated coaching evidence only. Private identity, session notes and confidential relationship details are never shown.";

export const INSUFFICIENT_EVIDENCE_COPY =
  "Not enough evidence to report safely.";

export const NO_COMPARISON_COPY = "No earlier comparison is available.";

export const SIX_FOUNDATIONS = [
  {
    key: "listening_and_presence",
    label: "Listening and Presence",
  },
  {
    key: "psychological_safety",
    label: "Psychological Safety",
  },
  {
    key: "accountability_and_ownership",
    label: "Accountability and Ownership",
  },
  {
    key: "feedback_and_conversations",
    label: "Feedback and Conversations",
  },
  {
    key: "emotional_intelligence",
    label: "Emotional Intelligence and Self-Management",
  },
  {
    key: "collaboration_and_alignment",
    label: "Collaboration and Alignment",
  },
] as const;

export type FoundationKey = (typeof SIX_FOUNDATIONS)[number]["key"];

/** Known anonymised theme keys used for safe aggregation. */
export const KNOWN_THEME_CATALOGUE: ReadonlyArray<{
  key: string;
  label: string;
  aliases: readonly string[];
  foundations: readonly FoundationKey[];
}> = [
  {
    key: "confidence",
    label: "Confidence",
    aliases: ["confidence", "self belief", "self-belief", "assurance"],
    foundations: ["emotional_intelligence", "listening_and_presence"],
  },
  {
    key: "feedback",
    label: "Feedback",
    aliases: ["feedback", "giving feedback", "receiving feedback"],
    foundations: ["feedback_and_conversations"],
  },
  {
    key: "delegation",
    label: "Delegation",
    aliases: ["delegation", "delegating", "letting go"],
    foundations: ["accountability_and_ownership", "collaboration_and_alignment"],
  },
  {
    key: "difficult_conversations",
    label: "Difficult conversations",
    aliases: [
      "difficult conversations",
      "challenging conversations",
      "tough conversations",
      "hard conversations",
    ],
    foundations: ["feedback_and_conversations", "psychological_safety"],
  },
  {
    key: "accountability",
    label: "Accountability",
    aliases: ["accountability", "ownership", "follow through", "follow-through"],
    foundations: ["accountability_and_ownership"],
  },
  {
    key: "role_transition",
    label: "Role transition",
    aliases: [
      "role transition",
      "new role",
      "transition",
      "promotion",
      "stepping up",
    ],
    foundations: ["emotional_intelligence", "collaboration_and_alignment"],
  },
  {
    key: "psychological_safety",
    label: "Psychological safety",
    aliases: ["psychological safety", "safety", "trust", "speaking up"],
    foundations: ["psychological_safety"],
  },
  {
    key: "presence",
    label: "Presence",
    aliases: ["presence", "listening", "attention", "being present"],
    foundations: ["listening_and_presence"],
  },
  {
    key: "collaboration",
    label: "Collaboration",
    aliases: ["collaboration", "alignment", "teamwork", "stakeholder"],
    foundations: ["collaboration_and_alignment"],
  },
  {
    key: "boundaries",
    label: "Boundaries and workload",
    aliases: ["boundaries", "workload", "priorities", "capacity"],
    foundations: ["emotional_intelligence", "accountability_and_ownership"],
  },
];

export const SENSITIVE_THEME_PATTERNS = [
  /\b(suicid\w*|self[-\s]?harm|abuse|assault|harassment|bullying)\b/i,
  /\b(diagnos\w*|disorder|depression|anxiety disorder|ptsd|therapy|therapist)\b/i,
  /\b(disciplinary|grievance|safeguard\w*|whistleblow\w*|medical leave)\b/i,
  /\b(alcohol|drug|addiction|substance)\b/i,
] as const;
