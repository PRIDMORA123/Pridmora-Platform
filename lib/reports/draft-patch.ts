import type { DevelopmentReport } from "@/lib/reports/types";

type ReportingPeriodDetails = {
  reportingPeriodStart?: string | null;
  reportingPeriodEnd?: string | null;
};

/**
 * Step 1 create/update payload. Empty strings become null so a new row can
 * store an unset bound. Non-empty ISO dates are passed through.
 */
export function reportingPeriodFieldsForCreate(
  details: ReportingPeriodDetails
): {
  reportingPeriodStart: string | null;
  reportingPeriodEnd: string | null;
} {
  return {
    reportingPeriodStart: details.reportingPeriodStart || null,
    reportingPeriodEnd: details.reportingPeriodEnd || null,
  };
}

/**
 * Evidence-step re-save of Step 1 dates onto report columns.
 * Send a field only when it has a value. Never send null here — empty must
 * omit the key so an already persisted date is not cleared.
 */
export function reportingPeriodFieldsForEvidenceResave(
  details: ReportingPeriodDetails
): {
  reportingPeriodStart?: string;
  reportingPeriodEnd?: string;
} {
  const patch: {
    reportingPeriodStart?: string;
    reportingPeriodEnd?: string;
  } = {};
  const start = details.reportingPeriodStart?.trim();
  const end = details.reportingPeriodEnd?.trim();
  if (start) patch.reportingPeriodStart = start;
  if (end) patch.reportingPeriodEnd = end;
  return patch;
}

/**
 * Drop keys whose value is `undefined` so a partial PATCH cannot overwrite
 * persisted fields. Explicit `null` is kept and means “clear this field”.
 */
export function omitUndefinedFields<T extends object>(patch: T): Partial<T> {
  const next: Partial<T> = {};
  for (const key of Object.keys(patch) as Array<keyof T>) {
    if (patch[key] !== undefined) {
      next[key] = patch[key];
    }
  }
  return next;
}

/**
 * Merge a draft patch onto an existing report without treating omitted /
 * undefined keys as clears.
 */
export function applyDevelopmentReportDraftPatch(
  existing: DevelopmentReport,
  patch: Partial<DevelopmentReport>
): DevelopmentReport {
  const defined = omitUndefinedFields(patch);
  return {
    ...existing,
    ...defined,
    id: existing.id,
    relationshipId: existing.relationshipId,
    coachId: existing.coachId,
    status: "draft",
    approvedAt: null,
    confidentialityConfirmedAt:
      defined.confidentialityConfirmedAt !== undefined
        ? defined.confidentialityConfirmedAt
        : existing.confidentialityConfirmedAt,
  };
}
