import { NextResponse } from "next/server";
import {
  requireOrganisationContext,
  requireOrganisationPermission,
} from "@/lib/organisations/current-organisation";
import { writeOrganisationAudit } from "@/lib/organisations/repository";
import {
  listOrganisationIntelligenceSnapshots,
  loadOrganisationIntelligenceSnapshot,
  parsePeriodPreset,
  PRIVACY_NOTE,
  resolveOrganisationIntelligencePeriod,
} from "@/lib/organisation-intelligence";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireOrganisationContext();
  if (!auth.ok) return auth.response;

  const denied = requireOrganisationPermission(
    auth.context,
    "intelligence.organisation.read"
  );
  if (denied) return denied;

  const organisationId = auth.context.organisation.organisationId;
  const organisationName = auth.context.organisation.organisation.name;
  const url = new URL(request.url);
  const snapshotId = url.searchParams.get("snapshotId");
  const preset = parsePeriodPreset(url.searchParams.get("period"));

  try {
    const [snapshot, history] = await Promise.all([
      loadOrganisationIntelligenceSnapshot({
        supabase: auth.context.supabase,
        organisationId,
        organisationName,
        snapshotId,
      }),
      listOrganisationIntelligenceSnapshots({
        supabase: auth.context.supabase,
        organisationId,
      }),
    ]);

    await writeOrganisationAudit({
      supabase: auth.context.supabase,
      organisationId,
      actorUserId: auth.context.user.id,
      action: "organisation_intelligence_viewed",
      entityType: "organisation_intelligence_snapshot",
      entityId: snapshot?.id ?? null,
      metadata: {
        hasSnapshot: Boolean(snapshot),
        periodPreset: snapshot?.period.preset ?? preset ?? "last_90_days",
      },
    });

    return NextResponse.json({
      snapshot,
      history,
      defaultPeriod: resolveOrganisationIntelligencePeriod({
        preset: preset ?? "last_90_days",
      }),
      privacyNote: PRIVACY_NOTE,
      confidentialityNote:
        "Organisation Intelligence shows anonymised aggregated development evidence only. Confidential coaching content remains available only to authorised relationship practitioners.",
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to load organisation intelligence.";
    // Table may not exist until migration is applied.
    if (/relation|does not exist|schema cache/i.test(message)) {
      return NextResponse.json({
        snapshot: null,
        history: [],
        defaultPeriod: resolveOrganisationIntelligencePeriod(),
        privacyNote: PRIVACY_NOTE,
        confidentialityNote:
          "Organisation Intelligence shows anonymised aggregated development evidence only. Confidential coaching content remains available only to authorised relationship practitioners.",
        migrationRequired: true,
      });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
