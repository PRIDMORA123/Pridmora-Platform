/**
 * Shared People / Team Intelligence exclusion rule for Manager self-records.
 * Compatible with production before/after is_self_development column exists.
 */
export function isSelfDevelopmentClientRow(row: {
  is_self_development?: boolean | null;
  role?: string | null;
}): boolean {
  return (
    Boolean(row.is_self_development) ||
    String(row.role ?? "").trim().toLowerCase() === "self development"
  );
}
