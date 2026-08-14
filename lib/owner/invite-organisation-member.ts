import type { SupabaseClient } from "@supabase/supabase-js";
import { generateInvitationToken } from "@/lib/organisations/invitations";
import { buildOrganisationInviteAcceptNext } from "@/lib/organisations/invitation-accept-auth";
import { deliverOrganisationInvitationAuthEmail } from "@/lib/organisations/invitation-auth-delivery";
import {
  assertPractitionerSeatAvailable,
  loadPractitionerSeatUsage,
} from "@/lib/organisations/licence";
import { writeOrganisationAudit } from "@/lib/organisations/repository";
import { resolveCustomerInviteOrigin } from "@/lib/owner/customer-invite-origin";
import type { InviteManagerInput } from "@/lib/owner/invite-manager-schema";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Safe Owner Console invite kinds only — never arbitrary membership roles. */
export const OWNER_INVITE_KINDS = ["lead", "manager"] as const;
export type OwnerInviteKind = (typeof OWNER_INVITE_KINDS)[number];

type InviteRoleMapping = {
  role: "oversight" | "practitioner";
  professionalRole: "manager" | null;
  consumesPractitionerSeat: boolean;
  defaultProfessionalTitle: string;
  auditVia: "owner_console_lead" | "owner_console";
};

const INVITE_KIND_MAPPING: Record<OwnerInviteKind, InviteRoleMapping> = {
  lead: {
    role: "oversight",
    professionalRole: null,
    consumesPractitionerSeat: false,
    defaultProfessionalTitle: "Organisation Lead",
    auditVia: "owner_console_lead",
  },
  manager: {
    role: "practitioner",
    professionalRole: "manager",
    consumesPractitionerSeat: true,
    defaultProfessionalTitle: "Manager",
    auditVia: "owner_console",
  },
};

export type OwnerOrganisationInvitation = {
  id: string;
  organisationId: string;
  email: string;
  fullName: string | null;
  jobTitle: string | null;
  role: "oversight" | "practitioner";
  professionalRole: "manager" | null;
  status: "pending" | "accepted" | "revoked" | "expired";
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
};

export type InviteOrganisationMemberResult = {
  invitationId: string;
  email: string;
  fullName: string;
  jobTitle: string | null;
  role: "oversight" | "practitioner";
  professionalRole: "manager" | null;
  expiresAt: string;
  acceptPath: string;
  authEmailSent: boolean;
  /**
   * invite = Supabase invite email (new user).
   * magiclink_existing_user = magic-link email to accept URL (never recovery).
   * none = invitation row only (no auth email).
   */
  authDelivery: "invite" | "magiclink_existing_user" | "none";
};

/**
 * Safe relative post-auth destination for organisation invitation acceptance.
 * Survives /auth/confirm → sanitizeNextPath → accept page.
 */
export { buildOrganisationInviteAcceptNext } from "@/lib/organisations/invitation-accept-auth";

export { buildOrganisationInviteRedirectTo } from "@/lib/organisations/invitation-auth-delivery";

export { resolveInvitationAcceptLanding } from "@/lib/organisations/invitation-landing";


/**
 * Count pending practitioner invitations that reserve seat capacity at invite time.
 */
