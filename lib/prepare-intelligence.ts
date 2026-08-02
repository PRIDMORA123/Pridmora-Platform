import type { Client, Session } from "@/lib/types";
import type { DevelopmentProfile, DevelopmentUpdate } from "@/lib/development-updates/types";
import type { PreparationAiBrief } from "@/lib/preparation-brief";
import {
  previousCompletedSession,
  unresolvedActionsForPreparation,
} from "@/lib/session-workflow";

export type PreparationIntelligence = {
  previousConversationSummary?: string | null;
  outstandingActionCount: number;
  suggestedFocus?: string | null;
};

export type ContextSection =
  | "preparation_brief"
  | "previous_conversation"
  | "commitments"
  | "reflection"
  | "development"
  | "guidance";

export type PreparationBriefViewModel = {
  previousPosition: string | null;
  recentMovement: string | null;
  openCommitments: string[];
  possibleFocusAreas: string[];
  suggestedQuestions: string[];
  status:
    | "ready"
    | "generating"
    | "no_previous"
    | "no_evidence"
    | "unavailable";
};

export type CoachingFrameworkSummary = {
  name: string;
  summary: string;
};

export type CoachingGuidanceViewModel = {
  questions: string[];
  approachSummary: string;
  framework: CoachingFrameworkSummary | null;
};

