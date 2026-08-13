import { NextResponse } from "next/server";
import {
  requirePlatformOwner,
  ownerValidationResponse,
} from "@/lib/owner/auth";
import { writePlatformAudit } from "@/lib/owner/audit";
import { ownerInvitePayloadSchema } from "@/lib/owner/invite-kind-schema";
import {
  inviteOrganisationLead,
  inviteOrganisationManager,
  listOwnerLeadInvitations,
  listOwnerManagerInvitations,
} from "@/lib/owner/invite-organisation-member";
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
    const [invitations, leadInvitations] = await Promise.all([
      listOwnerManagerInvitations(auth.context.supabase, organisationId),
      listOwnerLeadInvitations(auth.context.supabase, organisationId),
    ]);
    const payload = { invitations, leadInvitations };
    assertOwnerPayloadIsSafe(payload);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Owner list invitations failed:", error);
    return NextResponse.json(
      { error: "Unable to load invitations." },
      { status: 500 }
    );
  }
}

/**
 * Platform Owner invites Lead (oversight) or Manager (practitioner + manager).
 * inviteKind is the only client-selectable type; roles are server-mapped.
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
          "Organisation invitation requires server auth configuration (service role).",
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

  // Reject browser attempts to supply membership / professional roles.
  if (
    body &&
    typeof body === "object" &&
    ("role" in body ||
      "professionalRole" in body ||
      "professional_role" in body ||
      "membershipRole" in body)
  ) {
    return ownerValidationResponse(
      "Invitation role is determined by the server and cannot be supplied by the client."
    );
  }

  const parsed = ownerInvitePayloadSchema.safeParse(body);
  if (!parsed.success) {
    const message =
      parsed.error.issues[0]?.message ?? "Invalid invitation payload.";
    return ownerValidationResponse(message);
  }

  const inviteKind = parsed.data.inviteKind;
  const payload = {
    fullName: parsed.data.fullName,
    email: parsed.data.email,
    jobTitle: parsed.data.jobTitle,
  };

  try {
    const service = getSupabaseServiceClient();
    const requestOrigin = new URL(request.url).origin;
    const inviteFn =
      inviteKind === "lead"
        ? inviteOrganisationLead
        : inviteOrganisationManager;
    const created = await inviteFn({
      supabase: auth.context.supabase,
      service,
      organisationId,
      invitedBy: auth.context.user.id,
      requestOrigin,
      payload,
    });

    const auditAction =
      inviteKind === "lead"
        ? "lead.invitation_created"
        : "manager.invitation_created";

    await writePlatformAudit({
      supabase: auth.context.supabase,
      actorUserId: auth.context.user.id,
      action: auditAction,
      entityType: "organisation_invitation",
      entityId: created.invitationId,
      organisationId,
      metadata: {
        email: created.email,
        fullName: created.fullName,
        jobTitle: created.jobTitle,
        role: created.role,
        professionalRole: created.professionalRole,
        inviteKind,
        authDelivery: created.authDelivery,
        authEmailSent: created.authEmailSent,
      },
    });

    const responseInvitation = {
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
      inviteKind,
    };

    const responsePayload = {
      ok: true as const,
      invitation: responseInvitation,
    };
    assertOwnerPayloadIsSafe(responsePayload);
    return NextResponse.json(responsePayload, { status: 201 });
  } catch (error) {
    console.error("Owner invite organisation member failed:", error);
    const message =
      error instanceof Error ? error.message : "Unable to send invitation.";
    if (
      message.includes("required") ||
      message.includes("seats") ||
      message.includes("Seats") ||
      message.includes("licence") ||
      message.includes("not found") ||
      message.includes("archived") ||
      message.includes("email could not be sent") ||
      message.includes("Invitation email could not be sent") ||
      message.includes("public invitation URL") ||
      message.includes("Customer invitations are unavailable")
    ) {
      return ownerValidationResponse(message);
    }
    return NextResponse.json(
      {
        error:
          inviteKind === "lead"
            ? "Unable to invite lead."
            : "Unable to invite manager.",
      },
      { status: 500 }
    );
  }
}
