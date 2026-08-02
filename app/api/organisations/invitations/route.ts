import { NextResponse } from "next/server";
import {
  requireOrganisationContext,
  requireOrganisationPermission,
} from "@/lib/organisations/current-organisation";
import {
  createOrganisationInvitation,
  revokeOrganisationInvitation,
  acceptOrganisationInvitation,
} from "@/lib/organisations/invitations";
import { parseMembershipRole } from "@/lib/organisations/permissions";
import type { ProfessionalRole } from "@/lib/organisations/types";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireOrganisationContext();
  if (!auth.ok) return auth.response;

  const denied = requireOrganisationPermission(auth.context, "members.invite");
  if (denied) return denied;

  const { data, error } = await auth.context.supabase
    .from("organisation_invitations")
    .select(
      "id, organisation_id, email, role, professional_role, status, invited_by, expires_at, accepted_at, created_at"
    )
    .eq("organisation_id", auth.context.organisation.organisationId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    invitations: (data ?? []).map(row => ({
      id: row.id,
      organisationId: row.organisation_id,
      email: row.email,
      role: row.role,
      professionalRole: row.professional_role,
      status: row.status,
      invitedBy: row.invited_by,
      expiresAt: row.expires_at,
      acceptedAt: row.accepted_at,
      createdAt: row.created_at,
    })),
  });
}

export async function POST(request: Request) {
  const auth = await requireOrganisationContext();
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as {
      action?: unknown;
      email?: unknown;
      role?: unknown;
      professionalRole?: unknown;
      invitationId?: unknown;
      token?: unknown;
    };

    // Accept flow — any authenticated user with matching email.
    if (body.action === "accept") {
      const token = typeof body.token === "string" ? body.token : "";
      if (!token) {
        return NextResponse.json({ error: "token is required." }, { status: 400 });
      }
      const email = auth.context.user.email;
      if (!email) {
        return NextResponse.json(
          { error: "Your account email is required to accept an invitation." },
          { status: 400 }
        );
      }

      const result = await acceptOrganisationInvitation({
        supabase: auth.context.supabase,
        token,
        userId: auth.context.user.id,
        userEmail: email,
      });

      return NextResponse.json({ ok: true, organisationId: result.organisationId });
    }

    if (body.action === "revoke") {
      const denied = requireOrganisationPermission(auth.context, "members.invite");
      if (denied) return denied;
      const invitationId =
        typeof body.invitationId === "string" ? body.invitationId : "";
      if (!invitationId) {
        return NextResponse.json({ error: "invitationId is required." }, { status: 400 });
      }
      await revokeOrganisationInvitation({
        supabase: auth.context.supabase,
        organisationId: auth.context.organisation.organisationId,
        invitationId,
        actorUserId: auth.context.user.id,
      });
      return NextResponse.json({ ok: true });
    }

    // Create invitation
    const denied = requireOrganisationPermission(auth.context, "members.invite");
    if (denied) return denied;

    const email = typeof body.email === "string" ? body.email : "";
    const role = parseMembershipRole(body.role);
    if (!role) {
      return NextResponse.json({ error: "A valid role is required." }, { status: 400 });
    }

    const professionalRole =
      typeof body.professionalRole === "string"
        ? (body.professionalRole as ProfessionalRole)
        : null;

    const created = await createOrganisationInvitation({
      supabase: auth.context.supabase,
      organisationId: auth.context.organisation.organisationId,
      email,
      role,
      professionalRole,
      invitedBy: auth.context.user.id,
      actorRole: auth.context.organisation.role,
    });

    // Return token once for the inviter to share — never stored in plain text.
    return NextResponse.json(
      {
        invitationId: created.invitationId,
        expiresAt: created.expiresAt,
        acceptPath: `/organisation/invitations/accept?token=${encodeURIComponent(created.token)}`,
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to process invitation.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
