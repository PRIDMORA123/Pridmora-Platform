import { NextResponse } from "next/server";
import {
  requireOrganisationContext,
  requireOrganisationPermission,
} from "@/lib/organisations/current-organisation";
import { listOrganisationGuidance } from "@/lib/organisation-guidance";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireOrganisationContext();
  if (!auth.ok) return auth.response;

  const denied = requireOrganisationPermission(
    auth.context,
    "organisation_guidance.manage"
  );
  if (denied) return denied;

  try {
    const organisationId = auth.context.organisation.organisationId;

    const guidance = await listOrganisationGuidance({
      supabase: auth.context.supabase,
      organisationId,
    });

    return NextResponse.json({
      guidance,
      canManage: true,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to load organisation guidance.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
