/**
 * Build conversation evidence for draft Session Summary & Insights generation.
 * Keeps Capture Outcome narrative and live notes both available to the model
 * without inventing a single overwrite field.
 */

import type { Session } from "@/lib/types";

/** Persisted UI marker — restore checkbox state; never send as model evidence. */
export const NO_COMMITMENT_AGREED_MARKER = "No commitment was agreed";

export type DebriefEvidenceSessionFields = Pick<
  Session,
  | "reflectWhatSurprised"
  | "reflectWhatShifted"
  | "reflectWhatWorked"
  | "reflectDifferently"
  | "notes"
  | "commitments"
>;

/**
 * True when commitments holds only the workflow/UI no-commitment marker
 * (or a short "none"), not a genuine agreed action.
 */
export function isNoCommitmentAgreedMarker(
  value?: string | null
): boolean {
  const text = (value ?? "").trim();
  if (!text) return false;
  if (/^no commitment was agreed\.?$/i.test(text)) return true;
  if (/^none$/i.test(text) && text.length < 12) return true;
  return false;
}

/**
 * Commitment text eligible for summary AI input.
 * Preserves genuine coach-entered commitments; drops the UI marker.
 */
export function commitmentTextForSummaryAi(
  commitments?: string | null
): string {
  const text = (commitments ?? "").trim();
  if (!text || isNoCommitmentAgreedMarker(text)) return "";
  return text;
}

/**
 * Concatenate debrief + live notes for /api/draft-summary.
 * Does not mutate session fields. Does not overwrite narrative with notes or vice versa.
 */
export function buildDebriefEvidenceForSummary(
  session: DebriefEvidenceSessionFields
): string {
  return [
    session.reflectWhatSurprised,
    session.reflectWhatShifted,
    session.reflectWhatWorked,
    session.reflectDifferently,
    session.notes,
    commitmentTextForSummaryAi(session.commitments),
  ]
    .map(value => (value ?? "").trim())
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Notes string sent to draft-summary after a successful debrief save.
 * Always prefer the explicit saved session — never a pre-save stale object.
 */
export function draftSummaryNotesFromSavedSession(input: {
  savedSession: DebriefEvidenceSessionFields & { id: string };
  selectedSessionId: string;
}): string {
  if (input.savedSession.id !== input.selectedSessionId) {
    throw new Error(
      "Summary generation session ID does not match the selected session."
    );
  }
  return buildDebriefEvidenceForSummary(input.savedSession);
}
