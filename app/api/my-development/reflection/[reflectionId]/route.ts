import { NextResponse } from "next/server";
import { ensureCoachProfile } from "@/lib/auth/session";
import {
  getMyDevelopmentReflection,
  resolveMyDevelopmentActor,
} from "@/lib/my-development/workspace";
import { requireOrganisationContext } from "@/lib/organisations/current-organisation";
import { supabaseErrorResponse } from "@/lib/supabase/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ reflectionId: string }> };

/**
 * Read a single Manager reflection from the current-org self record.
 */
export async function GET(_request: Request, { params }: Params) {
  const auth = await requireOrganisationContext();
  if (!auth.ok) return auth.response;

  const { reflectionId } = await params;
  if (!reflectionId?.trim()) {
    return NextResponse.json({ error: "Reflection not found." }, { status: 404 });
  }

  try {
    await ensureCoachProfile(auth.context.supabase, auth.context.user);
    const { fullName } = await resolveMyDevelopmentActor({
      supabase: auth.context.supabase,
      organisationId: auth.context.organisation.organisationId,
      userId: auth.context.user.id,
      email: auth.context.user.email,
    });

    const reflection = await getMyDevelopmentReflection({
      supabase: auth.context.supabase,
      organisationId: auth.context.organisation.organisationId,
      userId: auth.context.user.id,
      fullName,
      reflectionId: reflectionId.trim(),
    });

    if (!reflection) {
      return NextResponse.json({ error: "Reflection not found." }, { status: 404 });
    }

    return NextResponse.json({ reflection });
  } catch (error) {
    return supabaseErrorResponse(error);
  }
}
