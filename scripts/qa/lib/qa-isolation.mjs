/**
 * Relationship isolation assertions.
 * Imports application helpers via relative paths (no @/ alias required).
 */
import {
  containsUnexpectedPersonName,
  getPrepareQueryKey,
  preparationOutputFieldTexts,
  validateRelationshipIsolation,
} from "../../../lib/relationship-scope.ts";

export {
  containsUnexpectedPersonName,
  getPrepareQueryKey,
  validateRelationshipIsolation,
};

/**
 * Mirrors lib/coaching-intelligence/preparation-isolation.ts
 * (relative import avoids @/ alias under Node strip-types).
 */
export function evaluatePreparationIsolationAttempt(input) {
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

export function buildScopedPreparationRequestState(input) {
  return {
    cacheKey: [
      "prepare",
      input.coachId,
      input.relationshipId,
      input.sessionId,
      input.evidenceRevision,
    ].join(":"),
    promptClientName: input.clientDisplayName,
    evidence: input.authorisedEvidence,
  };
}

export function assertRecordBelongsToRelationship(record, relationshipId) {
  const actual =
    record?.relationshipId ||
    record?.clientId ||
    record?.client_id ||
    record?.relationship_id ||
    null;
  if (actual !== relationshipId) {
    const error = new Error("QA_RELATIONSHIP_MISMATCH");
    error.code = "QA_RELATIONSHIP_MISMATCH";
    error.safeDetails = {
      expectedRelationshipId: relationshipId,
      actualRelationshipId: actual,
    };
    throw error;
  }
}

export function assertSessionBelongsToClient(session, clientId) {
  const actual = session?.clientId || session?.client_id || null;
  if (actual !== clientId) {
    const error = new Error("QA_SESSION_CLIENT_MISMATCH");
    error.code = "QA_SESSION_CLIENT_MISMATCH";
    error.safeDetails = {
      expectedClientId: clientId,
      actualClientId: actual,
      sessionId: session?.id || null,
    };
    throw error;
  }
}

export function assertEvidenceBelongsToRelationship(
  evidenceReferences,
  relationshipId
) {
  const items = Array.isArray(evidenceReferences) ? evidenceReferences : [];
  for (const item of items) {
    const actual =
      item?.relationshipId ||
      item?.clientId ||
      item?.client_id ||
      item?.relationship_id ||
      null;
    if (actual && actual !== relationshipId) {
      const error = new Error("QA_EVIDENCE_CROSS_RELATIONSHIP");
      error.code = "QA_EVIDENCE_CROSS_RELATIONSHIP";
      error.safeDetails = {
        expectedRelationshipId: relationshipId,
        actualRelationshipId: actual,
        evidenceId: item?.id || null,
      };
      throw error;
    }
  }
}

export function assertNoUnexpectedClientNames(
  generatedContent,
  expectedClient,
  allFixtureClients
) {
  const knownOtherNames = allFixtureClients
    .map(c => c.displayName)
    .filter(name => name && name !== expectedClient.displayName);

  const check = validateRelationshipIsolation(String(generatedContent || ""), {
    allowedClientName: expectedClient.displayName,
    organisationName: expectedClient.organisation || "",
    knownOtherNames,
  });

  if (check.status !== "pass") {
    const error = new Error("QA_CROSS_CLIENT_NAME");
    error.code = "QA_CROSS_CLIENT_NAME";
    error.safeDetails = {
      status: check.status,
      matchType: check.matchType || null,
      expectedClientId: expectedClient.clientId,
      fieldName: check.fieldName || null,
    };
    throw error;
  }

  return check;
}

export function assertNoCrossCoachVisibility(visibleRelationships, coachId) {
  for (const row of visibleRelationships || []) {
    const owner = row.coachId || row.coach_id || null;
    if (owner && owner !== coachId) {
      const error = new Error("QA_CROSS_COACH_VISIBILITY");
      error.code = "QA_CROSS_COACH_VISIBILITY";
      error.safeDetails = {
        expectedCoachId: coachId,
        actualCoachId: owner,
        relationshipId: row.id || row.clientId || null,
      };
      throw error;
    }
  }
}

export function assertExplicitSessionUsed(requestTrace, expectedSessionId) {
  if (!requestTrace?.sessionId || requestTrace.sessionId !== expectedSessionId) {
    const error = new Error("QA_WRONG_SESSION");
    error.code = "QA_WRONG_SESSION";
    error.safeDetails = {
      expectedSessionId,
      actualSessionId: requestTrace?.sessionId || null,
      operation: requestTrace?.operation || null,
    };
    throw error;
  }
}

export function assertCacheKeysDistinct(keys) {
  const unique = new Set(keys);
  if (unique.size !== keys.length) {
    const error = new Error("QA_CACHE_COLLISION");
    error.code = "QA_CACHE_COLLISION";
    error.safeDetails = {
      keyCount: keys.length,
      uniqueCount: unique.size,
    };
    throw error;
  }
}
