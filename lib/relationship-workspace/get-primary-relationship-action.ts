/**
 * Pure helper: one contextual next action for the Relationship Workspace.
 * Derived from persisted session/relationship evidence only.
 */

import {
  buildSessionWorkspaceEvidence,
  type SessionWorkspaceEvidence,
} from "@/lib/relationship-workspace/session-workspace-state";
import type { Session } from "@/lib/types";

export type RelationshipActionState = {
  hasCurrentSession: boolean;
  preparationStarted: boolean;
  preparationReady: boolean;
  conversationStarted: boolean;
  conversationEnded: boolean;
  notesSaved: boolean;
  intelligenceAvailable: boolean;
  intelligenceDraftExists: boolean;
  nextFocusSaved: boolean;
  relationshipActive: boolean;
};

export type RelationshipWorkspacePrimaryAction = {
  label: string;
  href?: string;
  action:
    | "plan_conversation"
    | "prepare"
    | "continue_preparation"
    | "start_conversation"
    | "continue_conversation"
    | "capture_notes"
    | "review_intelligence"
    | "none";
};

export function buildRelationshipActionState(input: {
  session?: Session | null;
  relationshipActive?: boolean;
  evidence?: SessionWorkspaceEvidence;
}): RelationshipActionState {
  const evidence =
    input.evidence ?? buildSessionWorkspaceEvidence(input.session);
  const session = input.session;
  const preparationReady = Boolean(
    session && session.status === "prepared"
  );
  const preparationStarted = Boolean(
    evidence.preparationExists && !preparationReady
  );

  return {
    hasCurrentSession: evidence.sessionExists,
    preparationStarted,
    preparationReady,
    conversationStarted: evidence.conversationStarted,
    conversationEnded: evidence.conversationEnded,
    notesSaved: evidence.sessionNotesExist,
    intelligenceAvailable:
      evidence.intelligenceApproved || evidence.intelligenceExists,
    intelligenceDraftExists:
      evidence.intelligenceExists && !evidence.intelligenceApproved,
    nextFocusSaved: evidence.nextFocusExists,
    relationshipActive: input.relationshipActive !== false,
  };
}

/**
 * Resolve the single primary CTA for the relationship workspace.
 * Priority follows persisted conversation evidence over prep defaults.
 */
export function getPrimaryRelationshipAction(
  state: RelationshipActionState
): RelationshipWorkspacePrimaryAction {
  if (!state.relationshipActive) {
    return { label: "", action: "none" };
  }

  if (!state.hasCurrentSession) {
    return {
      label: "Plan next conversation",
      action: "plan_conversation",
    };
  }

  if (state.conversationStarted && !state.conversationEnded) {
    return {
      label: "Continue conversation",
      action: "continue_conversation",
    };
  }

  if (state.conversationEnded && !state.notesSaved) {
    return {
      label: "Capture session notes",
      action: "capture_notes",
    };
  }

  if (state.notesSaved) {
    return {
      label: "Review Summary & Insights",
      action: "review_intelligence",
    };
  }

  if (state.preparationReady) {
    return {
      label: "Start conversation",
      action: "start_conversation",
    };
  }

  if (state.preparationStarted) {
    return {
      label: "Continue preparation",
      action: "continue_preparation",
    };
  }

  return {
    label: "Prepare conversation",
    action: "prepare",
  };
}

/** Map workspace primary action onto a session module for navigation. */
export function primaryActionToModuleId(
  action: RelationshipWorkspacePrimaryAction["action"]
):
  | "prepare"
  | "conversation"
  | "session_notes"
  | "identity_intelligence"
  | "next_focus"
  | null {
  switch (action) {
    case "prepare":
    case "continue_preparation":
      return "prepare";
    case "start_conversation":
    case "continue_conversation":
      return "conversation";
    case "capture_notes":
      return "session_notes";
    case "review_intelligence":
      return "identity_intelligence";
    default:
      return null;
  }
}
