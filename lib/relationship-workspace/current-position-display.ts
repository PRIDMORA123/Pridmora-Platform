/**
 * Display-only helpers for the Relationship Canvas Current Position block.
 * Never mutates stored records and never calls AI.
 */

import type { Session } from "@/lib/types";

export const CURRENT_POSITION_PREFERRED_MAX_CHARS = 280;
export const CURRENT_FOCUS_PREFERRED_MAX_CHARS = 120;
export const OUTSTANDING_COMMITMENT_PREFERRED_MAX_CHARS = 180;

const EMPTY_POSITION = "No current-position summary has been recorded yet.";
const EMPTY_FOCUS = "No current focus recorded.";
const CLARIFY_FOCUS = "Focus to be clarified in the next conversation.";
const EMPTY_COMMITMENT = "No outstanding commitment.";

/** Journey/system placeholders that must never become the Current Position narrative. */
const POSITION_PLACEHOLDER_PATTERNS = [
  /^the development story is still forming\.?$/i,
  /^development underway\.?$/i,
  /^a clearer development direction is still emerging\.?$/i,
  /^the current coaching position is still forming\.?$/i,
];

export function normaliseDisplayText(value?: string | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function isUsablePositionSource(value?: string | null): boolean {
  const text = normaliseDisplayText(value);
  if (!text) return false;
  return !POSITION_PLACEHOLDER_PATTERNS.some(pattern => pattern.test(text));
}

/** One or two short sentences for the Current Position statement. */
function toShortPositionNarrative(
  source: string,
  maxChars = CURRENT_POSITION_PREFERRED_MAX_CHARS
): string {
  const raw = normaliseDisplayText(source);
  if (!raw) return "";

  const sentences = raw
    .split(/(?<=[.!?])\s+/)
    .map(sentence => sentence.trim())
    .filter(Boolean);

  let snapshot = sentences[0] || raw;
  if (
    sentences.length > 1 &&
    snapshot.length + sentences[1].length + 1 <= maxChars
  ) {
    snapshot = `${snapshot} ${sentences[1]}`;
  }

  return clipAtWordBoundary(snapshot, maxChars);
}

export function isMeaningfullyDuplicateText(
  first?: string | null,
  second?: string | null
): boolean {
  const normalise = (value?: string | null) =>
    (value ?? "")
      .toLowerCase()
      .replace(/^to\s+/u, "")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();

  const a = normalise(first);
  const b = normalise(second);

  if (!a || !b) {
    return false;
  }

  return a === b;
}

function firstNameFrom(clientName?: string | null): string {
  const name = normaliseDisplayText(clientName);
  if (!name) return "The client";
  return name.split(/\s+/)[0] || "The client";
}

function clipAtWordBoundary(value: string, maxChars: number): string {
  const text = normaliseDisplayText(value);
  if (!text || text.length <= maxChars) return text;
  const clipped = text.slice(0, maxChars - 1).replace(/\s+\S*$/, "");
  return `${clipped.replace(/[.,;:!?]+$/, "")}…`;
}

/**
 * Deterministic shortening for coaching-purpose text used as Current Focus.
 * Does not call AI.
 */
export function createConciseFocus(
  purpose?: string | null,
  maxChars = CURRENT_FOCUS_PREFERRED_MAX_CHARS
): string {
  let text = normaliseDisplayText(purpose);
  if (!text) return "";

  const byMatch = text.match(
    /\bby\s+(strengthening|developing|building|improving|enhancing)\s+(.+)$/i
  );

  if (byMatch?.index != null) {
    let areas = byMatch[2].replace(/\.+$/g, "").trim();
    areas = areas
      .replace(/\s*,?\s*and\s+leadership presence$/i, "")
      .replace(/strategic thinking/gi, "strategic leadership")
      .trim();

    const lead = text
      .slice(0, byMatch.index)
      .replace(/^to\s+/i, "")
      .replace(/\.+$/g, "")
      .trim();

    if (/^build\s+confidence/i.test(lead) && areas) {
      text = `Build confidence in ${areas}`;
    } else if (areas) {
      text = areas.charAt(0).toUpperCase() + areas.slice(1);
    }
  } else {
    text = text.replace(/^to\s+/i, "");
    if (text) {
      text = text.charAt(0).toUpperCase() + text.slice(1);
    }
  }

  text = text.replace(/\.+$/g, "").trim();
  return clipAtWordBoundary(text, maxChars);
}

function beginningRelationshipPosition(
  clientName: string | null | undefined,
  coachingPurpose: string
): string {
  const firstName = firstNameFrom(clientName);
  let focusPhrase = normaliseDisplayText(coachingPurpose)
    .replace(/^to\s+/i, "")
    .replace(/\.+$/g, "");

  focusPhrase = focusPhrase.replace(/^build\s+/i, "developing ");
  focusPhrase = focusPhrase.replace(/\s+by\s+.+$/i, "");
  focusPhrase = focusPhrase.replace(/\bas a new\b/i, "as an");

  if (!focusPhrase) {
    return `${firstName} is beginning this coaching relationship.`;
  }

  return `${firstName} is beginning this coaching relationship with a focus on ${focusPhrase}.`;
}

export type CurrentPositionDisplayInput = {
  approvedCurrentPosition?: string | null;
  approvedDevelopmentDirection?: string | null;
  approvedSessionEvidence?: string | null;
  currentFocus?: string | null;
  coachingPurpose?: string | null;
  clientName?: string | null;
};

/**
 * Present-state Current Position narrative.
 * Priority: approved position → development direction → approved session evidence →
 * first-session purpose template → coaching purpose → empty copy.
 */
export function getCurrentPositionDisplay(
  input: CurrentPositionDisplayInput
): string {
  const coachingPurpose = normaliseDisplayText(input.coachingPurpose);

  const approvedPosition = normaliseDisplayText(input.approvedCurrentPosition);
  if (isUsablePositionSource(approvedPosition)) {
    return toShortPositionNarrative(approvedPosition);
  }

  const developmentDirection = normaliseDisplayText(
    input.approvedDevelopmentDirection
  );
  if (
    isUsablePositionSource(developmentDirection) &&
    !isMeaningfullyDuplicateText(developmentDirection, coachingPurpose) &&
    !isMeaningfullyDuplicateText(developmentDirection, input.currentFocus)
  ) {
    return toShortPositionNarrative(developmentDirection);
  }

  const sessionEvidence = normaliseDisplayText(input.approvedSessionEvidence);
  if (isUsablePositionSource(sessionEvidence)) {
    return toShortPositionNarrative(sessionEvidence);
  }

  if (coachingPurpose) {
    return beginningRelationshipPosition(input.clientName, coachingPurpose);
  }

  return EMPTY_POSITION;
}

export type CurrentFocusDisplayInput = {
  currentFocus?: string | null;
  approvedNextFocus?: string | null;
  coachingPurpose?: string | null;
};

/**
 * Forward-looking Current Focus.
 * Priority: explicit focus → approved next focus → concise coaching purpose → empty copy.
 */
function formatFocusCandidate(value: string): string {
  if (value.length > CURRENT_FOCUS_PREFERRED_MAX_CHARS) {
    return createConciseFocus(value);
  }

  let text = value.replace(/^to\s+/i, "");
  if (text && text !== value) {
    text = text.charAt(0).toUpperCase() + text.slice(1);
  }
  text = text.replace(/\.+$/g, "").trim();
  return text || createConciseFocus(value);
}

export function getCurrentFocusDisplay(input: CurrentFocusDisplayInput): string {
  const explicit = normaliseDisplayText(input.currentFocus);
  if (explicit) {
    return formatFocusCandidate(explicit);
  }

  const nextFocus = normaliseDisplayText(input.approvedNextFocus);
  if (nextFocus) {
    return formatFocusCandidate(nextFocus);
  }

  const coachingPurpose = normaliseDisplayText(input.coachingPurpose);
  if (coachingPurpose) {
    return createConciseFocus(coachingPurpose);
  }

  return EMPTY_FOCUS;
}

export type OutstandingCommitmentDisplay = {
  commitment: string;
  additionalCount: number;
  hasMore: boolean;
};

/**
 * True when text looks like an explicit agreed action rather than an outcome narrative.
 */
export function isExplicitOpenCommitment(value?: string | null): boolean {
  const text = normaliseDisplayText(value);
  if (!text) return false;
  if (/^no commitment was agreed\.?$/i.test(text)) return false;
  if (/^none\.?$/i.test(text)) return false;
  if (/^n\/?a\.?$/i.test(text)) return false;

  // Outcome / reflection narratives must not appear as Outstanding Commitment.
  if (
    /\b(reflected on|the session (also )?explored|recognised that|described feeling|feeling proud|key outcome|what stood out)\b/i.test(
      text
    )
  ) {
    return false;
  }

  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length >= 3 && text.length > 220) return false;
  if (text.length > 320 && sentences.length >= 2) return false;

  return true;
}

