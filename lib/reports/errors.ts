import { NextResponse } from "next/server";
import { isMissingDevelopmentReportsTable } from "@/lib/reports/availability";

export function developmentReportErrorResponse(
  error: unknown,
  fallback: string
): NextResponse {
  if (isMissingDevelopmentReportsTable(error)) {
    // Log server-side only — never expose migration or SQL details to clients.
    console.error(
      "Development reports migration has not been applied.",
      error
    );
    return NextResponse.json(
      {
        status: "unavailable",
        reports: [],
        error: "Development reporting is being prepared.",
      },
      { status: 503 }
    );
  }

  const message =
    error instanceof Error && error.message.trim()
      ? error.message
      : fallback;

  // Strip infrastructure language from any remaining error payload.
  const safeMessage =
    /migration|supabase|sql|schema cache|relation|development_reports/i.test(
      message
    )
      ? fallback
      : message;

  const status =
    typeof error === "object" &&
    error &&
    "status" in error &&
    typeof (error as { status?: unknown }).status === "number"
      ? (error as { status: number }).status
      : 500;

  return NextResponse.json(
    { error: safeMessage || fallback },
    { status }
  );
}
