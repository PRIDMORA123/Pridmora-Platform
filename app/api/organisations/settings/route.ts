import { NextResponse } from "next/server";
import {
  requireOrganisationContext,
  requireOrganisationPermission,
} from "@/lib/organisations/current-organisation";
import { canManageSampleOrganisation } from "@/lib/organisations/permissions";
import { writeOrganisationAudit } from "@/lib/organisations/repository";
import { ORGANISATION_TYPES } from "@/lib/organisations/types";
import {
  formatSeatsInUseLabel,
  loadPractitionerSeatUsage,
} from "@/lib/organisations/licence";
import { DEFAULT_PREPARATION_STYLE, parsePreparationStyle } from "@/lib/preparation-style";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireOrganisationContext();
  if (!auth.ok) return auth.response;

  const denied = requireOrganisationPermission(auth.context, "organisation.manage");
  // Members can view basic settings of their current org.
  const org = auth.context.organisation.organisation;

  let seatsLabel = "—";
  let seats = {
    seatsPurchased: org.licence.seatsPurchased,
    seatsInUse: 0,
    seatsAvailable: org.licence.seatsPurchased,
  };
  try {
    const usage = await loadPractitionerSeatUsage(
      auth.context.supabase,
      org.id
    );
    seats = usage.summary;
    seatsLabel = formatSeatsInUseLabel(usage.summary);
  } catch {
    // Licence columns may be absent pre-migration; fall back to org defaults.
  }

  return NextResponse.json({
    settings: {
      id: org.id,
      name: org.name,
      organisationType: org.organisationType,
      defaultPreparationStyle: org.defaultPreparationStyle,
      aiEnabled: org.aiEnabled,
      dataRetentionPolicyLabel: org.dataRetentionPolicyLabel,
      brandingStatus: org.brandingStatus,
      logoUrl: org.logoUrl,
      licence: {
        planName: org.licence.planName,
        status: org.licence.status,
        startsAt: org.licence.startsAt,
        endsAt: org.licence.endsAt,
        seatsPurchased: seats.seatsPurchased,
        seatsInUse: seats.seatsInUse,
        seatsAvailable: seats.seatsAvailable,
        seatsLabel,
      },
    },
    canManage: !denied,
    canManageSampleOrganisation: canManageSampleOrganisation(
      auth.context.organisation.role
    ),
  });
}

export async function PATCH(request: Request) {
  const auth = await requireOrganisationContext();
  if (!auth.ok) return auth.response;

  const denied = requireOrganisationPermission(auth.context, "organisation.manage");
  if (denied) return denied;

  try {
    const body = (await request.json()) as {
      name?: unknown;
      organisationType?: unknown;
      defaultPreparationStyle?: unknown;
      aiEnabled?: unknown;
      dataRetentionPolicyLabel?: unknown;
    };

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    const auditActions: string[] = [];

    if (typeof body.name === "string" && body.name.trim()) {
      updates.name = body.name.trim();
    }

    if (
      typeof body.organisationType === "string" &&
      (ORGANISATION_TYPES as readonly string[]).includes(body.organisationType)
    ) {
      updates.organisation_type = body.organisationType;
    }

    if (body.defaultPreparationStyle !== undefined) {
      updates.default_preparation_style = parsePreparationStyle(
        body.defaultPreparationStyle,
        DEFAULT_PREPARATION_STYLE
      );
    }

    if (typeof body.aiEnabled === "boolean") {
      updates.ai_enabled = body.aiEnabled;
      auditActions.push("ai_organisation_policy_changed");
    }

    if (
      typeof body.dataRetentionPolicyLabel === "string" &&
      body.dataRetentionPolicyLabel.trim()
    ) {
      updates.data_retention_policy_label = body.dataRetentionPolicyLabel.trim();
    }

    // Licence metadata is operator-managed for pilot — not editable via this API.
    const organisationId = auth.context.organisation.organisationId;
    const { error } = await auth.context.supabase
      .from("organisations")
      .update(updates)
      .eq("id", organisationId);

    if (error) throw new Error(error.message);

    await writeOrganisationAudit({
      supabase: auth.context.supabase,
      organisationId,
      actorUserId: auth.context.user.id,
      action: "organisation_setting_changed",
      entityType: "organisation",
      entityId: organisationId,
      metadata: { fields: Object.keys(updates).filter(k => k !== "updated_at") },
    });

    for (const action of auditActions) {
      await writeOrganisationAudit({
        supabase: auth.context.supabase,
        organisationId,
        actorUserId: auth.context.user.id,
        action,
        entityType: "organisation",
        entityId: organisationId,
        metadata: { aiEnabled: updates.ai_enabled },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update settings.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
