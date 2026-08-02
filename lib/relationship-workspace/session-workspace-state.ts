/**
 * Pure session workspace state for the Relationship Canvas.
 * Derives module status from persisted evidence — no redundant UI flags.
 */

import {
  hasPreparationContent,
  sessionDisplayTitle,
} from "@/lib/session-workflow";
import type { Session } from "@/lib/types";

export type SessionModuleId =
  | "prepare"
  | "conversation"
  | "session_notes"
  | "identity_intelligence"
  | "next_focus";

export type SessionModuleStatus =
  | "ready"
  | "current"
  | "waiting"
  | "complete"
  | "optional"
  | "unavailable";

export type SessionWorkspaceEvidence = {
  sessionExists: boolean;
  preparationExists: boolean;
  conversationStarted: boolean;
  conversationEnded: boolean;
  sessionNotesExist: boolean;
  intelligenceExists: boolean;
  intelligenceApproved: boolean;
  nextFocusExists: boolean;
};

export type SessionModuleState = {
  id: SessionModuleId;
  title: string;
  description: string;
  status: SessionModuleStatus;
  statusLabel: string;
  actionLabel: string;
  available: boolean;
  intelligence?: boolean;
  unavailableReason?: string;
};

export type SessionWorkspaceState = {
  evidence: SessionWorkspaceEvidence;
  modules: SessionModuleState[];
  currentModuleId: SessionModuleId | null;
  primaryActionLabel: string;
  primaryModuleId: SessionModuleId | null;
};

const MODULE_ORDER: SessionModuleId[] = [
  "prepare",
  "conversation",
  "session_notes",
  "identity_intelligence",
  "next_focus",
];

export function buildSessionWorkspaceEvidence(
  session: Session | null | undefined
): SessionWorkspaceEvidence {
  if (!session) {
    return {
      sessionExists: false,
      preparationExists: false,
      conversationStarted: false,
      conversationEnded: false,
      sessionNotesExist: false,
      intelligenceExists: false,
      intelligenceApproved: false,
      nextFocusExists: false,
    };
  }

  const conversationStarted =
    Boolean(session.sessionStartedAt) ||
    session.status === "in_progress" ||
    session.status === "paused" ||
    session.status === "awaiting_completion" ||
    session.status === "completed";

  const conversationEnded =
    session.status === "awaiting_completion" ||
    session.status === "completed";

  const sessionNotesExist = [
    session.notes,
    session.reflectWhatShifted,
    session.reflectWhatSurprised,
    session.reflectWhatWorked,
    session.commitments,
    session.agreedActions,
    session.outcomes,
  ].some(value => value.trim().length > 0);

  const intelligenceApproved =
    session.summaryStatus === "approved" || session.aiSummaryApproved;

  const intelligenceExists =
    intelligenceApproved ||
    session.summaryStatus === "draft" ||
    Boolean(session.summary.trim()) ||
    Boolean(session.emergingThemes.trim()) ||
    Boolean(session.strengthsObserved.trim());

  const nextFocusExists = [
    session.suggestedFocus,
    session.agreedActions,
    session.commitments,
  ].some(value => value.trim().length > 0);

  return {
    sessionExists: true,
    preparationExists:
      hasPreparationContent(session) ||
      session.status === "prepared" ||
      Boolean(session.prepAiBriefConfirmedAt),
    conversationStarted,
    conversationEnded,
    sessionNotesExist,
    intelligenceExists,
    intelligenceApproved,
    nextFocusExists,
  };
}

function statusLabelFor(
  id: SessionModuleId,
  status: SessionModuleStatus,
  evidence: SessionWorkspaceEvidence
): string {
  if (id === "identity_intelligence") {
    if (evidence.intelligenceApproved) return "Approved";
    if (evidence.intelligenceExists) return "Draft available";
    return "Optional";
  }

  switch (status) {
    case "ready":
      return "Ready";
    case "current":
      return "Current";
    case "waiting":
      return "Waiting";
    case "complete":
      return "Complete";
    case "optional":
      return "Optional";
    case "unavailable":
      return "Unavailable";
  }
}

