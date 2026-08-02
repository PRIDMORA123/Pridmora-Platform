import { SupabaseDbError } from "@/lib/supabase/errors";
import {
  IntelligenceMigrationRequiredError,
  isMissingIntelligenceSchema,
} from "@/lib/intelligence/errors";

export class DevelopmentUpdateMigrationRequiredError extends Error {
  constructor(
    message = "Development update tables are not available yet. Apply the migration supabase/migrations/20260725150000_development_updates.sql in the Supabase SQL Editor, then retry."
  ) {
    super(message);
    this.name = "DevelopmentUpdateMigrationRequiredError";
  }
}

export function isMissingDevelopmentUpdateSchema(error: unknown): boolean {
  if (isMissingIntelligenceSchema(error)) return true;

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
    (/development_updates|development_profiles|apply_development_update|discard_development_update/i.test(
      message
    ) &&
      (/could not find the table/i.test(message) ||
        /could not find the function/i.test(message) ||
        /schema cache/i.test(message) ||
        /does not exist/i.test(message)))
  );
}

export function toDevelopmentUpdateUserError(error: unknown, fallback: string): string {
  if (error instanceof DevelopmentUpdateMigrationRequiredError) return error.message;
  if (error instanceof IntelligenceMigrationRequiredError) return error.message;
  if (isMissingDevelopmentUpdateSchema(error)) {
    return new DevelopmentUpdateMigrationRequiredError().message;
  }

  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String((error as { message?: string }).message ?? "")
        : "";

  if (/already been applied/i.test(message)) {
    return "This development update has already been applied.";
  }
  if (/not authorised|not authorized/i.test(message)) {
    return "You do not have access to this development update.";
  }
  if (/discarded/i.test(message)) {
    return "This development update has been discarded.";
  }

  // Never surface raw Postgres / PostgREST messages.
  if (
    /postgres|supabase|pgrst|permission denied|violates|sqlstate|relation|column/i.test(
      message
    )
  ) {
    return fallback;
  }

  if (message.trim()) return message;
  return fallback;
}
