import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { developmentUpdateErrorResponse } from "@/lib/development-updates/api-response";
import { getDevelopmentUpdateBySession } from "@/lib/development-updates/repository";

type Params = { params: Promise<{ sessionId: string }> };

export async function GET(request: Request, { params }: Params) {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  const { sessionId } = await params;
  const clientId = new URL(request.url).searchParams.get("clientId")?.trim();

  try {
    const update = await getDevelopmentUpdateBySession(
      auth.context.supabase,
      auth.context.user.id,
      sessionId
    );

    if (!update) {
      return NextResponse.json({ update: null });
    }

    if (clientId && update.clientId !== clientId) {
      return NextResponse.json({ error: "Development update not found." }, { status: 404 });
    }

    return NextResponse.json({ update });
  } catch (error) {
    return developmentUpdateErrorResponse(
      error,
      "Unable to load the development update for this session."
    );
  }
}
