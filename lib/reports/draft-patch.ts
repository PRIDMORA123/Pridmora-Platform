import type { DevelopmentReport } from "@/lib/reports/types";

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
