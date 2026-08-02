import { NextResponse } from "next/server";
import { ensureCoachProfile } from "@/lib/auth/session";
import {
  requireOrganisationContext,
} from "@/lib/organisations/current-organisation";
import {
  listUserMemberships,
  setCurrentOrganisationPreference,
} from "@/lib/organisations/repository";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireOrganisationContext();
  if (!auth.ok) return auth.response;

  try {
    await ensureCoachProfile(auth.context.supabase, auth.context.user);
    const organisations = await listUserMemberships(
      auth.context.supabase,
      auth.context.user.id
    );

    return NextResponse.json({
      current: {
        organisation: auth.context.organisation.organisation,
        membership: auth.context.organisation.membership,
        role: auth.context.organisation.role,
        professionalRole: auth.context.organisation.professionalRole,
        organisations,
      },
      organisations,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load organisations.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireOrganisationContext();
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as { organisationId?: unknown };
    const organisationId =
      typeof body.organisationId === "string" ? body.organisationId.trim() : "";

    if (!organisationId) {
      return NextResponse.json({ error: "organisationId is required." }, { status: 400 });
    }

    // Membership verified inside setCurrentOrganisationPreference.
    await setCurrentOrganisationPreference(
      auth.context.supabase,
      auth.context.user.id,
      organisationId
    );

    return NextResponse.json({ ok: true, organisationId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to switch organisation.";
    return NextResponse.json({ error: message }, { status: 403 });
  }
}
