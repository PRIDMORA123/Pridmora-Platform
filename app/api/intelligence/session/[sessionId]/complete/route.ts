import { NextResponse } from "next/server";
import { notFoundOrForbidden } from "@/lib/auth/session";
import { intelligenceErrorResponse } from "@/lib/intelligence/api-response";
import { completeSessionReview } from "@/lib/intelligence/repository";
import { requireOrganisationContext } from "@/lib/organisations/current-organisation";
import { requireAssignedPersonInOrganisation } from "@/lib/organisations/person-access-gate";

type Params = { params: Promise<{ sessionId: string }> };

export async function POST(request: Request, { params }: Params) {
  const org = await requireOrganisationContext();
  if (!org.ok) return org.response;

  const { sessionId } = await params;
  let body: {
    reviewStatus?: "approved" | "partially_approved" | "rejected" | "completed";
  };

  try {
    body = await request.json();
  } catch {
    body = {};
  }

  try {
    const supabase = org.context.supabase;
    const { data: reviewRow, error } = await supabase
      .from("session_intelligence_reviews")
      .select("client_id")
      .eq("session_id", sessionId)
      .eq("user_id", org.context.user.id)
      .maybeSingle();

    if (error || !reviewRow) {
      return notFoundOrForbidden();
    }

    const access = await requireAssignedPersonInOrganisation({
      clientId: reviewRow.client_id,
    });
    if (!access.ok) return access.response;

    const review = await completeSessionReview(
      supabase,
      access.context.user.id,
      sessionId,
      body.reviewStatus ?? "completed"
    );
    return NextResponse.json({ review });
  } catch (error) {
    console.error("Complete intelligence review error:", error instanceof Error ? error.name : "unknown");
    return intelligenceErrorResponse(
      error,
      "Unable to complete the intelligence review. Please try again."
    );
  }
}
