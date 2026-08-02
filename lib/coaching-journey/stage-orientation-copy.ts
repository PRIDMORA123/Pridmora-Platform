import type { CoachingJourneyStageId } from "@/lib/coaching-journey/coaching-journey";

export type StageOrientationCopy = {
  /** Uppercase stage label shown above the title. Defaults to title when omitted. */
  eyebrow?: string;
  title: string;
  description: string;
  optional?: boolean;
};

/** Canonical stage orientation copy for the six journey pages. */
export const STAGE_ORIENTATION_COPY: Record<
  CoachingJourneyStageId,
  StageOrientationCopy
> = {
  current_position: {
    eyebrow: "Current Position",
    title: "Current Position",
    description: "Where the client is now and what needs attention next.",
  },
  prepare: {
    eyebrow: "Prepare",
    title: "Prepare",
    description: "What matters for this conversation.",
  },
  session_notes: {
    eyebrow: "Session Notes",
    title: "Session Notes",
    description: "Capture what happened in the current conversation.",
  },
  summary_insights: {
    eyebrow: "Summary & Insights",
    title: "Carry forward what matters",
    description:
      "Review the session record, confirm commitments and decide what should inform the next conversation.",
    optional: true,
  },
  development: {
    eyebrow: "Development",
    title: "Development",
    description: "See how the client is developing over time.",
  },
  reports: {
    eyebrow: "Reports",
    title: "Reports",
    description: "Review and create formal coaching outputs.",
  },
};

/** Live conversation override for Session Notes orientation. */
export const SESSION_NOTES_LIVE_DESCRIPTION =
  "Stay present. Capture only anything you do not want to forget.";

export const SESSION_NOTES_OUTCOME_COPY: StageOrientationCopy = {
  eyebrow: "Session Notes",
  title: "Capture the outcome",
  description:
    "What stood out, what was agreed, private reflection, and optional follow-up.",
};
