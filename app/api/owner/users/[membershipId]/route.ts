import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformOwner, ownerValidationResponse } from "@/lib/owner/auth";
import { writePlatformAudit } from "@/lib/owner/audit";
import { MEMBERSHIP_ROLES } from "@/lib/organisations/types";
import { getSupabaseServiceClient, isSupabaseServerConfigured } from "@/lib/supabase/server";

export const runtime = "nodejs";

const patchSchema = z.object({
  action: z.enum([
    "suspend",
    "reactivate",
    "change_role",
    "password_reset",
    "resend_invitation",
  ]),
  role: z.enum(MEMBERSHIP_ROLES).optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ membershipId: string }> }
) {
  const auth = await requirePlatformOwner();
  if (!auth.ok) return auth.response;

  const { membershipId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return ownerValidationResponse("Invalid request body.");
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return ownerValidationResponse("Invalid user action.");
  }

  const { data: membership, error: membershipError } = await auth.context.supabase
    .from("organisation_memberships")
    .select("id, organisation_id, user_id, role, status")
    .eq("id", membershipId)
    .maybeSingle();

  if (membershipError || !membership) {
    return NextResponse.json({ error: "User membership not found." }, { status: 404 });
  }

  const action = parsed.data.action;

  if (action === "suspend") {
    const { error } = await auth.context.supabase
      .from("organisation_memberships")
      .update({
        status: "deactivated",
        deactivated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", membershipId);

    if (error) {
      return NextResponse.json({ error: "Unable to suspend account." }, { status: 500 });
    }

    await writePlatformAudit({
      supabase: auth.context.supabase,
      actorUserId: auth.context.user.id,
      action: "user.suspended",
      entityType: "organisation_membership",
      entityId: membershipId,
      organisationId: membership.organisation_id as string,
      metadata: { userId: membership.user_id },
    });

    return NextResponse.json({ ok: true });
  }

  if (action === "reactivate") {
    const { error } = await auth.context.supabase
      .from("organisation_memberships")
      .update({
        status: "active",
        deactivated_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", membershipId);

    if (error) {
      return NextResponse.json({ error: "Unable to reactivate account." }, { status: 500 });
    }

    await writePlatformAudit({
      supabase: auth.context.supabase,
      actorUserId: auth.context.user.id,
      action: "user.reactivated",
      entityType: "organisation_membership",
      entityId: membershipId,
      organisationId: membership.organisation_id as string,
      metadata: { userId: membership.user_id },
    });

    return NextResponse.json({ ok: true });
  }

  if (action === "change_role") {
    if (!parsed.data.role) {
      return ownerValidationResponse("Role is required.");
    }
    if (parsed.data.role === "owner") {
      return ownerValidationResponse(
        "Organisation owner role transfer is not available from this action."
      );
    }

    const { error } = await auth.context.supabase
      .from("organisation_memberships")
      .update({
        role: parsed.data.role,
        updated_at: new Date().toISOString(),
      })
      .eq("id", membershipId);

    if (error) {
      return NextResponse.json({ error: "Unable to change role." }, { status: 500 });
    }

    await writePlatformAudit({
      supabase: auth.context.supabase,
      actorUserId: auth.context.user.id,
      action: "user.role_changed",
      entityType: "organisation_membership",
      entityId: membershipId,
      organisationId: membership.organisation_id as string,
      metadata: {
        previousRole: membership.role,
        nextRole: parsed.data.role,
      },
    });

    return NextResponse.json({ ok: true });
  }

  if (action === "password_reset" || action === "resend_invitation") {
    if (!isSupabaseServerConfigured()) {
      return NextResponse.json(
        {
          error:
            "Password reset / invitation resend requires server auth configuration.",
        },
        { status: 503 }
      );
    }

    const service = getSupabaseServiceClient();
    const { data: userData, error: userError } =
      await service.auth.admin.getUserById(membership.user_id as string);

    if (userError || !userData.user?.email) {
      return NextResponse.json(
        { error: "Unable to locate user email for this action." },
        { status: 404 }
      );
    }

    const redirectTo =
      action === "password_reset"
        ? `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/auth/reset-password`
        : `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/auth/sign-in`;

    const { error: resetError } = await service.auth.resetPasswordForEmail(
      userData.user.email,
      { redirectTo: redirectTo || undefined }
    );

    if (resetError) {
      console.error("Owner password/invite email failed:", resetError.message);
      return NextResponse.json(
        { error: "Unable to initiate email action." },
        { status: 500 }
      );
    }

    await writePlatformAudit({
      supabase: auth.context.supabase,
      actorUserId: auth.context.user.id,
      action:
        action === "password_reset"
          ? "user.password_reset_initiated"
          : "user.invitation_resent",
      entityType: "organisation_membership",
      entityId: membershipId,
      organisationId: membership.organisation_id as string,
      metadata: { userId: membership.user_id },
    });

    return NextResponse.json({ ok: true });
  }

  return ownerValidationResponse("Unsupported action.");
}
