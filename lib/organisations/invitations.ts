import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  MembershipRole,
  ProfessionalRole,
} from "@/lib/organisations/types";
import { canAssignRole } from "@/lib/organisations/permissions";
import { writeOrganisationAudit } from "@/lib/organisations/repository";
import {
  assertPractitionerSeatAvailable,
  loadPractitionerSeatUsage,
} from "@/lib/organisations/licence";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateInvitationToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashInvitationToken(token) };
}

export async function createOrganisationInvitation(input: {
  supabase: SupabaseClient;
  organisationId: string;
  email: string;
  role: MembershipRole;
  professionalRole: ProfessionalRole | null;
  invitedBy: string;
  actorRole: MembershipRole;
}): Promise<{ invitationId: string; token: string; expiresAt: string }> {
  if (!canAssignRole(input.actorRole, input.role)) {
    throw new Error("Cannot assign that membership role.");
  }

  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    throw new Error("A valid email address is required.");
  }

  // Practitioner invites consume a seat on accept — reserve capacity at invite time.
  if (input.role === "practitioner") {
    const seatUsage = await loadPractitionerSeatUsage(
      input.supabase,
      input.organisationId
    );
    const seatBlock = assertPractitionerSeatAvailable({
      licenceStatus: seatUsage.licence.status,
      seatsPurchased: seatUsage.licence.seatsPurchased,
      seatsInUse: seatUsage.summary.seatsInUse,
      wouldNewlyConsumeSeat: true,
    });
    if (seatBlock) throw new Error(seatBlock);
  }

  // Revoke any existing pending invite for this email.
  await input.supabase
    .from("organisation_invitations")
    .update({ status: "revoked" })
    .eq("organisation_id", input.organisationId)
    .eq("status", "pending")
    .ilike("email", email);

  const { token, tokenHash } = generateInvitationToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();

  const { data, error } = await input.supabase
    .from("organisation_invitations")
    .insert({
      organisation_id: input.organisationId,
      email,
      role: input.role,
      professional_role: input.professionalRole,
      token_hash: tokenHash,
      status: "pending",
      invited_by: input.invitedBy,
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  await writeOrganisationAudit({
    supabase: input.supabase,
    organisationId: input.organisationId,
    actorUserId: input.invitedBy,
    action: "member_invited",
    entityType: "organisation_invitation",
    entityId: data.id,
    metadata: { email, role: input.role, professionalRole: input.professionalRole },
  });

  return { invitationId: data.id as string, token, expiresAt };
}

export async function acceptOrganisationInvitation(input: {
  supabase: SupabaseClient;
  token: string;
  userId: string;
  userEmail: string;
}): Promise<{ organisationId: string }> {
  const tokenHash = hashInvitationToken(input.token);

  const { data: invite, error } = await input.supabase
    .from("organisation_invitations")
    .select("*")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!invite) throw new Error("Invitation not found.");
  if (invite.status !== "pending") {
    throw new Error("Invitation is no longer valid.");
  }
  if (new Date(invite.expires_at as string).getTime() < Date.now()) {
    await input.supabase
      .from("organisation_invitations")
      .update({ status: "expired" })
      .eq("id", invite.id);
    throw new Error("Invitation has expired.");
  }

  const inviteEmail = String(invite.email).trim().toLowerCase();
  const userEmail = input.userEmail.trim().toLowerCase();
  if (inviteEmail !== userEmail) {
    throw new Error("This invitation was issued for a different email address.");
  }

  const organisationId = invite.organisation_id as string;
  const inviteRole = invite.role as MembershipRole;

  // Re-check seat capacity at accept time for practitioner roles.
  if (inviteRole === "practitioner") {
    const seatUsage = await loadPractitionerSeatUsage(
      input.supabase,
      organisationId
    );
    const seatBlock = assertPractitionerSeatAvailable({
      licenceStatus: seatUsage.licence.status,
      seatsPurchased: seatUsage.licence.seatsPurchased,
      seatsInUse: seatUsage.summary.seatsInUse,
      wouldNewlyConsumeSeat: true,
    });
    if (seatBlock) throw new Error(seatBlock);
  }

  // Single-use: mark accepted before creating membership.
  const { data: claimed, error: claimError } = await input.supabase
    .from("organisation_invitations")
    .update({
      status: "accepted",
      accepted_at: new Date().toISOString(),
      accepted_by: input.userId,
    })
    .eq("id", invite.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (claimError) throw new Error(claimError.message);
  if (!claimed) throw new Error("Invitation has already been used.");

  const { error: membershipError } = await input.supabase
    .from("organisation_memberships")
    .upsert(
      {
        organisation_id: organisationId,
        user_id: input.userId,
        role: invite.role,
        professional_role: invite.professional_role,
        status: "active",
        invited_by: invite.invited_by,
        invited_at: invite.created_at,
        joined_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organisation_id,user_id" }
    );

  if (membershipError) throw new Error(membershipError.message);

  await input.supabase
    .from("profiles")
    .update({
      current_organisation_id: organisationId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.userId);

  await writeOrganisationAudit({
    supabase: input.supabase,
    organisationId,
    actorUserId: input.userId,
    action: "member_joined",
    entityType: "organisation_membership",
    entityId: organisationId,
    metadata: { role: invite.role, invitationId: invite.id },
  });

  return { organisationId };
}

export async function revokeOrganisationInvitation(input: {
  supabase: SupabaseClient;
  organisationId: string;
  invitationId: string;
  actorUserId: string;
}): Promise<void> {
  const { error } = await input.supabase
    .from("organisation_invitations")
    .update({ status: "revoked" })
    .eq("id", input.invitationId)
    .eq("organisation_id", input.organisationId)
    .eq("status", "pending");

  if (error) throw new Error(error.message);

  await writeOrganisationAudit({
    supabase: input.supabase,
    organisationId: input.organisationId,
    actorUserId: input.actorUserId,
    action: "invitation_revoked",
    entityType: "organisation_invitation",
    entityId: input.invitationId,
  });
}
