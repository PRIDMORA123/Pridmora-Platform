import { NextResponse } from "next/server";
import {
  requireOrganisationContext,
  requireOrganisationPermission,
} from "@/lib/organisations/current-organisation";
import {
  approveOrganisationGuidance,
  withdrawOrganisationGuidance,
} from "@/lib/organisation-guidance";
import { writeOrganisationAudit } from "@/lib/organisations/repository";

export const runtime = "nodejs";

type GuidanceAction = "approve" | "withdraw";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ guidanceId: string }> }
) {
  const auth = await requireOrganisationContext();
  if (!auth.ok) return auth.response;

  const denied = requireOrganisationPermission(
    auth.context,
    "organisation_guidance.manage"
  );
  if (denied) return denied;

  try {
    const { guidanceId } = await context.params;
    const body = (await request.json()) as { action?: unknown };
    const action =
      typeof body.action === "string" ? body.action.trim() : "";

    if (action !== "approve" && action !== "withdraw") {
      return NextResponse.json(
        { error: "Choose approve or withdraw." },
        { status: 400 }
      );
    }

    const organisationId = auth.context.organisation.organisationId;
    const userId = auth.context.user.id;

    if (action === "approve") {
      await approveOrganisationGuidance({
        supabase: auth.context.supabase,
        organisationId,
        guidanceId,
        userId,
      });
    } else {
      await withdrawOrganisationGuidance({
        supabase: auth.context.supabase,
        organisationId,
        guidanceId,
        userId,
      });
    }

    await writeOrganisationAudit({
      supabase: auth.context.supabase,
      organisationId,
      actorUserId: userId,
      action:
        action === "approve"
          ? "organisation_guidance_approved"
          : "organisation_guidance_withdrawn",
      entityType: "organisation_guidance",
      entityId: guidanceId,
      metadata: {
        status: action === "approve" ? "approved" : "withdrawn",
      },
    });

    return NextResponse.json({
      ok: true,
      status: action === "approve" ? "approved" : "withdrawn",
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to update organisation guidance.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
