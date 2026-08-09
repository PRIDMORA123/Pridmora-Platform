import { NextResponse } from "next/server";
import { notFoundOrForbidden } from "@/lib/auth/session";
import { developmentUpdateErrorResponse } from "@/lib/development-updates/api-response";
import {
  discardDevelopmentUpdateRpc,
  getDevelopmentUpdateById,
} from "@/lib/development-updates/repository";
import { requireOrganisationContext } from "@/lib/organisations/current-organisation";
import { requireAssignedPersonInOrganisation } from "@/lib/organisations/person-access-gate";

type Params = { params: Promise<{ updateId: string }> };

export async function POST(_request: Request, { params }: Params) {
  const org = await requireOrganisationContext();
  if (!org.ok) return org.response;

  const { updateId } = await params;

  try {
    const existing = await getDevelopmentUpdateById(
      org.context.supabase,
      org.context.user.id,
      updateId
    );
    if (!existing) {
      return notFoundOrForbidden();
    }

    const access = await requireAssignedPersonInOrganisation({
      clientId: existing.clientId,
    });
    if (!access.ok) return access.response;

    await discardDevelopmentUpdateRpc(access.context.supabase, updateId);
    const update = await getDevelopmentUpdateById(
      access.context.supabase,
      access.context.user.id,
      updateId
    );

    return NextResponse.json({
      ok: true,
      update,
      notice: "The suggested update was discarded. The development profile is unchanged.",
    });
  } catch (error) {
    return developmentUpdateErrorResponse(
      error,
      "Unable to discard this development update. Please try again."
    );
  }
}
