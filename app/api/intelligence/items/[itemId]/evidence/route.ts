import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { intelligenceErrorResponse } from "@/lib/intelligence/api-response";
import { addEvidence } from "@/lib/intelligence/repository";

type Params = { params: Promise<{ itemId: string }> };

export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  const { itemId } = await params;
  let body: {
    evidenceText?: string;
    evidenceType?: string;
    sourceExcerpt?: string;
    sessionId?: string | null;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!body.evidenceText?.trim()) {
    return NextResponse.json({ error: "Evidence text is required." }, { status: 400 });
  }

  try {
    const supabase = auth.context.supabase;
    const evidence = await addEvidence(supabase, auth.context.user.id, itemId, {
      evidenceText: body.evidenceText.trim(),
      evidenceType: body.evidenceType,
      sourceExcerpt: body.sourceExcerpt,
      sessionId: body.sessionId,
    });
    return NextResponse.json({ evidence });
  } catch (error) {
    const message =
      error instanceof Error && /not found/i.test(error.message)
        ? "Insight not found."
        : "Unable to add evidence. Please try again.";
    if (message.startsWith("Unable")) {
      console.error("Add evidence error:", error instanceof Error ? error.name : "unknown");
    }
    return NextResponse.json(
      { error: message },
      { status: message === "Insight not found." ? 404 : 500 }
    );
  }
}
