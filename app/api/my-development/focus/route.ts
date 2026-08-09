import { NextResponse } from "next/server";
import { ensureCoachProfile } from "@/lib/auth/session";
import {
  resolveMyDevelopmentActor,
  updateMyDevelopmentFocus,
} from "@/lib/my-development/workspace";
import { requireOrganisationContext } from "@/lib/organisations/current-organisation";
import { supabaseErrorResponse } from "@/lib/supabase/errors";

export const runtime = "nodejs";

/**
 * Set Manager development priorities on the current-org self record.
 */
export async function PUT(request: Request) {
  const auth = await requireOrganisationContext();
  if (!auth.ok) return auth.response;

  let body: { priorities?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const priorities = Array.isArray(body.priorities)
    ? body.priorities.filter((item): item is string => typeof item === "string")
    : null;

  if (!priorities) {
    return NextResponse.json(
      { error: "priorities must be an array of strings." },
      { status: 400 }
    );
  }

  try {
    await ensureCoachProfile(auth.context.supabase, auth.context.user);
    const { fullName } = await resolveMyDevelopmentActor({
      supabase: auth.context.supabase,
      organisationId: auth.context.organisation.organisationId,
      userId: auth.context.user.id,
      email: auth.context.user.email,
    });

    const workspace = await updateMyDevelopmentFocus({
      supabase: auth.context.supabase,
      organisationId: auth.context.organisation.organisationId,
      userId: auth.context.user.id,
      fullName,
      priorities,
    });

    return NextResponse.json({ workspace });
  } catch (error) {
    return supabaseErrorResponse(error);
  }
}
