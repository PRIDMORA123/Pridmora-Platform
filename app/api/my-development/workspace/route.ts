import { NextResponse } from "next/server";
import { ensureCoachProfile } from "@/lib/auth/session";
import {
  loadMyDevelopmentWorkspace,
  resolveMyDevelopmentActor,
} from "@/lib/my-development/workspace";
import { requireOrganisationContext } from "@/lib/organisations/current-organisation";
import { supabaseErrorResponse } from "@/lib/supabase/errors";

export const runtime = "nodejs";

/**
 * Manager My Development overview for the current organisation only.
 */
export async function GET() {
  const auth = await requireOrganisationContext();
  if (!auth.ok) return auth.response;

  try {
    await ensureCoachProfile(auth.context.supabase, auth.context.user);
    const { fullName } = await resolveMyDevelopmentActor({
      supabase: auth.context.supabase,
      organisationId: auth.context.organisation.organisationId,
      userId: auth.context.user.id,
      email: auth.context.user.email,
    });

    const workspace = await loadMyDevelopmentWorkspace({
      supabase: auth.context.supabase,
      organisationId: auth.context.organisation.organisationId,
      userId: auth.context.user.id,
      fullName,
    });

    return NextResponse.json({ workspace });
  } catch (error) {
    return supabaseErrorResponse(error);
  }
}
