import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CoachingReportPdfDocument } from "@/components/coaching-report-pdf";
import {
  DEFAULT_REPORT_PRIVACY,
  reportTypeLabel,
  type CoachingReportDraft,
  type ReportPrivacyOptions,
} from "@/lib/coaching-report";
import { notFoundOrForbidden } from "@/lib/auth/session";
import { requireAssignedPersonInOrganisation } from "@/lib/organisations/person-access-gate";
import { assertClientActive } from "@/lib/supabase/repository";

export const runtime = "nodejs";

type PdfRequestBody = {
  draft?: CoachingReportDraft;
  privacy?: Partial<ReportPrivacyOptions>;
  clientId?: string;
  approved?: boolean;
  saveReport?: boolean;
};

function filenameFor(draft: CoachingReportDraft): string {
  const type = draft.reportType === "final" ? "final-coaching-report" : "progress-report";
  const safeName = draft.clientName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `development-report-${type}-${safeName || "client"}.pdf`;
}

async function optionallySaveApprovedReport(input: {
  supabase: SupabaseClient;
  coachId: string;
  clientId?: string;
  draft: CoachingReportDraft;
  privacy: ReportPrivacyOptions;
}) {
  if (!input.clientId) return null;

  const activity = await assertClientActive(input.supabase, input.coachId, input.clientId);
  if (activity !== "ok") return null;

  try {
    const { data, error } = await input.supabase
      .from("coaching_reports")
      .insert({
        client_id: input.clientId,
        coach_id: input.coachId,
        report_type: input.draft.reportType,
        selected_session_ids: input.draft.selectedSessionIds,
        approved_content: {
          draft: input.draft,
          privacy: input.privacy,
        },
        approval_status: "approved",
      })
      .select("id")
      .maybeSingle();

    if (error) {
      console.warn("Unable to persist coaching report:", error.message);
      return null;
    }

    return data?.id ?? null;
  } catch (error) {
    console.warn("Unable to persist coaching report:", error);
    return null;
  }
}

export async function POST(request: Request) {
  let body: PdfRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const draft = body.draft;
  if (!draft) {
    return NextResponse.json({ error: "Report draft is required." }, { status: 400 });
  }

  if (!body.approved) {
    return NextResponse.json(
      { error: "Report must be reviewed and approved before export." },
      { status: 400 }
    );
  }

  if (!draft.selectedSessionIds?.length || draft.sessionCount < 1) {
    return NextResponse.json(
      { error: "At least one approved session must be included before export." },
      { status: 400 }
    );
  }

  const access = await requireAssignedPersonInOrganisation({
    clientId: body.clientId,
  });
  if (!access.ok) return access.response;

  {
    const activity = await assertClientActive(
      access.context.supabase,
      access.context.coachId,
      access.clientId
    );
    if (activity === "missing") {
      return notFoundOrForbidden();
    }
    if (activity === "archived") {
      return NextResponse.json(
        {
          error: "This client is archived. Restore them to add new coaching activity.",
        },
        { status: 409 }
      );
    }
  }

  const privacy: ReportPrivacyOptions = {
    ...DEFAULT_REPORT_PRIVACY,
    ...body.privacy,
  };

  try {
    const element = createElement(CoachingReportPdfDocument, { draft, privacy });
    const buffer = await renderToBuffer(element as Parameters<typeof renderToBuffer>[0]);
    const filename = filenameFor(draft);

    let reportId: string | null = null;
    if (body.saveReport !== false) {
      reportId = await optionallySaveApprovedReport({
        supabase: access.context.supabase,
        coachId: access.context.coachId,
        clientId: access.clientId,
        draft,
        privacy,
      });
    }

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        ...(reportId ? { "X-Report-Id": reportId } : {}),
        "X-Report-Type": reportTypeLabel(draft.reportType),
      },
    });
  } catch (error) {
    console.error("Coaching report PDF export error:", error);
    return NextResponse.json(
      { error: "Failed to export PDF. Please try again — your edited report content is preserved." },
      { status: 500 }
    );
  }
}
