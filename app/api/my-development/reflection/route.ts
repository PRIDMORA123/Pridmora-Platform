import { NextResponse } from "next/server";
import { ensureCoachProfile } from "@/lib/auth/session";
import {
  createMyDevelopmentReflection,
  listMyDevelopmentReflections,
  resolveMyDevelopmentActor,
  type MyDevelopmentReflectionInput,
} from "@/lib/my-development/workspace";
import { requireOrganisationContext } from "@/lib/organisations/current-organisation";
import { supabaseErrorResponse } from "@/lib/supabase/errors";

export const runtime = "nodejs";

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * List Manager reflections (reverse chronological) for current org self record.
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

    const reflections = await listMyDevelopmentReflections({
      supabase: auth.context.supabase,
      organisationId: auth.context.organisation.organisationId,
      userId: auth.context.user.id,
      fullName,
    });

    return NextResponse.json({ reflections });
  } catch (error) {
    return supabaseErrorResponse(error);
  }
}

/**
 * Append a new Manager reflection as personal_reflection evidence.
 * Never overwrites earlier reflections.
 */
export async function POST(request: Request) {
  const auth = await requireOrganisationContext();
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const reflection: MyDevelopmentReflectionInput = {
    title: asOptionalString(body.title),
    context: asOptionalString(body.context),
    whatHappened: asOptionalString(body.whatHappened),
    whatNoticed: asOptionalString(body.whatNoticed),
    whatWorked: asOptionalString(body.whatWorked),
    whatWasDifficult: asOptionalString(body.whatWasDifficult),
    whatDifferently: asOptionalString(body.whatDifferently),
    practiseNext: asOptionalString(body.practiseNext),
    anythingElse: asOptionalString(body.anythingElse),
  };

  try {
    await ensureCoachProfile(auth.context.supabase, auth.context.user);
    const { fullName } = await resolveMyDevelopmentActor({
      supabase: auth.context.supabase,
      organisationId: auth.context.organisation.organisationId,
      userId: auth.context.user.id,
      email: auth.context.user.email,
    });

    const result = await createMyDevelopmentReflection({
      supabase: auth.context.supabase,
      organisationId: auth.context.organisation.organisationId,
      userId: auth.context.user.id,
      fullName,
      reflection,
    });

    return NextResponse.json(
      {
        evidenceId: result.evidenceId,
        workspace: result.workspace,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && /at least one reflection/i.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return supabaseErrorResponse(error);
  }
}
