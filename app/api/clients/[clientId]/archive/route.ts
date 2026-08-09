import { NextResponse } from "next/server";
import { notFoundOrForbidden } from "@/lib/auth/session";
import { requireAssignedPersonInOrganisation } from "@/lib/organisations/person-access-gate";
import { archiveClientInDb } from "@/lib/supabase/repository";
import { toUserFriendlySupabaseError } from "@/lib/supabase/errors";
import { isUuid } from "@/lib/uuid";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ clientId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const { clientId } = await context.params;
  if (!clientId || !isUuid(clientId)) {
    return notFoundOrForbidden();
  }

  const access = await requireAssignedPersonInOrganisation({ clientId });
  if (!access.ok) return access.response;

  try {
    const client = await archiveClientInDb(
      access.context.supabase,
      access.context.coachId,
      access.clientId
    );

    if (!client) {
      return notFoundOrForbidden();
    }

    return NextResponse.json({
      client,
      message: "Client archived.",
    });
  } catch (error) {
    console.error("Supabase archive client error:", error);
    return NextResponse.json(
      { error: toUserFriendlySupabaseError(error) },
      { status: 503 }
    );
  }
}