export async function countPendingPractitionerInvites(
  supabase: SupabaseClient,
  organisationId: string
): Promise<number> {
  const { count, error } = await supabase
    .from("organisation_invitations")
    .select("id", { count: "exact", head: true })
    .eq("organisation_id", organisationId)
    .eq("status", "pending")
    .eq("role", "practitioner")
    .gt("expires_at", new Date().toISOString());

  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function listOwnerInvitationsByKind(
  supabase: SupabaseClient,
  organisationId: string,
  kind: OwnerInviteKind
): Promise<OwnerOrganisationInvitation[]> {
  const mapping = INVITE_KIND_MAPPING[kind];
  let query = supabase
    .from("organisation_invitations")
    .select(
      "id, organisation_id, email, full_name, job_title, role, professional_role, status, expires_at, accepted_at, created_at"
    )
    .eq("organisation_id", organisationId)
    .eq("role", mapping.role)
    .order("created_at", { ascending: false });

  if (mapping.professionalRole === null) {
    query = query.is("professional_role", null);
  } else {
    query = query.eq("professional_role", mapping.professionalRole);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []).map(row => ({
    id: row.id as string,
    organisationId: row.organisation_id as string,
    email: row.email as string,
    fullName: (row.full_name as string | null) ?? null,
    jobTitle: (row.job_title as string | null) ?? null,
    role: mapping.role,
    professionalRole: mapping.professionalRole,
    status: row.status as OwnerOrganisationInvitation["status"],
    expiresAt: row.expires_at as string,
    acceptedAt: (row.accepted_at as string | null) ?? null,
    createdAt: row.created_at as string,
  }));
}

export async function listOwnerLeadInvitations(
  supabase: SupabaseClient,
  organisationId: string
): Promise<OwnerOrganisationInvitation[]> {
  return listOwnerInvitationsByKind(supabase, organisationId, "lead");
}

export async function listOwnerManagerInvitations(
  supabase: SupabaseClient,
  organisationId: string
): Promise<OwnerOrganisationInvitation[]> {
  return listOwnerInvitationsByKind(supabase, organisationId, "manager");
}

/**
 * Platform Owner invites a Lead or Manager into a customer organisation.
 * Role / professional_role are server-mapped from invite kind only.
 */
export async function inviteOrganisationMember(input: {
  kind: OwnerInviteKind;
  /** RLS-scoped owner client — used for org reads when possible. */
  supabase: SupabaseClient;
  /** Service-role client — invitation insert + Auth admin. */
  service: SupabaseClient;
  organisationId: string;
  invitedBy: string;
  requestOrigin?: string;
  payload: InviteManagerInput;
}): Promise<InviteOrganisationMemberResult> {
  const mapping = INVITE_KIND_MAPPING[input.kind];
  const organisationId = input.organisationId;
  const email = input.payload.email;
  const fullName = input.payload.fullName;
  const jobTitle = input.payload.jobTitle ?? null;

  const { data: org, error: orgError } = await input.supabase
    .from("organisations")
    .select("id, name, status")
    .eq("id", organisationId)
    .maybeSingle();

  if (orgError) throw new Error(orgError.message);
  if (!org) throw new Error("Organisation not found.");
  if (org.status === "archived" || org.status === "pending_closure") {
    throw new Error(
      input.kind === "lead"
        ? "Cannot invite a lead into an archived organisation."
        : "Cannot invite a manager into an archived organisation."
    );
  }

  // Customer emails must use a public origin — never local Pilot loopback.
  // Fail closed before seat work, invitation row insert, or Auth email delivery.
  const inviteOrigin = resolveCustomerInviteOrigin();
  if (!inviteOrigin.ok) {
    throw new Error(inviteOrigin.message);
  }

  if (mapping.consumesPractitionerSeat) {
    const seatUsage = await loadPractitionerSeatUsage(
      input.service,
      organisationId
    );
    const pendingInvites = await countPendingPractitionerInvites(
      input.service,
      organisationId
    );
    const seatBlock = assertPractitionerSeatAvailable({
      licenceStatus: seatUsage.licence.status,
      seatsPurchased: seatUsage.licence.seatsPurchased,
      seatsInUse: seatUsage.summary.seatsInUse + pendingInvites,
      wouldNewlyConsumeSeat: true,
    });
    if (seatBlock) throw new Error(seatBlock);
  }

  // Revoke any existing pending invite for this email in the org.
  await input.service
    .from("organisation_invitations")
    .update({ status: "revoked" })
    .eq("organisation_id", organisationId)
    .eq("status", "pending")
    .ilike("email", email);

  const { token, tokenHash } = generateInvitationToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();
  const acceptPath = buildOrganisationInviteAcceptNext(token);

  const { data: invitation, error: insertError } = await input.service
    .from("organisation_invitations")
    .insert({
      organisation_id: organisationId,
      email,
      full_name: fullName,
      job_title: jobTitle,
      role: mapping.role,
      professional_role: mapping.professionalRole,
      token_hash: tokenHash,
      status: "pending",
      invited_by: input.invitedBy,
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (insertError) throw new Error(insertError.message);

  const invitationId = invitation.id as string;

  await writeOrganisationAudit({
    supabase: input.service,
    organisationId,
    actorUserId: input.invitedBy,
    action: "member_invited",
    entityType: "organisation_invitation",
    entityId: invitationId,
    metadata: {
      email,
      fullName,
      jobTitle,
      role: mapping.role,
      professionalRole: mapping.professionalRole,
      inviteKind: input.kind,
      via: mapping.auditVia,
    },
  });

  const delivered = await deliverOrganisationInvitationAuthEmail({
    service: input.service,
    email,
    invitationId,
    invitationToken: token,
    userMetadata: {
      full_name: fullName,
      professional_title: jobTitle || mapping.defaultProfessionalTitle,
    },
  });

  return {
    invitationId,
    email,
    fullName,
    jobTitle,
    role: mapping.role,
    professionalRole: mapping.professionalRole,
    expiresAt,
    acceptPath: delivered.acceptPath || acceptPath,
    authEmailSent: true,
    authDelivery: delivered.authDelivery,
  };
}

export async function inviteOrganisationLead(input: {
  supabase: SupabaseClient;
  service: SupabaseClient;
  organisationId: string;
  invitedBy: string;
  requestOrigin?: string;
  payload: InviteManagerInput;
}): Promise<InviteOrganisationMemberResult> {
  return inviteOrganisationMember({ ...input, kind: "lead" });
}

export async function inviteOrganisationManager(input: {
  supabase: SupabaseClient;
  service: SupabaseClient;
  organisationId: string;
  invitedBy: string;
  requestOrigin?: string;
  payload: InviteManagerInput;
}): Promise<InviteOrganisationMemberResult> {
  return inviteOrganisationMember({ ...input, kind: "manager" });
}
