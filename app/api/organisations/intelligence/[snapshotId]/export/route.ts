import { NextResponse } from "next/server";
import {
  requireOrganisationContext,
  requireOrganisationPermission,
} from "@/lib/organisations/current-organisation";
import { writeOrganisationAudit } from "@/lib/organisations/repository";
import {
  buildOrganisationIntelligenceExportHtml,
  loadOrganisationIntelligenceSnapshot,
} from "@/lib/organisation-intelligence";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ snapshotId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireOrganisationContext();
  if (!auth.ok) return auth.response;

  const denied = requireOrganisationPermission(
    auth.context,
    "intelligence.organisation.read"
  );
  if (denied) return denied;

  const { snapshotId } = await context.params;
  const organisationId = auth.context.organisation.organisationId;

  try {
    const snapshot = await loadOrganisationIntelligenceSnapshot({
      supabase: auth.context.supabase,
      organisationId,
      organisationName: auth.context.organisation.organisation.name,
      snapshotId,
    });

    if (!snapshot) {
      return NextResponse.json({ error: "Snapshot not found." }, { status: 404 });
    }

    // Export must obey suppression: buildOrganisationIntelligenceExportHtml
    // already filters suppressed themes/metrics and never includes identity.
    const html = buildOrganisationIntelligenceExportHtml(snapshot);

    await writeOrganisationAudit({
      supabase: auth.context.supabase,
      organisationId,
      actorUserId: auth.context.user.id,
      action: "organisation_intelligence_exported",
      entityType: "organisation_intelligence_snapshot",
      entityId: snapshot.id,
      metadata: {
        format: "html",
        suppressedThemesOmitted: true,
      },
    });

    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="organisation-intelligence-${snapshot.period.periodStart}-${snapshot.period.periodEnd}.html"`,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to export snapshot.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
