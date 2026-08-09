import { NextResponse } from "next/server";
import { notFoundOrForbidden } from "@/lib/auth/session";
import { requireOrganisationContext } from "@/lib/organisations/current-organisation";
import { requireAssignedPersonInOrganisation } from "@/lib/organisations/person-access-gate";
import { developmentReportErrorResponse } from "@/lib/reports/errors";
import {
  approveDevelopmentReport,
  getDevelopmentReport,
  updateDraftDevelopmentReport,
} from "@/lib/reports/repository";

type Params = { params: Promise<{ reportId: string }> };

export async function POST(request: Request, { params }: Params) {
  const org = await requireOrganisationContext();
  if (!org.ok) return org.response;

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
      org.context.supabase,
      org.context.coachId,
      reportId
    );
    if (!existing) return notFoundOrForbidden();

    const access = await requireAssignedPersonInOrganisation({
      clientId: existing.relationshipId,
    });
    if (!access.ok) return access.response;

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
      access.context.supabase,
      access.context.coachId,
      reportId,
      { confidentialityConfirmedAt: now }
    );

    const report = await approveDevelopmentReport(
      access.context.supabase,
      access.context.coachId,
      reportId
    );

    return NextResponse.json({ report });
  } catch (error) {
    return developmentReportErrorResponse(error, "Unable to approve report.");
  }
}