function truncate(text: string, max = 160): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1).trim()}…`;
}

function isApprovedSession(session: Session): boolean {
  return session.summaryStatus === "approved" || session.aiSummaryApproved === true;
}

export function getContextSectionTitle(section: ContextSection): string {
  switch (section) {
    case "preparation_brief":
      return "Preparation brief";
    case "previous_conversation":
      return "Previous conversation";
    case "commitments":
      return "Open commitments";
    case "reflection":
      return "Recent reflection";
    case "development":
      return "Development journey";
    case "guidance":
      return "Coaching guidance";
  }
}

export function buildPreparationIntelligence(input: {
  client: Client;
  session: Session;
  brief: PreparationAiBrief | null;
}): PreparationIntelligence {
  const previous = previousCompletedSession(input.client.sessions, input.session);
  const outstanding = unresolvedActionsForPreparation(
    input.client,
    input.session.id
  );

  const previousConversationSummary = previous
    ? truncate(
        previous.summary.trim() ||
          previous.professionalIdentityDevelopment.trim() ||
          previous.focus.trim() ||
          "Previous conversation recorded."
      )
    : null;

  const suggestedFocus =
    input.brief?.themes[0]?.title?.trim() ||
    previous?.suggestedFocus?.trim() ||
    input.client.currentFocus.trim() ||
    null;

  return {
    previousConversationSummary,
    outstandingActionCount: outstanding.length,
    suggestedFocus: suggestedFocus ? truncate(suggestedFocus, 120) : null,
  };
}

export function buildPreparationBriefViewModel(input: {
  client: Client;
  session: Session;
  profile: DevelopmentProfile | null;
  updates: DevelopmentUpdate[];
  brief: PreparationAiBrief | null;
  generating: boolean;
  unavailable: boolean;
}): PreparationBriefViewModel {
  if (input.generating) {
    return {
      previousPosition: null,
      recentMovement: null,
      openCommitments: [],
      possibleFocusAreas: [],
      suggestedQuestions: [],
      status: "generating",
    };
  }

  if (input.unavailable) {
    return {
      previousPosition: null,
      recentMovement: null,
      openCommitments: unresolvedActionsForPreparation(
        input.client,
        input.session.id
      ).map(action => action.title),
      possibleFocusAreas: [],
      suggestedQuestions: [],
      status: "unavailable",
    };
  }

  const previous = previousCompletedSession(input.client.sessions, input.session);
  const outstanding = unresolvedActionsForPreparation(
    input.client,
    input.session.id
  ).map(action => action.title);

  const approvedSessions = input.client.sessions.filter(isApprovedSession);
  const appliedUpdates = input.updates.filter(update => update.status === "applied");

  if (!previous && approvedSessions.length === 0 && appliedUpdates.length === 0) {
    const hasPurpose = Boolean(
      (input.profile?.currentFocus || input.client.currentFocus || "").trim()
    );
    return {
      previousPosition: null,
      recentMovement: null,
      openCommitments: outstanding,
      possibleFocusAreas: hasPurpose
        ? [
            truncate(
              input.profile?.currentFocus || input.client.currentFocus,
              120
            ),
          ]
        : [],
      suggestedQuestions: (input.brief?.questions ?? []).slice(0, 5),
      status: hasPurpose ? "no_previous" : "no_evidence",
    };
  }

  const previousPosition = previous
    ? truncate(
        [
          previous.focus.trim() && `Focus: ${previous.focus.trim()}`,
          previous.summary.trim(),
        ]
          .filter(Boolean)
          .join(" "),
        700
      )
    : input.client.currentFocus.trim()
      ? truncate(
          `Agreed coaching purpose: ${input.client.currentFocus.trim()}`,
          700
        )
      : null;

  const latestUpdate = appliedUpdates.sort((a, b) =>
    (b.appliedAt || b.updatedAt).localeCompare(a.appliedAt || a.updatedAt)
  )[0];

  const recentMovement =
    truncate(
      latestUpdate?.conversationSummary?.trim() ||
        previous?.professionalIdentityDevelopment?.trim() ||
        previous?.emergingThemes?.trim() ||
        "",
      560
    ) || null;

  const focusFromBrief = (input.brief?.themes ?? [])
    .map(theme => theme.title.trim())
    .filter(Boolean);

  const focusFromProfile = (input.profile?.growthAreas ?? [])
    .map(item => item.value.trim())
    .filter(Boolean);

  const possibleFocusAreas = [
    ...focusFromBrief,
    ...(previous?.suggestedFocus?.trim()
      ? [previous.suggestedFocus.trim()]
      : []),
    ...focusFromProfile,
  ]
    .filter((item, index, list) => list.indexOf(item) === index)
    .slice(0, 5);

  const suggestedQuestions = [
    ...(input.brief?.questions ?? []),
    ...(input.brief?.additionalQuestions ?? []),
  ]
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 5);

  return {
    previousPosition,
    recentMovement,
    openCommitments: outstanding,
    possibleFocusAreas,
    suggestedQuestions,
    status: "ready",
  };
}

const FRAMEWORKS: CoachingFrameworkSummary[] = [
  {
    name: "Review and recommit",
    summary:
      "Begin with what was agreed, notice what moved, and choose one commitment worth renewing.",
  },
  {
    name: "Purpose to progress",
    summary:
      "Reconnect to the agreed coaching purpose, then explore one concrete next step that would create movement.",
  },
  {
    name: "Explore before advise",
    summary:
      "Stay with the coachee’s experience first. Clarify meaning, then invite options rather than offering solutions.",
  },
];

export function buildCoachingGuidanceViewModel(input: {
  client: Client;
  session: Session;
  brief: PreparationAiBrief | null;
  briefView: PreparationBriefViewModel;
}): CoachingGuidanceViewModel {
  const outstanding = unresolvedActionsForPreparation(
    input.client,
    input.session.id
  );
  const questions = input.briefView.suggestedQuestions.slice(0, 5);

  const approachSummary =
    input.brief?.exploration?.trim() ||
    (outstanding.length > 0
      ? "A useful approach may be to review open commitments briefly, then choose one area that most deserves deeper exploration in this conversation."
      : "A useful approach may be to reconnect with the agreed coaching purpose and explore what would make this conversation valuable now.");

  const framework =
    outstanding.length > 0
      ? FRAMEWORKS[0]
      : input.client.currentFocus.trim()
        ? FRAMEWORKS[1]
        : FRAMEWORKS[2];

  return {
    questions,
    approachSummary: truncate(approachSummary, 320),
    framework,
  };
}

export function buildPreviousConversationContext(
  client: Client,
  session: Session
) {
  const previous = previousCompletedSession(client.sessions, session);
  if (!previous) return null;

  return {
    dateLabel: previous.date || "Date not set",
    focus: previous.focus.trim() || "No focus recorded",
    summary:
      isApprovedSession(previous) && previous.summary.trim()
        ? previous.summary.trim()
        : "No approved summary is available for the previous conversation.",
    agreedOutcomes:
      previous.agreedActions.trim() ||
      previous.commitments.trim() ||
      "No agreed outcomes recorded.",
    development:
      previous.professionalIdentityDevelopment.trim() ||
      previous.emergingThemes.trim() ||
      "",
  };
}

export function buildRecentReflectionContext(
  client: Client,
  session: Session
) {
  const previous = previousCompletedSession(client.sessions, session);
  if (!previous || !isApprovedSession(previous)) return null;

  // Shareable approved fields only — never private reflection notes.
  const parts = [
    previous.summary,
    previous.professionalIdentityDevelopment,
    previous.emergingThemes,
    previous.strengthsObserved,
    previous.valuesBecomingVisible,
  ]
    .map(part => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return null;

  return {
    sessionLabel: `Session ${previous.sessionNumber}`,
    dateLabel: previous.date || "",
    content: parts.join("\n\n"),
  };
}

export function buildDevelopmentContext(
  profile: DevelopmentProfile | null,
  client: Client,
  updates: DevelopmentUpdate[]
) {
  const applied = updates
    .filter(update => update.status === "applied")
    .slice(0, 5);

  return {
    purpose: (profile?.currentFocus || client.currentFocus || "").trim(),
    themes: (profile?.emergingThemes ?? [])
      .map(item => item.value)
      .filter(Boolean)
      .slice(0, 6),
    growthAreas: (profile?.growthAreas ?? [])
      .map(item => item.value)
      .filter(Boolean)
      .slice(0, 6),
    strengths: (profile?.strengths ?? [])
      .map(item => item.value)
      .filter(Boolean)
      .slice(0, 6),
    recentUpdates: applied.map(update => ({
      id: update.id,
      summary: truncate(update.conversationSummary || "Development update applied.", 180),
      appliedAt: update.appliedAt || update.updatedAt,
    })),
  };
}