function deriveModuleStatuses(
  evidence: SessionWorkspaceEvidence
): Record<SessionModuleId, SessionModuleStatus> {
  if (!evidence.sessionExists) {
    return {
      prepare: "unavailable",
      conversation: "unavailable",
      session_notes: "unavailable",
      identity_intelligence: "unavailable",
      next_focus: "unavailable",
    };
  }

  const prepare: SessionModuleStatus = evidence.preparationExists
    ? evidence.conversationStarted
      ? "complete"
      : "ready"
    : evidence.conversationStarted
      ? "complete"
      : "current";

  let conversation: SessionModuleStatus;
  if (evidence.conversationEnded) {
    conversation = "complete";
  } else if (evidence.conversationStarted) {
    conversation = "current";
  } else if (evidence.preparationExists) {
    conversation = "ready";
  } else {
    conversation = "waiting";
  }

  let session_notes: SessionModuleStatus;
  if (evidence.sessionNotesExist) {
    session_notes = "complete";
  } else if (evidence.conversationEnded) {
    session_notes = "current";
  } else {
    session_notes = "waiting";
  }

  // Intelligence never blocks Next Focus.
  const identity_intelligence: SessionModuleStatus =
    evidence.intelligenceApproved
      ? "complete"
      : evidence.intelligenceExists
        ? "ready"
        : "optional";

  let next_focus: SessionModuleStatus;
  if (evidence.nextFocusExists) {
    next_focus = "complete";
  } else if (evidence.sessionNotesExist || evidence.conversationEnded) {
    next_focus = evidence.sessionNotesExist ? "ready" : "waiting";
  } else {
    next_focus = "waiting";
  }

  const statuses: Record<SessionModuleId, SessionModuleStatus> = {
    prepare,
    conversation,
    session_notes,
    identity_intelligence,
    next_focus,
  };

  const hasCurrent = Object.values(statuses).some(
    status => status === "current"
  );
  if (!hasCurrent) {
    // Prefer the earliest unfinished actionable module.
    if (statuses.conversation === "ready") {
      statuses.conversation = "current";
    } else if (statuses.prepare === "ready") {
      statuses.prepare = "current";
    } else if (
      (statuses.session_notes === "ready" ||
        statuses.session_notes === "waiting") &&
      evidence.conversationEnded
    ) {
      statuses.session_notes = "current";
    } else if (statuses.next_focus === "ready") {
      statuses.next_focus = "current";
    }
  }

  return statuses;
}

function moduleCopy(
  id: SessionModuleId,
  evidence: SessionWorkspaceEvidence,
  status: SessionModuleStatus
): Pick<SessionModuleState, "title" | "description" | "actionLabel"> {
  switch (id) {
    case "prepare":
      return {
        title: "Prepare",
        description: "Review the focus and questions for this conversation.",
        actionLabel: "Review preparation",
      };
    case "conversation":
      return {
        title: "Conversation",
        description: "Stay present. Capture only anything important.",
        actionLabel: evidence.conversationStarted
          ? evidence.conversationEnded
            ? "View conversation"
            : "Continue conversation"
          : "Start conversation",
      };
    case "session_notes":
      return {
        title: "Session Notes",
        description: "Capture what stood out and what was agreed.",
        actionLabel: status === "complete" ? "Review notes" : "Add notes",
      };
    case "identity_intelligence":
      if (evidence.intelligenceApproved) {
        return {
          title: "Summary & Insights",
          description:
            "Approved Summary & Insights are available to review.",
          actionLabel: "View Summary & Insights",
        };
      }
      if (evidence.intelligenceExists) {
        return {
          title: "Summary & Insights",
          description:
            "Summary & Insights are ready for review before approval.",
          actionLabel: "Review Summary & Insights",
        };
      }
      return {
        title: "Summary & Insights",
        description:
          "Optional. Create Summary & Insights from the saved session notes when useful.",
        actionLabel: "Create Summary & Insights",
      };
    case "next_focus":
      return {
        title: "Next Focus",
        description: "Confirm what should carry into the next conversation.",
        actionLabel: "Review next focus",
      };
  }
}

function resolveAvailability(
  id: SessionModuleId,
  evidence: SessionWorkspaceEvidence,
  status: SessionModuleStatus
): { available: boolean; unavailableReason?: string } {
  if (!evidence.sessionExists || status === "unavailable") {
    return {
      available: false,
      unavailableReason: "No conversation is available yet.",
    };
  }

  if (id === "prepare" || id === "conversation") {
    return { available: true };
  }

  if (id === "session_notes") {
    if (evidence.conversationStarted || evidence.conversationEnded) {
      return { available: true };
    }
    return {
      available: false,
      unavailableReason:
        "Session notes are available after the conversation begins.",
    };
  }

  if (id === "identity_intelligence") {
    if (
      evidence.conversationEnded ||
      evidence.sessionNotesExist ||
      evidence.intelligenceExists
    ) {
      return { available: true };
    }
    return {
      available: false,
      unavailableReason:
        "Summary & Insights are available after session notes.",
    };
  }

  // next_focus — never blocked by intelligence
  if (evidence.sessionNotesExist || evidence.conversationEnded) {
    return { available: true };
  }
  return {
    available: false,
    unavailableReason: "Next focus becomes available after the conversation.",
  };
}

