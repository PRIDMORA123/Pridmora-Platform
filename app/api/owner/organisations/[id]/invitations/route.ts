import { NextResponse } from "next/server";
import {
  requirePlatformOwner,
  ownerValidationResponse,
} from "@/lib/owner/auth";
import { writePlatformAudit } from "@/lib/owner/audit";
import {
  inviteOrganisationManager,
  listOwnerManagerInvitations,
} from "@/lib/owner/invite-manager";
import { inviteManagerSchema } from "@/lib/owner/invite-manager-schema";
import { assertOwnerPayloadIsSafe } from "@/lib/owner/privacy";
import {
  getSupabaseServiceClient,
  isSupabaseServerConfigured,
} from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requirePlatformOwner();
  if (!auth.ok) return auth.response;

  const { id: organisationId } = await context.params;

  try {
    const invitations = await listOwnerManagerInvitations(
      auth.context.supabase,
      organisationId
    );
    const payload = { invitations };
    assertOwnerPayloadIsSafe(payload);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Owner list manager invitations failed:", error);
    return NextResponse.json(
      { error: "Unable to load invitations." },
      { status: 500 }
    );
  }
}

/**
 * Slice 2: Platform Owner invites First Manager (practitioner + professional_role manager).
 * Creates organisation_invitations row and sends Supabase Auth invite email (Brevo SMTP).
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requirePlatformOwner();
  if (!auth.ok) return auth.response;

  if (!isSupabaseServerConfigured()) {
    return NextResponse.json(
      {
        error:
          "Manager invitation requires server auth configuration (service role).",
      },
      { status: 503 }
    );
  }

  const { id: organisationId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return ownerValidationResponse("Invalid request body.");
  }

  const parsed = inviteManagerSchema.safeParse(body);
  if (!parsed.success) {
    const message =
      parsed.error.issues[0]?.message ?? "Invalid invitation payload.";
    return ownerValidationResponse(message);
  }

  try {
    const service = getSupabaseServiceClient();
    const requestOrigin = new URL(request.url).origin;
    const created = await inviteOrganisationManager({
      supabase: auth.context.supabase,
      service,
      organisationId,
      invitedBy: auth.context.user.id,
      requestOrigin,
      payload: parsed.data,
    });

    await writePlatformAudit({
      supabase: auth.context.supabase,
      actorUserId: auth.context.user.id,
      action: "manager.invitation_created",
      entityType: "organisation_invitation",
      entityId: created.invitationId,
      organisationId,
      metadata: {
        email: created.email,
        fullName: created.fullName,
        jobTitle: created.jobTitle,
        role: created.role,
        professionalRole: created.professionalRole,
        authDelivery: created.authDelivery,
        authEmailSent: created.authEmailSent,
      },
    });

    const payload = {
      ok: true as const,
      invitation: {
        id: created.invitationId,
        email: created.email,
        fullName: created.fullName,
        jobTitle: created.jobTitle,
        role: created.role,
        professionalRole: created.professionalRole,
        expiresAt: created.expiresAt,
        status: "pending" as const,
        authEmailSent: created.authEmailSent,
        authDelivery: created.authDelivery,
      },
    };
    assertOwnerPayloadIsSafe(payload);
    return NextResponse.json(payload, { status: 201 });
  } catch (error) {
    console.error("Owner invite manager failed:", error);
    const message =
      error instanceof Error ? error.message : "Unable to invite manager.";
    if (
      message.includes("required") ||
      message.includes("seats") ||
      message.includes("Seats") ||
      message.includes("licence") ||
      message.includes("not found") ||
      message.includes("archived") ||
      message.includes("email could not be sent") ||
      message.includes("Invitation email could not be sent")
    ) {
      return ownerValidationResponse(message);
    }
    return NextResponse.json(
      { error: "Unable to invite manager." },
      { status: 500 }
    );
  }
}
