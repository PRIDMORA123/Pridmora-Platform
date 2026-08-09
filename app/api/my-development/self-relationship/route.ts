import { NextResponse } from "next/server";
import { ensureCoachProfile } from "@/lib/auth/session";
import { requireOrganisationContext } from "@/lib/organisations/current-organisation";
import { ensureSelfDevelopmentRelationship } from "@/lib/my-development/self-relationship";
import { supabaseErrorResponse } from "@/lib/supabase/errors";

export const runtime = "nodejs";

/**
 * Ensure / return the authenticated user's own My Development relationship
 * in the current organisation. Never returns a managed-person record.
 */
export async function GET() {
  const auth = await requireOrganisationContext();
  if (!auth.ok) return auth.response;

  try {
    await ensureCoachProfile(auth.context.supabase, auth.context.user);
    const profileName =
      (await auth.context.supabase
        .from("profiles")
        .select("full_name")
        .eq("id", auth.context.user.id)
        .maybeSingle()).data?.full_name ?? "";

    const client = await ensureSelfDevelopmentRelationship({
      supabase: auth.context.supabase,
      organisationId: auth.context.organisation.organisationId,
      userId: auth.context.user.id,
      fullName:
        (typeof profileName === "string" && profileName.trim()) ||
        auth.context.user.email?.split("@")[0] ||
        "My development",
    });

    return NextResponse.json({ client });
  } catch (error) {
    return supabaseErrorResponse(error);
  }
}

export async function POST() {
  return GET();
}
