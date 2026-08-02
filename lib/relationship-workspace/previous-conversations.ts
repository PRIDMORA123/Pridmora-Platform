import { isSessionCompleted } from "@/lib/client-journey";
import { formatSessionDateLabel } from "@/lib/session/session-display";
import type { Session } from "@/lib/types";

export type PreviousConversationCardModel = {
  id: string;
  sessionNumber: number;
  title: string;
  dateLabel: string;
  completionLabel: string;
  outcome: string;
  commitment: string;
};

const DEFAULT_VISIBLE = 3;
export const CONVERSATION_CARD_TITLE_MAX = 70;
export const CONVERSATION_CARD_OUTCOME_MAX = 180;
export const CONVERSATION_CARD_COMMITMENT_MAX = 160;

const EMPTY_OUTCOME = "Outcome not yet recorded.";
const EMPTY_COMMITMENT = "No commitment was agreed";

function normalise(value?: string | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function firstMeaningfulLine(value?: string | null): string {
  return (
    (value ?? "")
      .split(/\r?\n/)
      .map(line => line.replace(/^[-*•]\s*/, "").trim())
      .find(Boolean) || ""
  );
}

function firstSentenceOrClause(value: string): string {
  const text = normalise(value);
  if (!text) return "";
  const match = text.match(/^(.+?[.!?])(?:\s|$)/);
  return match?.[1]?.trim() || text;
}

/** Clip at a complete word; ellipsis only after a complete word. */
export function clipConversationCardText(
  value: string,
  maxLength: number
): string {
  const text = normalise(value);
  if (!text || text.length <= maxLength) return text;

  const limit = Math.max(1, maxLength - 1);
  const slice = text.slice(0, limit);
  const lastSpace = slice.lastIndexOf(" ");
  if (lastSpace < Math.floor(maxLength * 0.4)) {
    const safe = slice.replace(/\s+\S*$/, "").trim();
    return safe ? `${safe.replace(/[.,;:!?]+$/, "")}…` : `${slice.trim()}…`;
  }
  return `${slice.slice(0, lastSpace).replace(/[.,;:!?]+$/, "")}…`;
}

/**
 * Short conversation title for Previous Conversation cards.
 * Priority: explicit session title → concise approved focus → Development Conversation {n}.
 * Never uses the full preparation purpose as the title.
 */
export function getConversationCardTitle(session: Session): string {
  const explicit = normalise(session.title);
  if (explicit) {
    return clipConversationCardText(explicit, CONVERSATION_CARD_TITLE_MAX);
  }

  const focus = normalise(session.focus);
  if (focus) {
    return clipConversationCardText(
      firstSentenceOrClause(focus),
      CONVERSATION_CARD_TITLE_MAX
    );
  }

  const number =
    typeof session.sessionNumber === "number" && session.sessionNumber > 0
      ? session.sessionNumber
      : null;

  return number
    ? `Development Conversation ${number}`
    : "Development Conversation";
}

/**
 * One concise outcome sentence. Never uses the full preparation purpose.
 */
export function getConversationCardOutcome(session: Session): string {
  const candidates = [
    firstMeaningfulLine(session.outcomes),
    firstMeaningfulLine(session.summary),
    firstMeaningfulLine(session.reflectWhatShifted),
    firstMeaningfulLine(session.reflectWhatSurprised),
  ]
    .map(normalise)
    .filter(Boolean);

  if (candidates.length === 0) return EMPTY_OUTCOME;

  const sentence = firstSentenceOrClause(candidates[0]);
  return clipConversationCardText(sentence, CONVERSATION_CARD_OUTCOME_MAX);
}

/**
 * One concise commitment sentence, or an honest empty state.
 */
export function getConversationCardCommitment(session: Session): string {
  const raw =
    firstMeaningfulLine(session.commitments) ||
    firstMeaningfulLine(session.agreedActions);

  const text = normalise(raw);
  if (!text || /^no commitment was agreed\.?$/i.test(text) || /^none\.?$/i.test(text)) {
    return EMPTY_COMMITMENT;
  }

  return clipConversationCardText(
    firstSentenceOrClause(text),
    CONVERSATION_CARD_COMMITMENT_MAX
  );
}

export function buildPreviousConversationCard(
  session: Session
): PreviousConversationCardModel {
  return {
    id: session.id,
    sessionNumber: session.sessionNumber,
    title: getConversationCardTitle(session),
    dateLabel: formatSessionDateLabel(session.date, session.time),
    completionLabel:
      session.status === "completed" || session.aiSummaryApproved
        ? "Completed"
        : "Recorded",
    outcome: getConversationCardOutcome(session),
    commitment: getConversationCardCommitment(session),
  };
}

/**
 * Previous conversations exclude the current open session.
 * Default: three most recent completed (or otherwise finished) records.
 */
export function selectPreviousConversations(
  sessions: Session[],
  currentSessionId?: string | null,
  options?: { limit?: number }
): {
  visible: PreviousConversationCardModel[];
  total: number;
  hasMore: boolean;
  all: PreviousConversationCardModel[];
} {
  const limit = options?.limit ?? DEFAULT_VISIBLE;
  const previous = [...sessions]
    .filter(session => session.id !== currentSessionId)
    .filter(
      session =>
        isSessionCompleted(session) ||
        session.aiSummaryApproved ||
        session.status === "awaiting_completion"
    )
    .sort((a, b) => b.sessionNumber - a.sessionNumber);

  const all = previous.map(buildPreviousConversationCard);
  return {
    visible: all.slice(0, limit),
    total: all.length,
    hasMore: all.length > limit,
    all,
  };
}
