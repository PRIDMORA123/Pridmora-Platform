import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { intelligenceErrorResponse } from "@/lib/intelligence/api-response";
import {
  listIntelligenceForClient,
  listQuestionsForClient,
  listSignalsForClient,
} from "@/lib/intelligence/repository";
import { buildIntelligenceSnapshot } from "@/lib/intelligence/snapshot";

type Params = { params: Promise<{ clientId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  const { clientId } = await params;
  if (!clientId) {
    return NextResponse.json({ error: "clientId is required." }, { status: 400 });
  }

  try {
    const supabase = auth.context.supabase;
    const [items, questions, signals] = await Promise.all([
      listIntelligenceForClient(supabase, auth.context.user.id, clientId, {
        includeRejected: false,
      }),
      listQuestionsForClient(supabase, auth.context.user.id, clientId),
      listSignalsForClient(supabase, auth.context.user.id, clientId),
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