/**
 * One contextual primary CTA for the current conversation card.
 * Labels reflect persisted session evidence — never invent progress.
 */
export function resolveConversationPrimaryActionLabel(
  session: Session | null | undefined
): string {
  const evidence = buildSessionWorkspaceEvidence(session);
  if (!evidence.sessionExists || !session) {
    return "Plan next conversation";
  }

  if (evidence.conversationStarted && !evidence.conversationEnded) {
    return "Continue conversation";
  }

  if (evidence.conversationEnded && !evidence.sessionNotesExist) {
    return "Capture session notes";
  }

  if (evidence.sessionNotesExist) {
    return "Review Summary & Insights";
  }

  if (session.status === "prepared" || evidence.preparationExists) {
    // Prepared / briefing present → ready to start; partial prep → continue.
    if (session.status === "prepared") {
      return "Start conversation";
    }
    return "Continue preparation";
  }

  return "Prepare conversation";
}

function resolvePrimaryModuleId(
  session: Session | null | undefined,
  modules: SessionModuleState[],
  evidence: SessionWorkspaceEvidence
): SessionModuleId | null {
  if (!evidence.sessionExists || !session) return null;

  if (evidence.conversationStarted && !evidence.conversationEnded) {
    return "conversation";
  }
  if (evidence.conversationEnded && !evidence.sessionNotesExist) {
    return "session_notes";
  }
  if (evidence.sessionNotesExist) {
    return "identity_intelligence";
  }
  if (session.status === "prepared") {
    return "conversation";
  }
  if (evidence.preparationExists) {
    return "prepare";
  }

  return (
    modules.find(module => module.status === "current")?.id ??
    modules.find(module => module.status === "ready" && module.available)?.id ??
    "prepare"
  );
}

/**
 * Derive module tiles and primary action from saved session evidence.
 */
export function deriveSessionWorkspaceState(
  session: Session | null | undefined
): SessionWorkspaceState {
  const evidence = buildSessionWorkspaceEvidence(session);
  const statuses = deriveModuleStatuses(evidence);

  const modules: SessionModuleState[] = MODULE_ORDER.map(id => {
    const status = statuses[id];
    const copy = moduleCopy(id, evidence, status);
    const { available, unavailableReason } = resolveAvailability(
      id,
      evidence,
      status
    );

    return {
      id,
      ...copy,
      status,
      statusLabel: statusLabelFor(id, status, evidence),
      available,
      intelligence: id === "identity_intelligence",
      unavailableReason,
    };
  });

  const current =
    modules.find(module => module.status === "current") ??
    modules.find(module => module.status === "ready" && module.available) ??
    null;

  const primaryModuleId = resolvePrimaryModuleId(session, modules, evidence);

  return {
    evidence,
    modules,
    currentModuleId: current?.id ?? null,
    primaryActionLabel: resolveConversationPrimaryActionLabel(session),
    primaryModuleId,
  };
}

export function conversationStatusLabel(session: Session): string {
  switch (session.status) {
    case "planned":
      return "Preparing";
    case "prepared":
      return "Prepared";
    case "in_progress":
    case "paused":
      return "In progress";
    case "awaiting_completion":
      return "Completing";
    case "completed":
      return "Completed";
  }
}

export function conversationDisplayTitle(session: Session): string {
  const title = session.title.trim() || session.focus.trim();
  if (title) return title;
  return sessionDisplayTitle(session);
}

export function isSessionIncomplete(session: Session): boolean {
  return session.status !== "completed";
}

export function findIncompleteCurrentSession(
  sessions: Session[]
): Session | undefined {
  return [...sessions]
    .filter(
      session =>
        session.status === "in_progress" ||
        session.status === "paused" ||
        session.status === "awaiting_completion" ||
        session.status === "planned" ||
        session.status === "prepared"
    )
    .sort((a, b) => {
      const priority: Record<Session["status"], number> = {
        in_progress: 0,
        paused: 0,
        awaiting_completion: 1,
        prepared: 2,
        planned: 3,
        completed: 9,
      };
      return (
        priority[a.status] - priority[b.status] ||
        a.sessionNumber - b.sessionNumber
      );
    })[0];
}
