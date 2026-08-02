import {
  canTransitionToStage,
  deriveSessionStageCompletion,
  type SessionWorkflowStage,
} from "@/lib/session/session-workflow";
import type { Session } from "@/lib/types";

/**
 * Guard a workflow stage change using saved completion state.
 * Backwards navigation to completed/available stages is permitted.
 */
export function guardWorkflowTransition(input: {
  from: SessionWorkflowStage;
  to: SessionWorkflowStage;
  session: Session;
  startedWithoutBrief?: boolean;
}): { ok: true } | { ok: false; reason: string } {
  const completion = deriveSessionStageCompletion(input.session, {
    startedWithoutBrief: input.startedWithoutBrief,
  });

  return canTransitionToStage(
    input.from,
    input.to,
    completion,
    input.session
  );
}

/** Private coach fields that must never be treated as client-facing evidence. */
export const PRIVATE_COACH_FIELDS = [
  "prepPrivateNotes",
  "reflectPrivate",
  "reflection",
] as const;

export type PrivateCoachField = (typeof PRIVATE_COACH_FIELDS)[number];

export function isPrivateCoachField(field: string): field is PrivateCoachField {
  return (PRIVATE_COACH_FIELDS as readonly string[]).includes(field);
}

/**
 * Strip private coach fields from an evidence payload before AI generation.
 * Server-side enforcement remains authoritative; this is a client safety net.
 */
export function excludePrivateCoachFields<T extends Record<string, unknown>>(
  payload: T
): Omit<T, PrivateCoachField> {
  const next = { ...payload };
  for (const field of PRIVATE_COACH_FIELDS) {
    delete next[field];
  }
  return next;
}

export function hasMinimumDebriefEvidence(session: Session): boolean {
  return [
    session.reflectWhatShifted,
    session.reflectWhatSurprised,
    session.reflectWhatWorked,
    session.reflectDifferently,
    session.notes,
    session.commitments,
    session.agreedActions,
  ].some(value => value.trim().length > 0);
}
