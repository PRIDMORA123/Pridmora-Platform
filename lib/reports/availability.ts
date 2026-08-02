import type { DevelopmentReport } from "@/lib/reports/types";

export type ReportsAvailability =
  | {
      status: "available";
      reports: DevelopmentReport[];
    }
  | {
      status: "unavailable";
      reports: [];
    };

export function isMissingDevelopmentReportsTable(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
  };

  const combined = [candidate.message, candidate.details, candidate.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    candidate.code === "42P01" ||
    (combined.includes("development_reports") &&
      (combined.includes("does not exist") ||
        combined.includes("schema cache") ||
        combined.includes("could not find the table")))
  );
}

/** Never expose migration filenames, SQL, or table diagnostics to the UI. */
export function toSafeReportsUserMessage(error: unknown): string {
  if (isMissingDevelopmentReportsTable(error)) {
    return "";
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (
      message.includes("migration") ||
      message.includes("supabase") ||
      message.includes("sql") ||
      message.includes("development_reports") ||
      message.includes("schema cache") ||
      message.includes("relation")
    ) {
      return "Unable to load reports right now. Please try again shortly.";
    }
  }

  return "Unable to load reports right now. Please try again shortly.";
}
