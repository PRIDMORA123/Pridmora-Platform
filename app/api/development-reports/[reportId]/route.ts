import { NextResponse } from "next/server";
import {
  notFoundOrForbidden,
  requireAuthenticatedUser,
} from "@/lib/auth/session";
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
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  const { reportId } = await params;

  try {
    const report = await getDevelopmentReport(
      auth.context.supabase,
      auth.context.coachId,
      reportId
    );
    if (!report) return notFoundOrForbidden();
    return NextResponse.json({ report });
  } catch (error) {
    return developmentReportErrorResponse(error, "Unable to load report.");
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  const { reportId } = await params;

  try {
    const existing = await getDevelopmentReport(
      auth.context.supabase,
      auth.context.coachId,
      reportId
    );
    if (!existing) return notFoundOrForbidden();

    if (existing.status === "approved") {
      const body = (await request.json()) as { createDraftVersion?: boolean };
      if (body.createDraftVersion) {
        const draft = await createDraftFromApprovedReport(
          auth.context.supabase,
          auth.context.coachId,
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
      auth.context.supabase,
      auth.context.coachId,
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
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  const { reportId } = await params;

  try {
    const existing = await getDevelopmentReport(
      auth.context.supabase,
      auth.context.coachId,
      reportId
    );
    if (!existing) return notFoundOrForbidden();
    if (existing.status === "approved") {
      return NextResponse.json(
        { error: "Approved reports cannot be deleted." },
        { status: 409 }
      );
    }

    await deleteDraftDevelopmentReport(
      auth.context.supabase,
      auth.context.coachId,
      reportId
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return developmentReportErrorResponse(error, "Unable to delete report.");
  }
}
