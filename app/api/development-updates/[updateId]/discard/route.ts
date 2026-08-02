import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { developmentUpdateErrorResponse } from "@/lib/development-updates/api-response";
import {
  discardDevelopmentUpdateRpc,
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

    await discardDevelopmentUpdateRpc(auth.context.supabase, updateId);
    const update = await getDevelopmentUpdateById(
      auth.context.supabase,
      auth.context.user.id,
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