function extractExplicitCommitments(value?: string | null): string[] {
  const raw = (value ?? "").trim();
  if (!raw) return [];

  const byLine = raw
    .split(/\n+/)
    .map(line => line.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);

  const candidates =
    byLine.length > 1
      ? byLine
      : normaliseDisplayText(raw)
          .replace(/^[-*•]\s*/, "")
          .split(/\s+[;•]\s+|;\s+|\s+-\s+/)
          .map(part => part.replace(/^[-*•]\s*/, "").trim())
          .filter(Boolean);

  return candidates
    .map(item => normaliseDisplayText(item))
    .filter(isExplicitOpenCommitment);
}

export function getOutstandingCommitmentDisplay(input: {
  outstandingCommitment?: string | null;
  commitments?: string[] | null;
}): OutstandingCommitmentDisplay {
  const fromList = (input.commitments ?? [])
    .flatMap(item => extractExplicitCommitments(item))
    .filter(Boolean);

  const fromProp = extractExplicitCommitments(input.outstandingCommitment);

  // Prefer an explicit open commitment list; fall back to a single prop value.
  const ordered = [...fromList];
  for (const item of fromProp) {
    if (!ordered.some(existing => isMeaningfullyDuplicateText(existing, item))) {
      ordered.unshift(item);
    }
  }

  // De-duplicate while preserving order.
  const unique: string[] = [];
  for (const item of ordered) {
    if (unique.some(existing => isMeaningfullyDuplicateText(existing, item))) {
      continue;
    }
    unique.push(item);
  }

  const primary = unique[0] || "";

  if (!primary) {
    return {
      commitment: EMPTY_COMMITMENT,
      additionalCount: 0,
      hasMore: false,
    };
  }

  return {
    commitment: clipAtWordBoundary(
      primary,
      OUTSTANDING_COMMITMENT_PREFERRED_MAX_CHARS
    ),
    additionalCount: Math.max(0, unique.length - 1),
    hasMore: unique.length > 1,
  };
}

