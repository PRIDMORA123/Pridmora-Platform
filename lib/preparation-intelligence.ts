import type { Client, Session } from "@/lib/types";
import type {
  DevelopmentProfile,
  DevelopmentUpdate,
} from "@/lib/development-updates/types";
import type { PreparationAiBrief } from "@/lib/preparation-brief";
import { extractVisibleCoachNotes } from "@/lib/coach-notes";
import {
  previousCompletedSession,
} from "@/lib/session-workflow";
import {
  buildPreparationAdapterContext,
  isHistoricalSessionPreparation,
  selectOpenActionsForPrepare,
} from "@/lib/preparation/preparation-intelligence-adapter";
import type { CoachPreparationDraft } from "@/lib/preparation/derive-coach-preparation";

export type {
  CoachPreparationDraft,
  DraftSource,
  PreparationIntelligence,
  PreparationTheme,
} from "@/lib/preparation/derive-coach-preparation";

export {
  arePreparationsEqual,
  deriveCoachPreparationDraft,
  hasCoachAuthoredPreparation,
  mergePreparationWithDraft,
} from "@/lib/preparation/derive-coach-preparation";

// ---------------------------------------------------------------------------
// Prepare workspace view-model (relationship context + form seed helpers)
// ---------------------------------------------------------------------------

export type PreparationContextSection =
  | "preparation_brief"
  | "previous_conversation"
  | "commitments"
  | "reflection"
  | "development"
  | "guidance";

export type PreparationIntelligenceViewModel = {
  previousConversation: {
    summary: string;
    completedAt?: string | null;
    focus?: string;
    agreedOutcomes?: string;
  } | null;
  outstandingCommitments: Array<{
    id: string;
    statement: string;
    dueDate?: string | null;
  }>;
  suggestedFocus: string | null;
  recentReflection: {
    summary: string;
    createdAt?: string | null;
  } | null;
  developmentUpdates: Array<{
    id: string;
    title: string;
    summary: string;
    approvedAt?: string | null;
  }>;
  suggestedQuestions: string[];
  suggestedFramework: {
    name: string;
    summary: string;
  } | null;
  approachSummary: string | null;
};

export type PreparationFormValues = {
  purpose: string;
  topics: string;
  questions: string;
  desiredOutcome: string;
  privateNotes: string;
};

