import { NextResponse } from "next/server";
import { notFoundOrForbidden } from "@/lib/auth/session";
import { intelligenceErrorResponse } from "@/lib/intelligence/api-response";
import {
  deleteQuestionInsight,
  listQuestionsForClient,
  saveQuestionInsight,
} from "@/lib/intelligence/repository";
import { requireOrganisationContext } from "@/lib/organisations/current-organisation";
import { requireAssignedPersonInOrganisation } from "@/lib/organisations/person-access-gate";

export async function GET(request: Request) {
  const clientId = new URL(request.url).searchParams.get("clientId")?.trim();
  const access = await requireAssignedPersonInOrganisation({ clientId });
  if (!access.ok) return access.response;

  try {
    const supabase = access.context.supabase;
    const questions = await listQuestionsForClient(
      supabase,
      access.context.user.id,
      access.clientId
    );
    return NextResponse.json({ questions });
  } catch (error) {
    console.error("Questions load error:", error instanceof Error ? error.name : "unknown");
    return intelligenceErrorResponse(error, "Unable to load questions. Please try again.");
  }
}

export async function POST(request: Request) {
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

  if (!body.questionText?.trim()) {
    return NextResponse.json(
      { error: "clientId and questionText are required." },
      { status: 400 }
    );
  }

  const access = await requireAssignedPersonInOrganisation({
    clientId: body.clientId,
  });
  if (!access.ok) return access.response;

  try {
    const supabase = access.context.supabase;
    const question = await saveQuestionInsight(supabase, access.context.user.id, {
      clientId: access.clientId,
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
  const org = await requireOrganisationContext();
  if (!org.ok) return org.response;

  const questionId = new URL(request.url).searchParams.get("id")?.trim();
  if (!questionId) {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }

  try {
    const supabase = org.context.supabase;
    const { data: existing, error } = await supabase
      .from("question_insights")
      .select("id, client_id")
      .eq("id", questionId)
      .eq("user_id", org.context.user.id)
      .maybeSingle();

    if (error || !existing) {
      return notFoundOrForbidden();
    }

    const access = await requireAssignedPersonInOrganisation({
      clientId: existing.client_id,
    });
    if (!access.ok) return access.response;

    await deleteQuestionInsight(supabase, access.context.user.id, questionId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Question delete error:", error instanceof Error ? error.name : "unknown");
    return intelligenceErrorResponse(error, "Unable to remove the question. Please try again.");
  }
}
