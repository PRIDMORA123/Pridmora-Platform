/**
 * Single source of truth for the six-stage coaching journey.
 * Visible architecture must follow these stages even when legacy route
 * names remain internally.
 */

import { BRAND } from "@/lib/brand";

export const COACHING_JOURNEY_STAGE_IDS = [
  "current_position",
  "prepare",
  "session_notes",
  "summary_insights",
  "development",
  "reports",
] as const;

export type CoachingJourneyStageId =
  (typeof COACHING_JOURNEY_STAGE_IDS)[number];

export type CoachingJourneyStageState =
  | "current"
  | "completed"
  | "available"
  | "optional"
  | "unavailable";

export type CoachingJourneyStageDefinition = {
  id: CoachingJourneyStageId;
  label: string;
  shortLabel: string;
  description: string;
  optional?: boolean;
};

export const COACHING_JOURNEY_STAGES: readonly CoachingJourneyStageDefinition[] =
  [
    {
      id: "current_position",
      label: "Current Position",
      shortLabel: "Current",
      description: "Where the client is now and what needs attention next.",
    },
    {
      id: "prepare",
      label: "Prepare",
      shortLabel: "Prepare",
      description: "What matters for the next conversation.",
    },
    {
      id: "session_notes",
      label: "Session Notes",
      shortLabel: "Notes",
      description: "Capture what happened in the current conversation.",
    },
    {
      id: "summary_insights",
      label: "Summary & Insights",
      shortLabel: "Insights",
      description: `Review what ${BRAND.intelligenceName} has organised from the approved evidence.`,
      optional: true,
    },
    {
      id: "development",
      label: "Development",
      shortLabel: "Development",
      description: "See how the client is developing over time.",
    },
    {
      id: "reports",
      label: "Reports",
      shortLabel: "Reports",
      description: "Review and create formal coaching outputs.",
    },
  ] as const;

/** Legacy ClientWorkspaceTab / AppView mapping for SPA routing. */
export type CoachingJourneyLegacyTab =
  | "overview"
  | "prepare"
  | "sessions"
  | "reflect"
  | "summary"
  | "intelligence"
  | "history"
  | "reports"
  | "actions"
  | "journey"
  | "identity-journey";

export const STAGE_TO_LEGACY_TAB: Record<
  CoachingJourneyStageId,
  CoachingJourneyLegacyTab
> = {
  current_position: "overview",
  prepare: "prepare",
  session_notes: "sessions",
  summary_insights: "summary",
  development: "intelligence",
  reports: "reports",
};

export function legacyTabToStage(
  tab: CoachingJourneyLegacyTab | null | undefined
): CoachingJourneyStageId | null {
  switch (tab) {
    case "overview":
      return "current_position";
    case "prepare":
      return "prepare";
    case "sessions":
    case "reflect":
    case "actions":
      return "session_notes";
    case "summary":
      return "summary_insights";
    case "intelligence":
      return "development";
    case "reports":
      return "reports";
    default:
      return null;
  }
}

export function appViewToStage(
  view:
    | "coach-space"
    | "prepare"
    | "session"
    | "intelligence"
    | "reports"
    | "career-journey"
    | "journey"
    | "person-actions"
    | "coaching-report"
    | string
): CoachingJourneyStageId | null {
  switch (view) {
    case "coach-space":
      return "current_position";
    case "prepare":
      return "prepare";
    case "session":
      return "session_notes";
    case "intelligence":
      return "development";
    case "reports":
    case "coaching-report":
      return "reports";
    default:
      return null;
  }
}

export function stageLabel(stageId: CoachingJourneyStageId): string {
  return (
    COACHING_JOURNEY_STAGES.find(stage => stage.id === stageId)?.label ??
    stageId
  );
}

export function getRelationshipSubtitle(input: {
  role?: string;
  organisation?: string;
}): string {
  const role = input.role?.trim() ?? "";
  const organisation = input.organisation?.trim() ?? "";
  if (role && organisation) return `${role} · ${organisation}`;
  return role || organisation || "";
}
