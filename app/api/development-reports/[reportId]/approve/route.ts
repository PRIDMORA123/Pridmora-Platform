import { NextResponse } from "next/server";
import {
  notFoundOrForbidden,
  requireAuthenticatedUser,
} from "@/lib/auth/session";
import { developmentReportErrorResponse } from "@/lib/reports/errors";
import {
  approveDevelopmentReport,
  getDevelopmentReport,
  updateDraftDevelopmentReport,
} from "@/lib/reports/repository";

type Params = { params: Promise<{ reportId: string }> };

export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  const { reportId } = await params;

  try {
    const body = (await request.json().catch(() => ({}))) as {
      confidentialityConfirmed?: boolean;
      audienceConfirmed?: boolean;
    };

    if (!body.confidentialityConfirmed) {
      return NextResponse.json(
        {
          error:
            "Confidentiality confirmation is required before approving a report.",
        },
        { status: 400 }
      );
    }

    const existing = await getDevelopmentReport(
      auth.context.supabase,
      auth.context.coachId,
      reportId
    );
    if (!existing) return notFoundOrForbidden();

    if (existing.audience === "sponsor" && !body.audienceConfirmed) {
      return NextResponse.json(
        {
          error:
            "Sponsor reports require explicit confirmation of the selected audience.",
        },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    await updateDraftDevelopmentReport(
      auth.context.supabase,
      auth.context.coachId,
      reportId,
      { confidentialityConfirmedAt: now }
    );

    const report = await approveDevelopmentReport(
      auth.context.supabase,
      auth.context.coachId,
      reportId
    );

    return NextResponse.json({ report });
  } catch (error) {
    return developmentReportErrorResponse(error, "Unable to approve report.");
  }
}
