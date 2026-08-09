import { NextResponse } from "next/server";
import { intelligenceErrorResponse } from "@/lib/intelligence/api-response";
import {
  listIntelligenceForClient,
  listQuestionsForClient,
  listSignalsForClient,
} from "@/lib/intelligence/repository";
import { buildIntelligenceSnapshot } from "@/lib/intelligence/snapshot";
import { requireAssignedPersonInOrganisation } from "@/lib/organisations/person-access-gate";

type Params = { params: Promise<{ clientId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { clientId } = await params;
  const access = await requireAssignedPersonInOrganisation({ clientId });
  if (!access.ok) return access.response;

  try {
    const supabase = access.context.supabase;
    const userId = access.context.user.id;
    const [items, questions, signals] = await Promise.all([
      listIntelligenceForClient(supabase, userId, access.clientId, {
        includeRejected: false,
      }),
      listQuestionsForClient(supabase, userId, access.clientId),
      listSignalsForClient(supabase, userId, access.clientId),
    ]);

    const approved = items.filter(item => item.status === "approved" && !item.archivedAt);
    const snapshot = buildIntelligenceSnapshot(approved, items);

    return NextResponse.json({ items, questions, signals, snapshot });
  } catch (error) {
    console.error("Person intelligence load error:", error instanceof Error ? error.name : "unknown");
    return intelligenceErrorResponse(
      error,
      "Unable to load development intelligence. Please try again."
    );
  }
}
