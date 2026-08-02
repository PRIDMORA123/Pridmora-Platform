import { NextResponse } from "next/server";
import { notFoundOrForbidden, requireAuthenticatedUser } from "@/lib/auth/session";
import { restoreClientInDb } from "@/lib/supabase/repository";
import { toUserFriendlySupabaseError } from "@/lib/supabase/errors";
import { isUuid } from "@/lib/uuid";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ clientId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  try {
    const { clientId } = await context.params;
    if (!clientId || !isUuid(clientId)) {
      return notFoundOrForbidden();
    }

    const client = await restoreClientInDb(
      auth.context.supabase,
      auth.context.coachId,
      clientId
    );

    if (!client) {
      return notFoundOrForbidden();
    }

    return NextResponse.json({
      client,
      message: "Client restored.",
    });
  } catch (error) {
    console.error("Supabase restore client error:", error);
    return NextResponse.json(
      { error: toUserFriendlySupabaseError(error) },
      { status: 503 }
    );
  }
}
