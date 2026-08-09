import { NextResponse } from "next/server";
import { notFoundOrForbidden } from "@/lib/auth/session";
import { developmentUpdateErrorResponse } from "@/lib/development-updates/api-response";
import {
  applyDevelopmentUpdateRpc,
  getDevelopmentProfileForClient,
  getDevelopmentUpdateById,
} from "@/lib/development-updates/repository";
import { syncCommitmentActionsAfterApply } from "@/lib/development-updates/sync-commitment-actions";
import { effectiveChanges } from "@/lib/development-updates/types";
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

    const changesToApply = effectiveChanges(existing);
    const result = await applyDevelopmentUpdateRpc(access.context.supabase, updateId);

    if (!result.alreadyApplied) {
      await syncCommitmentActionsAfterApply(
        access.context.supabase,
        access.context.coachId,
        existing.clientId,
        existing.sessionId,
        changesToApply
      );
    }

    const update = await getDevelopmentUpdateById(
      access.context.supabase,
      access.context.user.id,
      updateId
    );
    const profile = update
      ? await getDevelopmentProfileForClient(
          access.context.supabase,
          access.context.user.id,
          update.clientId
        )
      : null;

    if (result.alreadyApplied) {
      return NextResponse.json(
        {
          error: "This development update has already been applied.",
          alreadyApplied: true,
          update,
          profile,
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      ok: true,
      update,
      profile,
      notice: "The living development profile has been updated.",
    });
  } catch (error) {
    return developmentUpdateErrorResponse(
      error,
      "We couldn’t update the development profile. No changes have been applied. Please try again."
    );
  }
}
