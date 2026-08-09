import { NextResponse } from "next/server";
import { intelligenceErrorResponse } from "@/lib/intelligence/api-response";
import { listProposedForSession } from "@/lib/intelligence/repository";
import { requireAssignedPersonInOrganisation } from "@/lib/organisations/person-access-gate";

type Params = { params: Promise<{ sessionId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { sessionId } = await params;
  const clientId = new URL(request.url).searchParams.get("clientId")?.trim();
  const access = await requireAssignedPersonInOrganisation({ clientId });
  if (!access.ok) return access.response;

  try {
    const supabase = access.context.supabase;
    const data = await listProposedForSession(
      supabase,
      access.context.user.id,
      access.clientId,
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