function truncate(text: string, max = 180): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1).trim()}…`;
}

function isApprovedSession(session: Session): boolean {
  return (
    session.summaryStatus === "approved" || session.aiSummaryApproved === true
  );
}

export function getContextTitle(section: PreparationContextSection): string {
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

function getPreviousApprovedConversation(
  client: Client,
  conversationId: string
) {
  const current = client.sessions.find(session => session.id === conversationId);
  if (!current) return null;
  const previous = previousCompletedSession(client.sessions, current);
  if (!previous || !isApprovedSession(previous)) return null;

  const summary = extractVisibleCoachNotes(
    previous.summary ||
      previous.professionalIdentityDevelopment ||
      previous.focus
  );
  if (!summary) return null;

  return {
    summary: truncate(summary, 280),
    completedAt: previous.completedAt || previous.date || null,
    focus: extractVisibleCoachNotes(previous.focus),
    agreedOutcomes: extractVisibleCoachNotes(
      previous.agreedActions || previous.commitments
    ),
  };
}

function getOutstandingCommitments(
  client: Client,
  conversation: Pick<Session, "id" | "sessionNumber">
) {
  const historical = isHistoricalSessionPreparation(client.sessions, conversation);
  return selectOpenActionsForPrepare({
    actions: client.actions ?? [],
    sessions: client.sessions,
    currentSessionId: conversation.id,
    beforeSessionNumber: conversation.sessionNumber,
    allowUndatedOpenActions: !historical,
  }).map(action => ({
    id: action.id,
    statement: action.title,
    dueDate: action.due ?? null,
  }));
}

function getLatestApprovedReflection(client: Client, conversationId: string) {
  const current = client.sessions.find(session => session.id === conversationId);
  if (!current) return null;
  const previous = previousCompletedSession(client.sessions, current);
  if (!previous || !isApprovedSession(previous)) return null;

  const summary = extractVisibleCoachNotes(
    [
      previous.summary,
      previous.professionalIdentityDevelopment,
      previous.emergingThemes,
    ]
      .filter(Boolean)
      .join(" ")
  );
  if (!summary) return null;

  return {
    summary: truncate(summary, 400),
    createdAt: previous.completedAt || previous.date || null,
  };
}

function getApprovedDevelopmentUpdates(updates: DevelopmentUpdate[]) {
  return updates
    .filter(update => update.status === "applied")
    .sort((a, b) =>
      (b.appliedAt || b.updatedAt).localeCompare(a.appliedAt || a.updatedAt)
    )
    .slice(0, 6)
    .map(update => {
      const focus =
        update.appliedChanges?.currentFocus?.value ||
        update.editedChanges?.currentFocus?.value ||
        update.proposedChanges?.currentFocus?.value ||
        "";
      const summary = truncate(
        extractVisibleCoachNotes(update.conversationSummary) ||
          "Development update applied.",
        220
      );

      return {
        id: update.id,
        title: focus.trim()
          ? truncate(extractVisibleCoachNotes(focus), 80)
          : "Approved development update",
        summary,
        approvedAt: update.appliedAt || update.updatedAt || null,
      };
    });
}

function generatePreparationGuidance(input: {
  previousConversation: ReturnType<typeof getPreviousApprovedConversation>;
  outstandingCommitments: PreparationIntelligenceViewModel["outstandingCommitments"];
  recentReflection: ReturnType<typeof getLatestApprovedReflection>;
  developmentUpdates: PreparationIntelligenceViewModel["developmentUpdates"];
  brief: PreparationAiBrief | null;
  coachingPurpose: string;
}) {
  const questions = [
    ...(input.brief?.questions ?? []),
    ...(input.brief?.additionalQuestions ?? []),
  ]
    .map(item => extractVisibleCoachNotes(item))
    .filter(Boolean)
    .slice(0, 5);

  const suggestedFocus =
    extractVisibleCoachNotes(input.brief?.themes[0]?.title ?? "") ||
    extractVisibleCoachNotes(input.previousConversation?.focus ?? "") ||
    extractVisibleCoachNotes(input.coachingPurpose) ||
    null;

  const approachSummary =
    extractVisibleCoachNotes(input.brief?.exploration ?? "") ||
    (input.outstandingCommitments.length > 0
      ? "A useful approach may be to review open commitments briefly, then choose one area that most deserves deeper exploration."
      : "A useful approach may be to reconnect with the agreed coaching purpose and explore what would make this conversation valuable now.");

  const suggestedFramework =
    input.outstandingCommitments.length > 0
      ? {
          name: "Review and recommit",
          summary:
            "Begin with what was agreed, notice what moved, and choose one commitment worth renewing.",
        }
      : input.coachingPurpose.trim()
        ? {
            name: "Purpose to progress",
            summary:
              "Reconnect to the agreed coaching purpose, then explore one concrete next step that would create movement.",
          }
        : {
            name: "Explore before advise",
            summary:
              "Stay with the coachee’s experience first. Clarify meaning, then invite options rather than offering solutions.",
          };

  return {
    suggestedFocus: suggestedFocus ? truncate(suggestedFocus, 140) : null,
    suggestedQuestions: questions,
    suggestedFramework,
    approachSummary: truncate(approachSummary, 280),
  };
}

export function resolvePreparationIntelligence(input: {
  client: Client;
  conversation: Session;
  profile: DevelopmentProfile | null;
  updates: DevelopmentUpdate[];
  brief: PreparationAiBrief | null;
}): PreparationIntelligenceViewModel {
  const previousConversation = getPreviousApprovedConversation(
    input.client,
    input.conversation.id
  );
  const outstandingCommitments = getOutstandingCommitments(
    input.client,
    input.conversation
  );
  const recentReflection = getLatestApprovedReflection(
    input.client,
    input.conversation.id
  );
  const developmentUpdates = getApprovedDevelopmentUpdates(
    input.updates.filter(update => {
      const session = input.client.sessions.find(
        item => item.id === update.sessionId
      );
      if (!session) {
        return !isHistoricalSessionPreparation(
          input.client.sessions,
          input.conversation
        );
      }
      return session.sessionNumber < input.conversation.sessionNumber;
    })
  );
  const adapter = buildPreparationAdapterContext({
    client: input.client,
    currentSession: input.conversation,
    profile: input.profile,
    patterns: input.profile?.coachingPatterns ?? [],
  });
  const coachingPurpose = adapter.isFirstSession
    ? input.profile?.currentFocus?.trim() ||
      input.client.currentFocus.trim() ||
      ""
    : adapter.prompt.currentFocus ||
      adapter.nextFocus ||
      "";

  const aiGuidance = generatePreparationGuidance({
    previousConversation,
    outstandingCommitments,
    recentReflection,
    developmentUpdates,
    brief: input.brief,
    coachingPurpose,
  });

  const suggestedFocus =
    (!adapter.isFirstSession && adapter.primaryFocusSuggestion) ||
    aiGuidance.suggestedFocus;

  const suggestedQuestions =
    !adapter.isFirstSession && (!input.brief || input.brief.questions.length === 0)
      ? adapter.questions
      : aiGuidance.suggestedQuestions.length > 0
        ? aiGuidance.suggestedQuestions
        : adapter.questions;

  return {
    previousConversation,
    outstandingCommitments,
    suggestedFocus: suggestedFocus ? truncate(suggestedFocus, 140) : null,
    recentReflection,
    developmentUpdates,
    suggestedQuestions,
    suggestedFramework: aiGuidance.suggestedFramework,
    approachSummary: adapter.movementSummary
      ? truncate(adapter.movementSummary, 280)
      : aiGuidance.approachSummary,
  };
}

export function normalisePreparation(
  session: Pick<
    Session,
    | "prepPurpose"
    | "prepTopics"
    | "prepQuestions"
    | "prepRisks"
    | "prepPrivateNotes"
    | "focus"
  >
): PreparationFormValues {
  return {
    purpose: extractVisibleCoachNotes(session.prepPurpose || session.focus),
    topics: extractVisibleCoachNotes(session.prepTopics),
    questions: extractVisibleCoachNotes(session.prepQuestions),
    desiredOutcome: extractVisibleCoachNotes(session.prepRisks),
    privateNotes: extractVisibleCoachNotes(session.prepPrivateNotes),
  };
}

function splitPreparationTopics(value: string): string[] {
  return value
    .split(/\r?\n|;/)
    .map(item => item.trim())
    .filter(Boolean);
}

function joinPreparationTopics(topics: string[]): string {
  return topics.join("\n");
}

function splitPreparationQuestions(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];

  const byParagraph = trimmed
    .split(/\n\s*\n/)
    .map(item => item.trim())
    .filter(Boolean);

  if (byParagraph.length > 1) return byParagraph;

  const byLine = trimmed
    .split(/\r?\n/)
    .map(item => item.trim())
    .filter(Boolean);

  if (byLine.length > 1 && byLine.every(line => line.endsWith("?"))) {
    return byLine;
  }

  return [trimmed];
}

function joinPreparationQuestions(questions: string[]): string {
  return questions.map(item => item.trim()).filter(Boolean).join("\n\n");
}

function looksLikePreparationQuestion(value: string): boolean {
  const cleaned = value.trim();
  return (
    cleaned.endsWith("?") ||
    /^(what|how|why|when|where|who|which)\b/i.test(cleaned)
  );
}

export function sanitisePreparationFormValues(
  values: PreparationFormValues
): PreparationFormValues {
  const questions = splitPreparationQuestions(values.questions);
  const questionSet = new Set(
    questions.map(question => question.toLowerCase())
  );

  const topics = splitPreparationTopics(values.topics).filter(topic => {
    if (questionSet.has(topic.toLowerCase())) return false;
    if (looksLikePreparationQuestion(topic) && topic.length > 48) return false;
    return true;
  });

  return {
    ...values,
    topics: joinPreparationTopics(topics),
    questions: joinPreparationQuestions(questions),
  };
}

export function sanitisePreparationSessionFields<
  T extends Pick<
    Session,
    | "prepPurpose"
    | "prepTopics"
    | "prepQuestions"
    | "prepRisks"
    | "prepPrivateNotes"
    | "focus"
  >,
>(session: T): T {
  const normalised = sanitisePreparationFormValues(normalisePreparation(session));
  return {
    ...session,
    prepPurpose: normalised.purpose,
    prepTopics: normalised.topics,
    prepQuestions: normalised.questions,
    prepRisks: normalised.desiredOutcome,
    prepPrivateNotes: normalised.privateNotes,
    focus: normalised.purpose || session.focus,
  };
}

/** Map session prep fields into the coach draft shape used by PreparationReadyPanel. */
export function sessionToCoachPreparationDraft(
  session: Pick<
    Session,
    | "prepPurpose"
    | "prepTopics"
    | "prepQuestions"
    | "prepRisks"
    | "prepPrivateNotes"
    | "focus"
  >
): CoachPreparationDraft {
  const normalised = sanitisePreparationFormValues(normalisePreparation(session));
  return {
    purpose: normalised.purpose,
    desiredOutcome: normalised.desiredOutcome,
    topics: splitPreparationTopics(normalised.topics),
    questions: splitPreparationQuestions(normalised.questions),
    reminders: normalised.privateNotes,
  };
}

/** Map a coach draft back onto session prep fields (does not persist). */
export function coachPreparationDraftToSessionFields<
  T extends Pick<
    Session,
    | "prepPurpose"
    | "prepTopics"
    | "prepQuestions"
    | "prepRisks"
    | "prepPrivateNotes"
    | "focus"
  >,
>(draft: CoachPreparationDraft, current: T): T {
  return {
    ...current,
    prepPurpose: draft.purpose,
    prepTopics: joinPreparationTopics(draft.topics),
    prepQuestions: joinPreparationQuestions(draft.questions),
    prepRisks: draft.desiredOutcome,
    prepPrivateNotes: draft.reminders,
    focus: draft.purpose || current.focus,
  };
}
