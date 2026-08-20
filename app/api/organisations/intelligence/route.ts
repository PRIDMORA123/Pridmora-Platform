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
  fetchOrganisationIntelligenceSources,
  hasEnoughEvidenceForOrganisationView,
} from "@/lib/organisation-intelligence";
import {
  getSupabaseServiceClient,
  isSupabaseServiceRoleConfigured,
} from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireOrganisationContext();
  if (!auth.ok) return auth.response;

  const denied = requireOrganisationPermission(
    auth.context,
    "intelligence.organisation.read"
  );
  if (denied) return denied;

  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json(
      { error: "Server configuration is incomplete." },
      { status: 503 }
    );
  }

  const organisationId = auth.context.organisation.organisationId;
  const organisationName = auth.context.organisation.organisation.name;
  const url = new URL(request.url);
  const snapshotId = url.searchParams.get("snapshotId");
  const preset = parsePeriodPreset(url.searchParams.get("period"));
  const periodStart = url.searchParams.get("periodStart") ?? undefined;
  const periodEnd = url.searchParams.get("periodEnd") ?? undefined;
  const resolvedPeriod = resolveOrganisationIntelligencePeriod({
    preset: preset ?? "last_90_days",
    periodStart,
    periodEnd,
  });

  // Authz first. Snapshot persistence/retrieval uses the privileged server
  // client so the Lead JWT never needs direct access to private development tables.
  const snapshotClient = getSupabaseServiceClient();

  try {
    const [snapshot, history] = await Promise.all([
      loadOrganisationIntelligenceSnapshot({
        supabase: snapshotClient,
        organisationId,
        organisationName,
        snapshotId,
      }),
      listOrganisationIntelligenceSnapshots({
        supabase: snapshotClient,
        organisationId,
      }),
    ]);

    let evidenceIndicators: {
      contributingRelationships: number;
      conversations: number;
      readyToGenerate: boolean;
    } | null = null;

    // Empty-state readiness only: scalars from internal aggregation after authz.
    // Never return raw candidate rows / contributorKey to the Lead.
    if (!snapshot && isSupabaseServiceRoleConfigured()) {
      try {
        const aggregates = await fetchOrganisationIntelligenceSources(
          organisationId,
          resolvedPeriod
        );
        evidenceIndicators = {
          contributingRelationships: aggregates.contributingRelationships,
          conversations: aggregates.conversations,
          readyToGenerate: hasEnoughEvidenceForOrganisationView(aggregates),
        };
      } catch {
        evidenceIndicators = null;
      }
    }

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
      evidenceIndicators,
      defaultPeriod: resolveOrganisationIntelligencePeriod({
        preset: preset ?? "last_90_days",
        periodStart,
        periodEnd,
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
    // Genuine missing relation on the privileged client only.
    // JWT schema-cache misses must not be reported as a migration problem.
    if (/relation .* does not exist|does not exist/i.test(message)) {
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
