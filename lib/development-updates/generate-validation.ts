import { ZodError } from "zod";
import {
  buildDevelopmentSchemaValidationDiagnostic,
  normalizeDevelopmentModelText,
  parseDevelopmentUpdateGeneration,
  type DevelopmentSchemaValidationDiagnostic,
  type DevelopmentUpdateGenerationParsed,
} from "@/lib/development-updates/schema";
import type { EvidenceSummaryItem } from "@/lib/development-updates/types";
import {
  buildIsolationRetryPromptAddon,
  joinAuthorisedEvidenceText,
  validateRelationshipIsolation,
  type RelationshipIsolationContext,
  type RelationshipIsolationResult,
} from "@/lib/relationship-scope";

export { normalizeDevelopmentModelText };
export type { DevelopmentSchemaValidationDiagnostic };

/**
 * Concatenate relationship-scoped Development Update generation sources used
 * as authorised evidence for isolation. Only include text already supplied to
 * this generation request — do not pull unrelated relationship data.
 */
export function buildDevelopmentAuthorisedEvidenceText(input: {
  personContext?: string;
  developmentProfile?: string;
  previousSessions?: string;
  sessionNotes?: string;
  approvedSummary?: string;
  commitments?: string;
  coachReflection?: string;
  approvedIntelligence?: string;
}): string {
  return joinAuthorisedEvidenceText([
    input.personContext,
    input.developmentProfile,
    input.previousSessions,
    input.sessionNotes,
    input.approvedSummary,
    input.commitments,
    input.coachReflection,
    input.approvedIntelligence,
  ]);
}

export const DEVELOPMENT_REJECTION_CODES = [
  "DEVELOPMENT_CROSS_CLIENT",
  "DEVELOPMENT_INVALID_JSON",
  "DEVELOPMENT_SCHEMA_INVALID",
  "DEVELOPMENT_UNSUPPORTED_EVIDENCE",
  "DEVELOPMENT_EMPTY_OUTPUT",
  "DEVELOPMENT_VALIDATION_FAILED",
  "DEVELOPMENT_SESSION_NOT_COMPLETE",
  "DEVELOPMENT_SESSION_MISMATCH",
] as const;

export type DevelopmentRejectionCode = (typeof DEVELOPMENT_REJECTION_CODES)[number];

export type DevelopmentRejectionStage =
  | "session_guard"
  | "parsing"
  | "schema_validation"
  | "relationship_isolation"
  | "evidence_validation";

export type DevelopmentRejection = {
  code: DevelopmentRejectionCode;
  stage: DevelopmentRejectionStage;
  validator: string;
  fieldName?: string;
  /** Safe Zod metadata only — never model/coaching text. */
  validationDiagnostic?: DevelopmentSchemaValidationDiagnostic;
  retryable: boolean;
  isolation?: RelationshipIsolationResult;
  existingProfilePreserved: true;
};

export type DevelopmentAttemptEvaluation =
  | {
      ok: true;
      generation: DevelopmentUpdateGenerationParsed;
      isolation: RelationshipIsolationResult;
    }
  | {
      ok: false;
      rejection: DevelopmentRejection;
    };

const SAFE_MESSAGE = "Development could not be updated safely.";
const SCHEMA_SAFE_MESSAGE =
  "Aurelia returned an update that did not meet the required development-evidence format.";

export function developmentRejectionResponseBody(rejection: DevelopmentRejection) {
  const body: Record<string, unknown> = {
    code: rejection.code,
    rejectionCode: rejection.code,
    error: SAFE_MESSAGE,
    message: SAFE_MESSAGE,
    stage: rejection.stage,
    existingProfilePreserved: true as const,
    retryable: rejection.retryable,
    recoverable: rejection.retryable,
  };

  if (rejection.code === "DEVELOPMENT_SCHEMA_INVALID") {
    body.error = SCHEMA_SAFE_MESSAGE;
    body.message = SCHEMA_SAFE_MESSAGE;
    body.fieldPath =
      rejection.validationDiagnostic?.fieldPath ?? rejection.fieldName ?? null;
    body.issueCode = rejection.validationDiagnostic?.issueCode ?? null;
    if (rejection.validationDiagnostic) {
      body.validationDiagnostic = rejection.validationDiagnostic;
    }
  }

  return body;
}

export function developmentOutputFieldTexts(
  outputText: string
): Record<string, string> {
  const fields: Record<string, string> = {};
  const normalised = normalizeDevelopmentModelText(outputText);
  try {
    const start = normalised.indexOf("{");
    const end = normalised.lastIndexOf("}");
    if (start < 0 || end <= start) {
      return { raw_output: normalised };
    }
    const parsed = JSON.parse(normalised.slice(start, end + 1)) as Record<
      string,
      unknown
    >;
    if (typeof parsed.conversationSummary === "string") {
      fields.conversationSummary = parsed.conversationSummary;
    }
    if (parsed.proposedChanges && typeof parsed.proposedChanges === "object") {
      collectStringLeaves(parsed.proposedChanges, "proposedChanges", fields);
    }
    if (Array.isArray(parsed.evidence)) {
      parsed.evidence.forEach((item, index) => {
        if (!item || typeof item !== "object") return;
        const row = item as Record<string, unknown>;
        if (typeof row.evidenceText === "string") {
          fields[`evidence.${index}.evidenceText`] = row.evidenceText;
        }
        if (typeof row.sourceExcerpt === "string") {
          fields[`evidence.${index}.sourceExcerpt`] = row.sourceExcerpt;
        }
        if (typeof row.changeKey === "string") {
          fields[`evidence.${index}.changeKey`] = row.changeKey;
        }
      });
    }
    if (Object.keys(fields).length === 0) {
      fields.raw_output = normalised;
    }
    return fields;
  } catch {
    return { raw_output: normalised };
  }
}