/** Latest coach-approved session summary — excludes drafts, notes, and private fields. */
export function getLatestApprovedSessionEvidence(
  sessions: Session[] | null | undefined
): string | null {
  if (!sessions?.length) return null;

  const approved = [...sessions]
    .filter(
      session =>
        (session.summaryStatus === "approved" || session.aiSummaryApproved) &&
        normaliseDisplayText(session.summary)
    )
    .sort((a, b) => b.sessionNumber - a.sessionNumber);

  return approved[0] ? normaliseDisplayText(approved[0].summary) : null;
}

/** Explicit commitments from the latest approved session only. */
export function getLatestApprovedSessionCommitments(
  sessions: Session[] | null | undefined
): string[] {
  if (!sessions?.length) return [];

  const approved = [...sessions]
    .filter(
      session =>
        session.summaryStatus === "approved" || session.aiSummaryApproved
    )
    .sort((a, b) => b.sessionNumber - a.sessionNumber);

  const latest = approved[0];
  if (!latest) return [];

  const raw = (latest.commitments || latest.agreedActions || "").trim();
  return extractExplicitCommitments(raw);
}

/** Next-session focus from the latest approved session, when present. */
export function getLatestApprovedNextFocus(
  sessions: Session[] | null | undefined
): string | null {
  if (!sessions?.length) return null;

  const approved = [...sessions]
    .filter(
      session =>
        session.summaryStatus === "approved" || session.aiSummaryApproved
    )
    .sort((a, b) => b.sessionNumber - a.sessionNumber);

  const latest = approved[0];
  if (!latest) return null;

  return (
    normaliseDisplayText(latest.suggestedFocus) ||
    null
  );
}

