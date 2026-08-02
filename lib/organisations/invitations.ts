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

export const INVITATION_ACCEPT_ERROR_CODES = [
  "INVITATION_INVALID",
  "INVITATION_EXPIRED",
  "INVITATION_ALREADY_USED",
  "INVITATION_EMAIL_MISMATCH",
  "INVITATION_MEMBERSHIP_EXISTS",
] as const;

export type InvitationAcceptErrorCode =
  (typeof INVITATION_ACCEPT_ERROR_CODES)[number];

export class InvitationAcceptError extends Error {
  readonly code: InvitationAcceptErrorCode;

  constructor(code: InvitationAcceptErrorCode, message?: string) {
    super(message ?? invitationAcceptErrorMessage(code));
    this.name = "InvitationAcceptError";
    this.code = code;
  }
}

export function invitationAcceptErrorMessage(
  code: InvitationAcceptErrorCode
): string {
  switch (code) {
    case "INVITATION_EXPIRED":
      return "Invitation has expired.";
    case "INVITATION_ALREADY_USED":
      return "Invitation has already been used.";
    case "INVITATION_EMAIL_MISMATCH":
      return "This invitation was issued for a different email address.";
    case "INVITATION_MEMBERSHIP_EXISTS":
      return "You already have an active membership in this organisation.";
    case "INVITATION_INVALID":
    default:
      return "Invitation not found or is no longer valid.";
  }
}

function isInvitationAcceptErrorCode(
  value: unknown
): value is InvitationAcceptErrorCode {
  return (
    typeof value === "string" &&
    (INVITATION_ACCEPT_ERROR_CODES as readonly string[]).includes(value)
  );
}

/**
 * Accept a pending invitation via SECURITY DEFINER RPC.
 * Role / professional_role / organisation_id are taken from the invitation row —
 * never from client-supplied fields. Direct membership INSERT remains RLS-blocked
 * for invitees.
 */
export async function acceptOrganisationInvitation(input: {
  supabase: SupabaseClient;
  token: string;
  userId: string;
  userEmail: string;
}): Promise<{
  organisationId: string;
  membershipId: string;
  role: MembershipRole;
  professionalRole: ProfessionalRole | null;
}> {
  if (!input.token.trim()) {
    throw new InvitationAcceptError("INVITATION_INVALID");
  }
  if (!input.userEmail.trim()) {
    throw new InvitationAcceptError("INVITATION_EMAIL_MISMATCH");
  }

  const { data, error } = await input.supabase.rpc(
    "accept_organisation_invitation",
    { invitation_token: input.token }
  );

  if (error) {
    // Prefer structured codes when PostgREST surfaces them in the message.
    const maybeCode = INVITATION_ACCEPT_ERROR_CODES.find(code =>
      error.message.includes(code)
    );
    if (maybeCode) throw new InvitationAcceptError(maybeCode);
    throw new Error(error.message);
  }

  const payload = (data ?? null) as
    | {
        ok?: boolean;
        code?: string;
        organisation_id?: string;
        membership_id?: string;
        role?: string;
        professional_role?: string | null;
      }
    | null;

  if (!payload || payload.ok !== true) {
    const code = isInvitationAcceptErrorCode(payload?.code)
      ? payload.code
      : "INVITATION_INVALID";
    throw new InvitationAcceptError(code);
  }

  if (!payload.organisation_id || !payload.membership_id || !payload.role) {
    throw new InvitationAcceptError("INVITATION_INVALID");
  }

  return {
    organisationId: payload.organisation_id,
    membershipId: payload.membership_id,
    role: payload.role as MembershipRole,
    professionalRole: (payload.professional_role as ProfessionalRole | null) ?? null,
  };
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
