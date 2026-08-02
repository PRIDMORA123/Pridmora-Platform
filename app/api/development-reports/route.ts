import { NextResponse } from "next/server";
import { requireAuthenticatedUser, notFoundOrForbidden } from "@/lib/auth/session";
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
import { assertClientOwned } from "@/lib/supabase/repository";
import { isUuid } from "@/lib/uuid";

const REPORT_TYPES: ReportType[] = [
  "progress_snapshot",
  "development_report",
  "impact_summary",
];

const AUDIENCES: ReportAudience[] = ["coachee", "coach", "sponsor"];

export async function GET(request: Request) {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  const clientId = new URL(request.url).searchParams.get("clientId");
  if (!clientId) {
    return NextResponse.json({ error: "clientId is required." }, { status: 400 });
  }

  try {
    const owned = await assertClientOwned(
      auth.context.supabase,
      auth.context.coachId,
      clientId
    );
    if (!owned) return notFoundOrForbidden();

    const reports = await listDevelopmentReportsForClient(
      auth.context.supabase,
      auth.context.coachId,
      clientId
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
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

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

    const clientId = body.clientId?.trim();
    if (!clientId) {
      return NextResponse.json({ error: "clientId is required." }, { status: 400 });
    }

    const owned = await assertClientOwned(
      auth.context.supabase,
      auth.context.coachId,
      clientId
    );
    if (!owned) return notFoundOrForbidden();

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

    const report = await createDevelopmentReport(auth.context.supabase, {
      coachId: auth.context.coachId,
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
