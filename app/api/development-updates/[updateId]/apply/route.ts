import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { developmentUpdateErrorResponse } from "@/lib/development-updates/api-response";
import {
  applyDevelopmentUpdateRpc,
  getDevelopmentProfileForClient,
  getDevelopmentUpdateById,
} from "@/lib/development-updates/repository";

type Params = { params: Promise<{ updateId: string }> };

export async function POST(_request: Request, { params }: Params) {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  const { updateId } = await params;

  try {
    const existing = await getDevelopmentUpdateById(
      auth.context.supabase,
      auth.context.user.id,
      updateId
    );
    if (!existing) {
      return NextResponse.json({ error: "Development update not found." }, { status: 404 });
    }

    const result = await applyDevelopmentUpdateRpc(auth.context.supabase, updateId);
    const update = await getDevelopmentUpdateById(
      auth.context.supabase,
      auth.context.user.id,
      updateId
    );
    const profile = update
      ? await getDevelopmentProfileForClient(
          auth.context.supabase,
          auth.context.user.id,
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
