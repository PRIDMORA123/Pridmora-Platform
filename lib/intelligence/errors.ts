import { SupabaseDbError } from "@/lib/supabase/errors";

export class IntelligenceMigrationRequiredError extends Error {
  constructor(
    message = "Development intelligence tables are not available yet. Apply the migration supabase/migrations/20260725140000_development_intelligence.sql in the Supabase SQL Editor, then retry."
  ) {
    super(message);
    this.name = "IntelligenceMigrationRequiredError";
  }
}

export function isMissingIntelligenceSchema(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String((error as { message?: string }).message ?? "")
        : String(error ?? "");
  const code =
    error instanceof SupabaseDbError
      ? error.code
      : typeof error === "object" && error && "code" in error
        ? String((error as { code?: string }).code ?? "")
        : "";

  return (
    code === "PGRST205" ||
    /intelligence_items|intelligence_evidence|session_intelligence_reviews|question_insights|person_progress_signals|intelligence_audit_log/i.test(
      message
    ) &&
      (/could not find the table/i.test(message) ||
        /schema cache/i.test(message) ||
        /does not exist/i.test(message))
  );
}

export function toIntelligenceUserError(error: unknown, fallback: string): string {
  if (error instanceof IntelligenceMigrationRequiredError) return error.message;
  if (isMissingIntelligenceSchema(error)) {
    return new IntelligenceMigrationRequiredError().message;
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}
