import type {
  IsolationStatus,
  RelationshipIsolationContext,
  RelationshipIsolationResult,
} from "@/lib/relationship-scope";
import {
  preparationOutputFieldTexts,
  validateRelationshipIsolation,
} from "@/lib/relationship-scope";

export type PreparationIsolationAttemptResult = {
  status: IsolationStatus;
  attempt: number;
  check: RelationshipIsolationResult;
  /** True when a second generation should be attempted. */
  shouldRetry: boolean;
  /** True when the draft is safe to persist. */
  maySave: boolean;
};

/**
 * Evaluate a preparation draft against relationship isolation rules.
 * Callers must not save when `maySave` is false.
 * Rejected draft text must never be reused as model input on retry.
 */
export function evaluatePreparationIsolationAttempt(input: {
  draftText: string;
  context: RelationshipIsolationContext;
  attempt: number;
}): PreparationIsolationAttemptResult {
  const check = validateRelationshipIsolation(input.draftText, {
    ...input.context,
    fieldTexts:
      input.context.fieldTexts ?? preparationOutputFieldTexts(input.draftText),
  });

  const failed =
    check.status === "definite_cross_client" ||
    check.status === "possible_cross_client";

  return {
    status: check.status,
    attempt: input.attempt,
    check,
    shouldRetry: failed && input.attempt === 1,
    maySave: check.status === "pass",
  };
}

/**
 * Pure request-scoped prompt payload builder used to assert concurrent
 * preparations cannot share mutable prompt buffers.
 */
export function buildScopedPreparationRequestState(input: {
  coachId: string;
  relationshipId: string;
  sessionId: string;
  evidenceRevision: string;
  clientDisplayName: string;
  authorisedEvidence: string;
  organisationId?: string;
}): {
  cacheKey: string;
  promptClientName: string;
  evidence: string;
} {
  return {
    cacheKey: [
      "prepare",
      input.coachId,
      input.organisationId ?? "",
      input.relationshipId,
      input.sessionId,
      input.evidenceRevision,
    ].join(":"),
    promptClientName: input.clientDisplayName,
    evidence: input.authorisedEvidence,
  };
}
