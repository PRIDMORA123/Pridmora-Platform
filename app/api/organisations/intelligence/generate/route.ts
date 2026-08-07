import { NextResponse } from "next/server";
import {
  requireOrganisationContext,
  requireOrganisationPermission,
} from "@/lib/organisations/current-organisation";
import { writeOrganisationAudit } from "@/lib/organisations/repository";
import {
  generateOrganisationIntelligence,
  parsePeriodPreset,
} from "@/lib/organisation-intelligence";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireOrganisationContext();
  if (!auth.ok) return auth.response;

  const denied = requireOrganisationPermission(
    auth.context,
    "intelligence.organisation.read"
  );
  if (denied) return denied;

  let body: {
    period?: string;
    periodStart?: string;
    periodEnd?: string;
  } = {};

  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  // Never trust browser-supplied organisation IDs.
  const organisationId = auth.context.organisation.organisationId;
  const organisationName = auth.context.organisation.organisation.name;

  const result = await generateOrganisationIntelligence({
    supabase: auth.context.supabase,
    organisationId,
    organisationName,
    userId: auth.context.user.id,
    preset: parsePeriodPreset(body.period) ?? body.period,
    periodStart: body.periodStart,
    periodEnd: body.periodEnd,
  });

  if (!result.ok) {
    const status = result.code === "locked" ? 409 : 500;
    return NextResponse.json({ error: result.error, code: result.code }, { status });
  }

  await writeOrganisationAudit({
    supabase: auth.context.supabase,
    organisationId,
    actorUserId: auth.context.user.id,
    action: "organisation_intelligence_generated",
    entityType: "organisation_intelligence_snapshot",
    entityId: result.view.id,
    metadata: {
      periodPreset: result.view.period.preset,
      sourceRelationshipCount: result.view.sourceRelationshipCount,
      sourceConversationCount: result.view.sourceConversationCount,
      emptyState: result.view.emptyState,
      confidenceLevel: result.view.confidenceLevel,
    },
  });

  return NextResponse.json({
    snapshot: result.view,
    stage: result.stage,
  });
}
