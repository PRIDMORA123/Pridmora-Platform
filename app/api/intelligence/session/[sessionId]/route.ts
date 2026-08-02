import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { intelligenceErrorResponse } from "@/lib/intelligence/api-response";
import { listProposedForSession } from "@/lib/intelligence/repository";

type Params = { params: Promise<{ sessionId: string }> };

export async function GET(request: Request, { params }: Params) {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  const { sessionId } = await params;
  const clientId = new URL(request.url).searchParams.get("clientId")?.trim();
  if (!clientId) {
    return NextResponse.json({ error: "clientId is required." }, { status: 400 });
  }

  try {
    const supabase = auth.context.supabase;
    const data = await listProposedForSession(
      supabase,
      auth.context.user.id,
      clientId,
      sessionId
    );
    return NextResponse.json(data);
  } catch (error) {
    console.error("Session intelligence load error:", error instanceof Error ? error.name : "unknown");
    return intelligenceErrorResponse(
      error,
      "Unable to load proposed intelligence. Please try again."
    );
  }
}
