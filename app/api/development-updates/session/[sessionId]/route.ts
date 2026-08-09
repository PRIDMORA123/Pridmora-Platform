import { NextResponse } from "next/server";
import { notFoundOrForbidden } from "@/lib/auth/session";
import { developmentUpdateErrorResponse } from "@/lib/development-updates/api-response";
import { getDevelopmentUpdateBySession } from "@/lib/development-updates/repository";
import { requireOrganisationContext } from "@/lib/organisations/current-organisation";
import { requireAssignedPersonInOrganisation } from "@/lib/organisations/person-access-gate";

type Params = { params: Promise<{ sessionId: string }> };

export async function GET(request: Request, { params }: Params) {
  const org = await requireOrganisationContext();
  if (!org.ok) return org.response;

  const { sessionId } = await params;
  const clientIdParam = new URL(request.url).searchParams.get("clientId")?.trim();

  try {
    const update = await getDevelopmentUpdateBySession(
      org.context.supabase,
      org.context.user.id,
      sessionId
    );

    if (!update) {
      return NextResponse.json({ update: null });
    }

    if (clientIdParam && update.clientId !== clientIdParam) {
      return notFoundOrForbidden();
    }

    const access = await requireAssignedPersonInOrganisation({
      clientId: update.clientId,
    });
    if (!access.ok) return access.response;

    return NextResponse.json({ update });
  } catch (error) {
    return developmentUpdateErrorResponse(
      error,
      "Unable to load the development update for this session."
    );
  }
}
