import type { SupabaseClient } from "@supabase/supabase-js";
import { buildOrganisationInviteAcceptNext } from "@/lib/organisations/invitation-accept-auth";
import { resolveCustomerInviteOrigin } from "@/lib/owner/customer-invite-origin";

export type InvitationAuthDeliveryMethod =
  | "invite"
  | "magiclink_existing_user";

/**
 * Absolute invite/magic-link redirectTo for organisation invitation acceptance.
 * Must use a public CUSTOMER_INVITE_ORIGIN host — never loopback.
 */
export function buildOrganisationInviteRedirectTo(
  siteOrigin: string,
  token: string
): string {
  const origin = siteOrigin.trim().replace(/\/$/, "");
  return `${origin}${buildOrganisationInviteAcceptNext(token)}`;
}

export function isAlreadyRegisteredAuthError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("already been registered") ||
    lower.includes("already registered") ||
    lower.includes("user already exists") ||
    lower.includes("email_exists")
  );
}

async function revokePendingInvitation(
  service: SupabaseClient,
  invitationId: string
): Promise<void> {
  await service
    .from("organisation_invitations")
    .update({ status: "revoked" })
    .eq("id", invitationId)
    .eq("status", "pending");
}

/**
 * Shared Auth email delivery for organisation invitations (Owner Console and
 * Organisation Lead Members invite).
 *
 * New user → inviteUserByEmail
 * Existing user → magic-link OTP (never password recovery)
 * Redirect → CUSTOMER_INVITE_ORIGIN accept URL with organisation token
 *
 * On Auth initiation failure, soft-revokes the pending invitation row.
 */
export async function deliverOrganisationInvitationAuthEmail(input: {
  service: SupabaseClient;
  email: string;
  invitationId: string;
  invitationToken: string;
  userMetadata?: {
    full_name?: string;
    professional_title?: string;
  };
}): Promise<{
  authDelivery: InvitationAuthDeliveryMethod;
  redirectTo: string;
  acceptPath: string;
}> {
  const inviteOrigin = resolveCustomerInviteOrigin();
  if (!inviteOrigin.ok) {
    await revokePendingInvitation(input.service, input.invitationId);
    throw new Error(inviteOrigin.message);
  }

  const acceptPath = buildOrganisationInviteAcceptNext(input.invitationToken);
  const redirectTo = buildOrganisationInviteRedirectTo(
    inviteOrigin.origin,
    input.invitationToken
  );

  const inviteResult = await input.service.auth.admin.inviteUserByEmail(
    input.email,
    {
      data: {
        full_name: input.userMetadata?.full_name,
        professional_title: input.userMetadata?.professional_title,
        // Durable first-time setup flag — only stamped for genuinely new Auth users.
        password_setup_required: true,
      },
      redirectTo,
    }
  );

  if (!inviteResult.error) {
    return {
      authDelivery: "invite",
      redirectTo,
      acceptPath,
    };
  }

  if (isAlreadyRegisteredAuthError(inviteResult.error.message)) {
    const magic = await input.service.auth.signInWithOtp({
      email: input.email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: redirectTo,
      },
    });
    if (magic.error) {
      await revokePendingInvitation(input.service, input.invitationId);
      throw new Error(
        `The invitation email could not be sent: ${magic.error.message}`
      );
    }
    return {
      authDelivery: "magiclink_existing_user",
      redirectTo,
      acceptPath,
    };
  }

  await revokePendingInvitation(input.service, input.invitationId);
  throw new Error(
    `The invitation email could not be sent: ${inviteResult.error.message}`
  );
}
