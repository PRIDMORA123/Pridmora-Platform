import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveAuthSiteOrigin } from "@/lib/auth/recovery";
import { generateInvitationToken } from "@/lib/organisations/invitations";
import {
  assertPractitionerSeatAvailable,
  loadPractitionerSeatUsage,
} from "@/lib/organisations/licence";
import { writeOrganisationAudit } from "@/lib/organisations/repository";
import type { InviteManagerInput } from "@/lib/owner/invite-manager-schema";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type OwnerManagerInvitation = {
  id: string;
  organisationId: string;
  email: string;
  fullName: string | null;
  jobTitle: string | null;
  role: "practitioner";
  professionalRole: "manager";
  status: "pending" | "accepted" | "revoked" | "expired";
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
};

export type InviteManagerResult = {
  invitationId: string;
  email: string;
  fullName: string;
  jobTitle: string | null;
  role: "practitioner";
  professionalRole: "manager";
  expiresAt: string;
  acceptPath: string;
  authEmailSent: boolean;
  authDelivery: "invite" | "recovery_existing_user" | "none";
};

function buildAcceptPath(token: string): string {
  return `/organisation/invitations/accept?token=${encodeURIComponent(token)}`;
}

export function buildManagerInviteRedirectTo(
  siteOrigin: string,
  token: string
): string {
  const origin = siteOrigin.trim().replace(/\/$/, "");
  const next = buildAcceptPath(token);
  return `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
}

function isAlreadyRegisteredError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("already been registered") ||
    lower.includes("already registered") ||
    lower.includes("user already exists") ||
    lower.includes("email_exists")
  );
}

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

export async function listOwnerManagerInvitations(
  supabase: SupabaseClient,
  organisationId: string
): Promise<OwnerManagerInvitation[]> {
  const { data, error } = await supabase
    .from("organisation_invitations")
    .select(
      "id, organisation_id, email, full_name, job_title, role, professional_role, status, expires_at, accepted_at, created_at"
    )
    .eq("organisation_id", organisationId)
    .eq("professional_role", "manager")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map(row => ({
    id: row.id as string,
    organisationId: row.organisation_id as string,
    email: row.email as string,
    fullName: (row.full_name as string | null) ?? null,
    jobTitle: (row.job_title as string | null) ?? null,
    role: "practitioner",
    professionalRole: "manager",
    status: row.status as OwnerManagerInvitation["status"],
    expiresAt: row.expires_at as string,
    acceptedAt: (row.accepted_at as string | null) ?? null,
    createdAt: row.created_at as string,
  }));
}

/**
 * Platform Owner invites a First Manager into a customer organisation.
 * Membership role is always practitioner + professional_role manager.
 * Uses service-role client for invitation insert (platform owners are not org members)
 * and Supabase Auth admin invite email (Brevo SMTP).
 */
export async function inviteOrganisationManager(input: {
  /** RLS-scoped owner client — used for seat/licence reads when possible. */
  supabase: SupabaseClient;
  /** Service-role client — invitation insert + Auth admin. */
  service: SupabaseClient;
  organisationId: string;
  invitedBy: string;
  requestOrigin?: string;
  payload: InviteManagerInput;
}): Promise<InviteManagerResult> {
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
    throw new Error("Cannot invite a manager into an archived organisation.");
  }

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

  // Revoke any existing pending invite for this email in the org.
  await input.service
    .from("organisation_invitations")
    .update({ status: "revoked" })
    .eq("organisation_id", organisationId)
    .eq("status", "pending")
    .ilike("email", email);

  const { token, tokenHash } = generateInvitationToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();
  const acceptPath = buildAcceptPath(token);

  const { data: invitation, error: insertError } = await input.service
    .from("organisation_invitations")
    .insert({
      organisation_id: organisationId,
      email,
      full_name: fullName,
      job_title: jobTitle,
      role: "practitioner",
      professional_role: "manager",
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
      role: "practitioner",
      professionalRole: "manager",
      via: "owner_console",
    },
  });

  const siteOrigin = resolveAuthSiteOrigin(input.requestOrigin);
  const redirectTo = siteOrigin
    ? buildManagerInviteRedirectTo(siteOrigin, token)
    : undefined;

  let authEmailSent = false;
  let authDelivery: InviteManagerResult["authDelivery"] = "none";

  const inviteResult = await input.service.auth.admin.inviteUserByEmail(email, {
    data: {
      full_name: fullName,
      professional_title: jobTitle || "Manager",
    },
    redirectTo,
  });

  if (!inviteResult.error) {
    authEmailSent = true;
    authDelivery = "invite";
  } else if (isAlreadyRegisteredError(inviteResult.error.message)) {
    // Existing Auth user: deliver a recovery email through the same Brevo SMTP path
    // so they can complete setup and land on the accept URL.
    const recovery = await input.service.auth.resetPasswordForEmail(email, {
      redirectTo,
    });
    if (recovery.error) {
      await input.service
        .from("organisation_invitations")
        .update({ status: "revoked" })
        .eq("id", invitationId)
        .eq("status", "pending");
      throw new Error(
        `The invitation email could not be sent: ${recovery.error.message}`
      );
    }
    authEmailSent = true;
    authDelivery = "recovery_existing_user";
  } else {
    await input.service
      .from("organisation_invitations")
      .update({ status: "revoked" })
      .eq("id", invitationId)
      .eq("status", "pending");
    throw new Error(
      `The invitation email could not be sent: ${inviteResult.error.message}`
    );
  }

  return {
    invitationId,
    email,
    fullName,
    jobTitle,
    role: "practitioner",
    professionalRole: "manager",
    expiresAt,
    acceptPath,
    authEmailSent,
    authDelivery,
  };
}
