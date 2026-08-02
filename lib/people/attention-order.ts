/**
 * Deterministic People-list attention ordering from persisted workflow state.
 * Does not call AI.
 */

import {
  buildRelationshipActionState,
  getPrimaryRelationshipAction,
  type RelationshipWorkspacePrimaryAction,
} from "@/lib/relationship-workspace/get-primary-relationship-action";
import { getFutureOrOpenSession } from "@/lib/session-workflow";
import { isClientArchived, type Client } from "@/lib/types";

/** Lower rank = higher attention priority. */
export type PeopleAttentionRank = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * 1 active conversation
 * 2 notes awaiting completion
 * 3 Summary & Insights awaiting review
 * 4 preparation ready
 * 5 next conversation not planned
 * 6 no recent activity
 */
export function getPeopleAttentionRank(client: Client): PeopleAttentionRank {
  if (isClientArchived(client)) return 6;

  const session = getFutureOrOpenSession(client.sessions);
  const state = buildRelationshipActionState({
    session,
    relationshipActive: true,
  });
  const primary = getPrimaryRelationshipAction(state);

  switch (primary.action) {
    case "continue_conversation":
      return 1;
    case "capture_notes":
      return 2;
    case "review_intelligence":
      return 3;
    case "start_conversation":
      return 4;
    case "plan_conversation":
      return 5;
    default:
      return 6;
  }
}

/** Standardised People-row next-action label from persisted state. */
export function getPeopleNextActionLabel(client: Client): string {
  if (isClientArchived(client)) {
    return "Open relationship";
  }

  const session = getFutureOrOpenSession(client.sessions);
  const state = buildRelationshipActionState({
    session,
    relationshipActive: true,
  });
  const primary = getPrimaryRelationshipAction(state);

  return peopleLabelForPrimaryAction(primary);
}

function peopleLabelForPrimaryAction(
  primary: RelationshipWorkspacePrimaryAction
): string {
  switch (primary.action) {
    case "continue_conversation":
      return "Continue conversation";
    case "capture_notes":
      return "Capture session notes";
    case "review_intelligence":
      return "Review Summary & Insights";
    case "start_conversation":
      return "Start conversation";
    case "continue_preparation":
      return "Continue preparation";
    case "prepare":
      return "Prepare conversation";
    case "plan_conversation":
    case "none":
    default:
      return "Open relationship";
  }
}

/**
 * Sort Active relationships by attention priority, then by name.
 * Archived / All filters keep relative attention order within the filtered set.
 */
export function sortClientsByAttention(clients: Client[]): Client[] {
  return [...clients].sort((a, b) => {
    const rankDelta = getPeopleAttentionRank(a) - getPeopleAttentionRank(b);
    if (rankDelta !== 0) return rankDelta;
    return a.name.localeCompare(b.name, "en-GB");
  });
}
