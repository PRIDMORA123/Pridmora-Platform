import { NextResponse } from "next/server";
import { notFoundOrForbidden } from "@/lib/auth/session";
import { requireOrganisationContext } from "@/lib/organisations/current-organisation";
import { requireAssignedPersonInOrganisation } from "@/lib/organisations/person-access-gate";
import { developmentReportErrorResponse } from "@/lib/reports/errors";
import {
  createDraftFromApprovedReport,
  deleteDraftDevelopmentReport,
  getDevelopmentReport,
  updateDraftDevelopmentReport,
} from "@/lib/reports/repository";
import type {
  AssociatedIndicator,
  CoachingImpactMetrics,
  ReportAudience,
  ReportCommitment,
  ReportEvidenceItem,
  ReportTheme,
} from "@/lib/reports/types";

type Params = { params: Promise<{ reportId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const org = await requireOrganisationContext();
  if (!org.ok) return org.response;

  const { reportId } = await params;

  try {
    const report = await getDevelopmentReport(
      org.context.supabase,
      org.context.coachId,
      reportId
    );
    if (!report) return notFoundOrForbidden();

    const access = await requireAssignedPersonInOrganisation({
      clientId: report.relationshipId,
    });
    if (!access.ok) return access.response;

    return NextResponse.json({ report });
  } catch (error) {
    return developmentReportErrorResponse(error, "Unable to load report.");
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const org = await requireOrganisationContext();
  if (!org.ok) return org.response;

  const { reportId } = await params;

  try {
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

    if (existing.status === "approved") {
      const body = (await request.json()) as { createDraftVersion?: boolean };
      if (body.createDraftVersion) {
        const draft = await createDraftFromApprovedReport(
          access.context.supabase,
          access.context.coachId,
          reportId
        );
        return NextResponse.json({ report: draft, createdDraft: true });
      }
      return NextResponse.json(
        {
          error:
            "Approved reports are immutable. Request a new draft version instead.",
        },
        { status: 409 }
      );
    }

    const body = (await request.json()) as {
      title?: string;
      audience?: ReportAudience;
      reportingPeriodStart?: string | null;
      reportingPeriodEnd?: string | null;
      includeCoachStatement?: boolean;
      coachingPurpose?: string | null;
      executiveSummary?: string | null;
      progressSummary?: string | null;
      developmentThemes?: ReportTheme[];
      evidenceItems?: ReportEvidenceItem[];
      commitments?: ReportCommitment[];
      futurePriorities?: string[];
      coachStatement?: string | null;
      associatedIndicators?: AssociatedIndicator[];
      impactMetrics?: CoachingImpactMetrics | null;
    };

    const report = await updateDraftDevelopmentReport(
      access.context.supabase,
      access.context.coachId,
      reportId,
      {
        title: body.title,
        audience: body.audience,
        reportingPeriodStart: body.reportingPeriodStart,
        reportingPeriodEnd: body.reportingPeriodEnd,
        includeCoachStatement: body.includeCoachStatement,
        coachingPurpose: body.coachingPurpose,
        executiveSummary: body.executiveSummary,
        progressSummary: body.progressSummary,
        developmentThemes: body.developmentThemes,
        evidenceItems: body.evidenceItems,
        commitments: body.commitments,
        futurePriorities: body.futurePriorities,
        coachStatement: body.coachStatement,
        associatedIndicators: body.associatedIndicators,
        impactMetrics: body.impactMetrics ?? undefined,
      }
    );

    return NextResponse.json({ report });
  } catch (error) {
    return developmentReportErrorResponse(error, "Unable to update report.");
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const org = await requireOrganisationContext();
  if (!org.ok) return org.response;

  const { reportId } = await params;

  try {
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

    if (existing.status === "approved") {
      return NextResponse.json(
        { error: "Approved reports cannot be deleted." },
        { status: 409 }
      );
    }

    await deleteDraftDevelopmentReport(
      access.context.supabase,
      access.context.coachId,
      reportId
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return developmentReportErrorResponse(error, "Unable to delete report.");
  }
}
