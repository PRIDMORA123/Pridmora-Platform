import { NextResponse } from "next/server";
import { intelligenceErrorResponse } from "@/lib/intelligence/api-response";
import { listGlobalIntelligence } from "@/lib/intelligence/repository";
import { requireOrganisationContext } from "@/lib/organisations/current-organisation";
import { listAssignedClientIds } from "@/lib/organisations/repository";

export async function GET() {
  const auth = await requireOrganisationContext();
  if (!auth.ok) return auth.response;

  try {
    const supabase = auth.context.supabase;
    const userId = auth.context.user.id;
    const organisationId = auth.context.organisation.organisationId;
    const assignedIds = await listAssignedClientIds(
      supabase,
      organisationId,
      userId
    );

    const data = await listGlobalIntelligence(supabase, userId);

    // Solo/legacy: when no assignment rows, keep coach-owned items already scoped by user_id.
    // When assignments exist, only return items for assigned people in this workspace.
    if (assignedIds.length === 0) {
      return NextResponse.json(data);
    }

    const allowed = new Set(assignedIds);
    return NextResponse.json({
      awaitingReview: data.awaitingReview.filter(item => allowed.has(item.clientId)),
      recentlyApproved: data.recentlyApproved.filter(item =>
        allowed.has(item.clientId)
      ),
      questions: data.questions.filter(item => allowed.has(item.clientId)),
    });
  } catch (error) {
    console.error("Global intelligence load error:", error instanceof Error ? error.name : "unknown");
    return intelligenceErrorResponse(error, "Unable to load intelligence. Please try again.");
  }
}
