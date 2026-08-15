/**
 * Prepare commitment selection: temporal filter, near-duplicate collapse,
 * and newest / most-complete prioritisation. Does not mutate stored actions.
 */

import type { CoachingAction, Session } from "@/lib/types";

const STOP_WORDS = new Set([
  "the",
  "and",
  "rather",
  "than",
  "only",
  "their",
  "next",
  "when",
  "may",
  "with",
  "from",
  "that",
  "this",
  "into",
  "for",
  "in",
  "a",
  "an",
  "to",
  "of",
  "on",
  "at",
  "by",
  "or",
  "as",
  "be",
  "is",
  "are",
  "was",
  "were",
  "will",
  "would",
  "could",
  "should",
  "more",
  "most",
  "than",
]);

function stripCommitmentBoilerplate(value: string): string {
  return value
    .trim()
    .replace(/^(?:[A-Za-z][A-Za-z'’\-]*\s+)+agreed\s+to\s+/i, "")
    .replace(/^(?:to\s+)?practise\s+/i, "")
    .replace(/^(?:to\s+)?practice\s+/i, "")
    .trim();
}

/** Token set used for near-duplicate comparison. */
export function commitmentSignificantTokens(value: string): Set<string> {
  const cleaned = stripCommitmentBoilerplate(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  return new Set(
    cleaned
      .split(" ")
      .map(token => token.trim())
      .filter(token => token.length > 3 && !STOP_WORDS.has(token))
  );
}

function tokenOverlapRatio(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let overlap = 0;
  for (const token of left) {
    if (right.has(token)) overlap += 1;
  }
  return overlap / Math.max(left.size, right.size);
}

function tokenContainmentRatio(smaller: Set<string>, larger: Set<string>): number {
  if (smaller.size === 0) return 0;
  let overlap = 0;
  for (const token of smaller) {
    if (larger.has(token)) overlap += 1;
  }
  return overlap / smaller.size;
}

/**
 * True when two open-commitment titles represent the same underlying agreement.
 * Exact match after light normalisation, strong token overlap, or high containment.
 */
export function areNearDuplicateCommitments(
  first?: string | null,
  second?: string | null
): boolean {
  const a = (first ?? "").replace(/\s+/g, " ").trim();
  const b = (second ?? "").replace(/\s+/g, " ").trim();
  if (!a || !b) return false;

  const exactA = stripCommitmentBoilerplate(a).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  const exactB = stripCommitmentBoilerplate(b).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  if (exactA && exactB && exactA === exactB) return true;

  const left = commitmentSignificantTokens(a);
  const right = commitmentSignificantTokens(b);
  if (left.size === 0 || right.size === 0) return false;

  if (tokenOverlapRatio(left, right) >= 0.55) return true;

  const [smaller, larger] =
    left.size <= right.size ? [left, right] : [right, left];
  return smaller.size >= 3 && tokenContainmentRatio(smaller, larger) >= 0.75;
}

/** Prefer the more complete wording (longer after trim; tie-break keeps first). */
export function preferCommitmentWording(first: string, second: string): string {
  const a = first.trim();
  const b = second.trim();
  if (!a) return b;
  if (!b) return a;
  if (a.length !== b.length) return a.length >= b.length ? a : b;
  // Prefer explicit agreement phrasing when lengths match.
  const aAgreed = /\bagreed\s+to\b/i.test(a);
  const bAgreed = /\bagreed\s+to\b/i.test(b);
  if (aAgreed !== bAgreed) return aAgreed ? a : b;
  return a;
}

function buildSessionNumberMap(sessions: Session[]): Map<string, number> {
  return new Map(
    sessions.map(session => [session.id, session.sessionNumber] as const)
  );
}

export type PrepareCommitmentActionInput = {
  actions: CoachingAction[];
  sessions: Session[];
  currentSessionId: string;
  beforeSessionNumber: number;
  allowUndatedOpenActions?: boolean;
};

function sessionNumberForAction(
  action: CoachingAction,
  sessionNumbers: Map<string, number>
): number {
  const linked = action.sessionId?.trim() || "";
  if (!linked) return 0;
  return sessionNumbers.get(linked) ?? 0;
}

/**
 * Eligible open actions before Session N, collapsed by near-duplicate,
 * ordered newest session first then more-complete wording.
 */
export function selectOpenActionsForPrepare(
  input: PrepareCommitmentActionInput
): CoachingAction[] {
  const sessionNumbers = buildSessionNumberMap(input.sessions);
  const allowUndated = input.allowUndatedOpenActions !== false;

  const eligible = input.actions.filter(action => {
    if (action.status === "Complete") return false;
    if (!action.title.trim()) return false;
    if (action.sessionId === input.currentSessionId) return false;
    const sessionId = action.sessionId?.trim() || "";
    if (sessionId) {
      const number = sessionNumbers.get(sessionId);
      if (typeof number !== "number" || number >= input.beforeSessionNumber) {
        return false;
      }
      return true;
    }
    return allowUndated;
  });

  const ranked = [...eligible].sort((left, right) => {
    const leftSession = sessionNumberForAction(left, sessionNumbers);
    const rightSession = sessionNumberForAction(right, sessionNumbers);
    if (leftSession !== rightSession) return rightSession - leftSession;
    const lengthDelta = right.title.trim().length - left.title.trim().length;
    if (lengthDelta !== 0) return lengthDelta;
    return left.id.localeCompare(right.id);
  });

  const selected: CoachingAction[] = [];
  for (const action of ranked) {
    const title = action.title.trim();
    const duplicateIndex = selected.findIndex(existing =>
      areNearDuplicateCommitments(existing.title, title)
    );
    if (duplicateIndex === -1) {
      selected.push({ ...action, title });
      continue;
    }
    // Keep the already-ranked winner; if a later-ranked item is somehow more
    // complete (should be rare after sort), replace wording only in memory.
    const current = selected[duplicateIndex]!;
    const preferred = preferCommitmentWording(current.title, title);
    if (preferred !== current.title) {
      selected[duplicateIndex] = { ...action, title: preferred };
    }
  }

  return selected.slice(0, 5);
}

/**
 * Open commitment statements for Prepare Session N.
 */
export function selectCommitmentsForPrepare(
  input: PrepareCommitmentActionInput
): string[] {
  return selectOpenActionsForPrepare(input).map(action => action.title.trim());
}

/** Singular Previous commitment: newest / most complete after selection. */
export function selectPrimaryPreviousCommitment(
  commitments: string[]
): string | null {
  const primary = commitments[0]?.trim() || "";
  return primary || null;
}

/**
 * True when a candidate title is a near-duplicate of any existing open action.
 */
export function hasNearDuplicateOpenAction(
  openActionTitles: string[],
  candidate: string
): boolean {
  const value = candidate.trim();
  if (!value) return false;
  const normalised = value.toLowerCase();
  return openActionTitles.some(title => {
    const existing = title.trim();
    if (!existing) return false;
    if (existing.toLowerCase() === normalised) return true;
    return areNearDuplicateCommitments(existing, value);
  });
}
