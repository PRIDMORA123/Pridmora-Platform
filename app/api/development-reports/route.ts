import { NextResponse } from "next/server";
import { requireAssignedPersonInOrganisation } from "@/lib/organisations/person-access-gate";
import { developmentReportErrorResponse } from "@/lib/reports/errors";
import {
  createDevelopmentReport,
  listDevelopmentReportsForClient,
} from "@/lib/reports/repository";
import {
  defaultAudienceForType,
  defaultTitleForType,
  type ReportAudience,
  type ReportType,
} from "@/lib/reports/types";
import { isUuid } from "@/lib/uuid";

const REPORT_TYPES: ReportType[] = [
  "progress_snapshot",
  "development_report",
  "impact_summary",
];

const AUDIENCES: ReportAudience[] = ["coachee", "coach", "sponsor"];

export async function GET(request: Request) {
  const clientId = new URL(request.url).searchParams.get("clientId");
  const access = await requireAssignedPersonInOrganisation({ clientId });
  if (!access.ok) return access.response;

  try {
    const reports = await listDevelopmentReportsForClient(
      access.context.supabase,
      access.context.coachId,
      access.clientId
    );

    return NextResponse.json({ status: "available", reports });
  } catch (error) {
    return developmentReportErrorResponse(
      error,
      "Unable to load reports right now."
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      clientId?: string;
      type?: ReportType;
      audience?: ReportAudience;
      title?: string;
      reportingPeriodStart?: string | null;
      reportingPeriodEnd?: string | null;
      includeCoachStatement?: boolean;
      coachingPurpose?: string | null;
      personName?: string;
      requestId?: string;
    };

    const access = await requireAssignedPersonInOrganisation({
      clientId: body.clientId,
    });
    if (!access.ok) return access.response;
    const clientId = access.clientId;

    if (!body.type || !REPORT_TYPES.includes(body.type)) {
      return NextResponse.json({ error: "A valid report type is required." }, { status: 400 });
    }

    const audience =
      body.audience && AUDIENCES.includes(body.audience)
        ? body.audience
        : defaultAudienceForType(body.type);

    if (body.type === "impact_summary" && audience !== "sponsor" && !body.audience) {
      // Default already sponsor; if coach explicitly chooses another, require that intent.
    }

    if (body.type === "impact_summary" && audience === "sponsor" && body.audience === "sponsor") {
      // Explicit sponsor audience recorded on the report.
    }

    const title =
      body.title?.trim() ||
      defaultTitleForType(body.type, body.personName?.trim() || "Coaching relationship");

    const requestId =
      body.requestId && isUuid(body.requestId) ? body.requestId : null;

    const report = await createDevelopmentReport(access.context.supabase, {
      coachId: access.context.coachId,
      relationshipId: clientId,
      type: body.type,
      audience,
      title,
      reportingPeriodStart: body.reportingPeriodStart ?? null,
      reportingPeriodEnd: body.reportingPeriodEnd ?? null,
      includeCoachStatement: Boolean(body.includeCoachStatement),
      coachingPurpose: body.coachingPurpose ?? null,
      requestId,
    });

    return NextResponse.json({ report }, { status: 201 });
  } catch (error) {
    return developmentReportErrorResponse(error, "Unable to create report.");
  }
}
