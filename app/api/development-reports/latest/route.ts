import { NextResponse } from "next/server";
import { requireOrganisationContext } from "@/lib/organisations/current-organisation";
import { requireAssignedPersonInOrganisation } from "@/lib/organisations/person-access-gate";
import { filterClientIdsToOrganisation } from "@/lib/organisations/workspace-scope";
import { isMissingDevelopmentReportsTable } from "@/lib/reports/availability";
import { developmentReportErrorResponse } from "@/lib/reports/errors";
import { getLatestApprovedDevelopmentReport } from "@/lib/reports/repository";

export async function GET() {
  const auth = await requireOrganisationContext();
  if (!auth.ok) return auth.response;

  try {
    const organisationId = auth.context.organisation.organisationId;
    const report = await getLatestApprovedDevelopmentReport(
      auth.context.supabase,
      auth.context.coachId
    );

    if (!report) {
      return NextResponse.json({
        status: "available",
        report: null,
        organisationId,
      });
    }

    const allowed = await filterClientIdsToOrganisation(
      auth.context.supabase,
      organisationId,
      [report.relationshipId]
    );

    if (!allowed.has(report.relationshipId)) {
      return NextResponse.json({
        status: "available",
        report: null,
        organisationId,
      });
    }

    const access = await requireAssignedPersonInOrganisation({
      clientId: report.relationshipId,
    });
    if (!access.ok) {
      return NextResponse.json({
        status: "available",
        report: null,
        organisationId,
      });
    }

    return NextResponse.json({
      status: "available",
      report,
      organisationId,
    });
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
