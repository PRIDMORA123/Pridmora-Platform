import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { developmentUpdateErrorResponse } from "@/lib/development-updates/api-response";
import {
  getDevelopmentUpdateById,
  saveEditedDevelopmentUpdate,
} from "@/lib/development-updates/repository";
import { proposedProfileChangesSchema } from "@/lib/development-updates/schema";
import { ZodError } from "zod";

type Params = { params: Promise<{ updateId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  const { updateId } = await params;
  try {
    const update = await getDevelopmentUpdateById(
      auth.context.supabase,
      auth.context.user.id,
      updateId
    );
    if (!update) {
      return NextResponse.json({ error: "Development update not found." }, { status: 404 });
    }

    const { data: client } = await auth.context.supabase
      .from("clients")
      .select("id, name")
      .eq("id", update.clientId)
      .eq("coach_id", auth.context.user.id)
      .maybeSingle();

    const { data: session } = await auth.context.supabase
      .from("sessions")
      .select("id, session_date, display_date, title")
      .eq("id", update.sessionId)
      .eq("coach_id", auth.context.user.id)
      .maybeSingle();

    return NextResponse.json({
      update,
      clientName: client?.name ?? "Person",
      sessionDate: session?.display_date || session?.session_date || "",
      sessionTitle: session?.title ?? "",
    });
  } catch (error) {
    return developmentUpdateErrorResponse(
      error,
      "Unable to load this development update."
    );
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  const { updateId } = await params;
  let body: {
    conversationSummary?: string;
    editedChanges?: unknown;
    coachNote?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  try {
    const editedChanges = proposedProfileChangesSchema.parse(body.editedChanges ?? {});
    const update = await saveEditedDevelopmentUpdate(
      auth.context.supabase,
      auth.context.user.id,
      updateId,
      {
        conversationSummary: body.conversationSummary,
        editedChanges,
        coachNote: body.coachNote,
      }
    );
    return NextResponse.json({ update });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "The edited update could not be validated." },
        { status: 400 }
      );
    }
    return developmentUpdateErrorResponse(
      error,
      "Unable to save your edits to this development update."
    );
  }
}
