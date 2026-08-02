import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { intelligenceErrorResponse } from "@/lib/intelligence/api-response";
import {
  deleteQuestionInsight,
  listQuestionsForClient,
  saveQuestionInsight,
} from "@/lib/intelligence/repository";

export async function GET(request: Request) {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  const clientId = new URL(request.url).searchParams.get("clientId")?.trim();
  if (!clientId) {
    return NextResponse.json({ error: "clientId is required." }, { status: 400 });
  }

  try {
    const supabase = auth.context.supabase;
    const questions = await listQuestionsForClient(supabase, auth.context.user.id, clientId);
    return NextResponse.json({ questions });
  } catch (error) {
    console.error("Questions load error:", error instanceof Error ? error.name : "unknown");
    return intelligenceErrorResponse(error, "Unable to load questions. Please try again.");
  }
}

export async function POST(request: Request) {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  let body: {
    clientId?: string;
    sessionId?: string | null;
    questionText?: string;
    source?: string;
    coachNotes?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!body.clientId || !body.questionText?.trim()) {
    return NextResponse.json(
      { error: "clientId and questionText are required." },
      { status: 400 }
    );
  }

  try {
    const supabase = auth.context.supabase;
    const question = await saveQuestionInsight(supabase, auth.context.user.id, {
      clientId: body.clientId,
      sessionId: body.sessionId,
      questionText: body.questionText.trim(),
      source: body.source,
      coachNotes: body.coachNotes,
    });
    return NextResponse.json({ question });
  } catch (error) {
    console.error("Question save error:", error instanceof Error ? error.name : "unknown");
    return intelligenceErrorResponse(error, "Unable to save the question. Please try again.");
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  const questionId = new URL(request.url).searchParams.get("id")?.trim();
  if (!questionId) {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }

  try {
    const supabase = auth.context.supabase;
    await deleteQuestionInsight(supabase, auth.context.user.id, questionId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Question delete error:", error instanceof Error ? error.name : "unknown");
    return intelligenceErrorResponse(error, "Unable to remove the question. Please try again.");
  }
}