function collectStringLeaves(
  value: unknown,
  path: string,
  fields: Record<string, string>
): void {
  if (typeof value === "string" && value.trim()) {
    fields[path] = value;
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      collectStringLeaves(entry, `${path}.${index}`, fields);
    });
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      collectStringLeaves(entry, `${path}.${key}`, fields);
    }
  }
}

export function buildDevelopmentRetryPromptAddon(clientDisplayName: string): string {
  return [
    buildIsolationRetryPromptAddon(clientDisplayName),
    "",
    "Return exact JSON only. Do not wrap the response in markdown.",
    "Do not reuse any prior draft wording.",
    "Use only the authorised relationship evidence supplied in this request.",
    `The only client name permitted is: ${clientDisplayName}.`,
    "For proposedChanges add/update items use { \"value\", \"status?\", \"reason?\" } — never { \"from\", \"to\" }.",
  ].join("\n");
}

export function validateDevelopmentEvidenceReferences(
  evidence: EvidenceSummaryItem[],
  allowedSessionIds: Set<string>
): DevelopmentRejection | null {
  for (const [index, item] of evidence.entries()) {
    if (item.sessionId == null || item.sessionId === "") continue;
    if (!allowedSessionIds.has(item.sessionId)) {
      return {
        code: "DEVELOPMENT_UNSUPPORTED_EVIDENCE",
        stage: "evidence_validation",
        validator: "validateDevelopmentEvidenceReferences",
        fieldName: `evidence.${index}.sessionId`,
        retryable: true,
        existingProfilePreserved: true,
      };
    }
  }
  return null;
}

export function evaluateDevelopmentGenerationAttempt(input: {
  outputText: string;
  isolationContext: RelationshipIsolationContext;
  allowedSessionIds: Set<string>;
  attempt: number;
}): DevelopmentAttemptEvaluation {
  const trimmed = input.outputText?.trim() ?? "";
  if (!trimmed) {
    return {
      ok: false,
      rejection: {
        code: "DEVELOPMENT_EMPTY_OUTPUT",
        stage: "parsing",
        validator: "emptyOutput",
        retryable: input.attempt === 1,
        existingProfilePreserved: true,
      },
    };
  }

  const normalised = normalizeDevelopmentModelText(trimmed);
  const fieldTexts = developmentOutputFieldTexts(normalised);
  const isolation = validateRelationshipIsolation(normalised, {
    ...input.isolationContext,
    fieldTexts,
  });

  if (
    isolation.status === "definite_cross_client" ||
    isolation.status === "possible_cross_client"
  ) {
    return {
      ok: false,
      rejection: {
        code: "DEVELOPMENT_CROSS_CLIENT",
        stage: "relationship_isolation",
        validator: "validateRelationshipIsolation",
        fieldName: isolation.fieldName,
        retryable: input.attempt === 1,
        isolation,
        existingProfilePreserved: true,
      },
    };
  }

  let generation: DevelopmentUpdateGenerationParsed;
  try {
    generation = parseDevelopmentUpdateGeneration(normalised);
  } catch (error) {
    if (error instanceof ZodError) {
      const validationDiagnostic =
        buildDevelopmentSchemaValidationDiagnostic(error);
      return {
        ok: false,
        rejection: {
          code: "DEVELOPMENT_SCHEMA_INVALID",
          stage: "schema_validation",
          validator: "developmentUpdateGenerationSchema",
          fieldName: validationDiagnostic.fieldPath ?? undefined,
          validationDiagnostic,
          retryable: input.attempt === 1,
          existingProfilePreserved: true,
        },
      };
    }
    return {
      ok: false,
      rejection: {
        code: "DEVELOPMENT_INVALID_JSON",
        stage: "parsing",
        validator: "extractJsonObject",
        retryable: input.attempt === 1,
        existingProfilePreserved: true,
      },
    };
  }

  const evidenceRejection = validateDevelopmentEvidenceReferences(
    generation.evidence,
    input.allowedSessionIds
  );
  if (evidenceRejection) {
    return {
      ok: false,
      rejection: {
        ...evidenceRejection,
        retryable: evidenceRejection.retryable && input.attempt === 1,
      },
    };
  }

  return { ok: true, generation, isolation };
}

export function logDevelopmentGenerationRejection(input: {
  clientId: string;
  relationshipId: string;
  sessionId: string;
  rejection: DevelopmentRejection;
  attempt: number;
  responseId?: string | null;
  sessionStatus?: string | null;
  sessionNumber?: number | null;
  completedAt?: string | null;
  hasNotes?: boolean;
  hasSummary?: boolean;
}): void {
  console.error("[development-generation] rejected", {
    event: "development_generation_rejected",
    clientId: input.clientId,
    relationshipId: input.relationshipId,
    sessionId: input.sessionId,
    rejectionCode: input.rejection.code,
    rejectionStage: input.rejection.stage,
    validator: input.rejection.validator,
    fieldName: input.rejection.fieldName ?? null,
    validationDiagnostic: input.rejection.validationDiagnostic ?? null,
    attempt: input.attempt,
    responseId: input.responseId ?? null,
    isolationStatus: input.rejection.isolation?.status ?? null,
    isolationMatchType: input.rejection.isolation?.matchType ?? null,
    // Rejection means the colliding token was not grounded in evidence.
    // Never log token/name/PII values in production.
    tokenInAuthorisedEvidence: false,
    sessionStatus: input.sessionStatus ?? null,
    sessionNumber: input.sessionNumber ?? null,
    completedAt: input.completedAt ?? null,
    hasNotes: input.hasNotes ?? null,
    hasSummary: input.hasSummary ?? null,
    createdAt: new Date().toISOString(),
  });
}
