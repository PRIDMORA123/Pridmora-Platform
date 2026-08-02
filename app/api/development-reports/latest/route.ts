import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { isMissingDevelopmentReportsTable } from "@/lib/reports/availability";
import { developmentReportErrorResponse } from "@/lib/reports/errors";
import { getLatestApprovedDevelopmentReport } from "@/lib/reports/repository";

export async function GET() {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  try {
    const report = await getLatestApprovedDevelopmentReport(
      auth.context.supabase,
      auth.context.coachId
    );

    return NextResponse.json({ status: "available", report });
  } catch (error) {
    if (isMissingDevelopmentReportsTable(error)) {
      console.error(
        "Development reports migration has not been applied.",
        error
      );
      return NextResponse.json({ status: "unavailable", report: null });
    }
    return developmentReportErrorResponse(
      error,
      "Unable to load the latest approved report."
    );
  }
}