export type CurrentPositionPanelModel = {
  statement: string;
  currentFocus: string;
  outstandingCommitment: string;
  commitmentHasMore: boolean;
  commitmentAdditionalCount: number;
  fullNarrative: string;
  hasDetail: boolean;
};

/**
 * Resolve distinct Current Position / Current Focus / Commitment display values.
 */
export function buildCurrentPositionPanelModel(input: {
  approvedCurrentPosition?: string | null;
  identitySummary?: string | null;
  approvedDevelopmentDirection?: string | null;
  approvedSessionEvidence?: string | null;
  currentFocus?: string | null;
  approvedNextFocus?: string | null;
  coachingPurpose?: string | null;
  clientName?: string | null;
  outstandingCommitment?: string | null;
  commitments?: string[] | null;
}): CurrentPositionPanelModel {
  const coachingPurpose =
    normaliseDisplayText(input.coachingPurpose) ||
    normaliseDisplayText(input.currentFocus);

  const approvedCurrentPosition =
    normaliseDisplayText(input.approvedCurrentPosition) ||
    normaliseDisplayText(input.identitySummary);

  const sessionEvidence = normaliseDisplayText(input.approvedSessionEvidence);

  let statement = getCurrentPositionDisplay({
    approvedCurrentPosition,
    approvedDevelopmentDirection: input.approvedDevelopmentDirection,
    approvedSessionEvidence: sessionEvidence,
    currentFocus: input.currentFocus,
    coachingPurpose,
    clientName: input.clientName,
  });

  let currentFocus = getCurrentFocusDisplay({
    currentFocus: input.currentFocus,
    approvedNextFocus: input.approvedNextFocus,
    coachingPurpose,
  });

  if (isMeaningfullyDuplicateText(statement, currentFocus)) {
    const distinctFocus =
      createConciseFocus(
        normaliseDisplayText(input.currentFocus) ||
          normaliseDisplayText(input.approvedNextFocus) ||
          coachingPurpose
      ) || "";

    if (
      distinctFocus &&
      !isMeaningfullyDuplicateText(statement, distinctFocus)
    ) {
      currentFocus = distinctFocus;
    } else {
      currentFocus = CLARIFY_FOCUS;
    }
  }

  const commitmentModel = getOutstandingCommitmentDisplay({
    outstandingCommitment: input.outstandingCommitment,
    commitments: input.commitments,
  });

  const fullNarrative =
    approvedCurrentPosition || sessionEvidence || "";

  return {
    statement,
    currentFocus,
    outstandingCommitment: commitmentModel.commitment,
    commitmentHasMore: commitmentModel.hasMore,
    commitmentAdditionalCount: commitmentModel.additionalCount,
    fullNarrative,
    hasDetail: Boolean(
      fullNarrative &&
        fullNarrative !== statement &&
        fullNarrative.length > statement.length
    ),
  };
}
