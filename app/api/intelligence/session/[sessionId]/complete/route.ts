import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { intelligenceErrorResponse } from "@/lib/intelligence/api-response";
import { completeSessionReview } from "@/lib/intelligence/repository";

type Params = { params: Promise<{ sessionId: string }> };

export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

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
    const supabase = auth.context.supabase;
    const review = await completeSessionReview(
      supabase,
      auth.context.user.id,
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
