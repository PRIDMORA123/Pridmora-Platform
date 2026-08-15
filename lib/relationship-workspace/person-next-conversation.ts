/**
 * Person-page next-conversation orientation.
 * Selection reuses getSessionForPrepare — no independent algorithm.
 */

import {
  getSessionForPrepare,
  hasPreparationContent,
} from "@/lib/session-workflow";
import { formatSessionDateLabel } from "@/lib/session/session-display";
import type { Session } from "@/lib/types";

export type PersonNextConversationKind =
  | "continue"
  | "prepare"
  | "review_preparation"
  | "plan";

export type PersonNextConversationModel = {
  kind: PersonNextConversationKind;
  session: Session | null;
  /** e.g. Conversation 4 · 30 August 2026 · 10:00 */
  headline: string | null;
  supportingCopy: string | null;
  primaryLabel: string;
  primaryAction: "prepare" | "open" | "plan";
  secondaryLabel: string | null;
  secondaryAction: "open" | null;
};

function conversationHeadline(session: Session): string {
  const number =
    typeof session.sessionNumber === "number" && session.sessionNumber > 0
      ? `Conversation ${session.sessionNumber}`
      : "Next conversation";
  const when = formatSessionDateLabel(session.date, session.time);
  return `${number} · ${when}`;
}

function preparationReady(session: Session): boolean {
  return (
    session.status === "prepared" || hasPreparationContent(session)
  );
}

/**
 * Canonical next session for the person-page next-conversation strip and
 * its Prepare / Record CTAs. Aligns with prepare() selection.
 */
export function getPersonNextConversationSession(
  sessions: Session[]
): Session | undefined {
  return getSessionForPrepare(sessions);
}

export function buildPersonNextConversationModel(
  sessions: Session[],
  options?: { clientFirstName?: string | null }
): PersonNextConversationModel {
  const session = getPersonNextConversationSession(sessions) ?? null;
  const firstName = options?.clientFirstName?.trim() || "this person";

  if (!session) {
    return {
      kind: "plan",
      session: null,
      headline: null,
      supportingCopy:
        "Plan the next conversation when you are ready to continue.",
      primaryLabel: "Plan next conversation",
      primaryAction: "plan",
      secondaryLabel: null,
      secondaryAction: null,
    };
  }

  const headline = conversationHeadline(session);

  if (session.status === "in_progress" || session.status === "paused") {
    return {
      kind: "continue",
      session,
      headline,
      supportingCopy: "This conversation is already under way.",
      primaryLabel: "Continue conversation",
      primaryAction: "open",
      secondaryLabel: null,
      secondaryAction: null,
    };
  }

  if (preparationReady(session)) {
    return {
      kind: "review_preparation",
      session,
      headline,
      supportingCopy: `Preparation is ready to review using ${firstName}'s development history and open commitments.`,
      primaryLabel: "Review preparation",
      primaryAction: "prepare",
      secondaryLabel: "Record conversation",
      secondaryAction: "open",
    };
  }

  return {
    kind: "prepare",
    session,
    headline,
    supportingCopy:
      "Preparation can use the latest development evidence and open commitments.",
    primaryLabel: "Prepare for conversation",
    primaryAction: "prepare",
    secondaryLabel: "Record conversation",
    secondaryAction: "open",
  };
}
