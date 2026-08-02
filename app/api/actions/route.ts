import { NextResponse } from "next/server";
import type { ActionStatus, CoachingAction } from "@/lib/types";
import { notFoundOrForbidden, requireAuthenticatedUser } from "@/lib/auth/session";
import {
  ClientArchivedError,
  deleteActionInDb,
  OwnershipError,
  upsertActionInDb,
} from "@/lib/supabase/repository";
import { toUserFriendlySupabaseError } from "@/lib/supabase/errors";

export const runtime = "nodejs";

function asActionStatus(value: unknown): ActionStatus {
  if (value === "Open" || value === "In progress" || value === "Complete") return value;
  return "Open";
}

function mutationError(error: unknown) {
  if (error instanceof OwnershipError) return notFoundOrForbidden();
  if (error instanceof ClientArchivedError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  console.error("Supabase action mutation error:", error);
  return NextResponse.json(
    { error: toUserFriendlySupabaseError(error) },
    { status: 503 }
  );
}

export async function POST(request: Request) {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as {
      action?: Partial<CoachingAction> & { clientId?: string };
    };
    const input = body.action;
    if (!input?.clientId || !input.title?.trim()) {
      return NextResponse.json(
        { error: "Action title and clientId are required." },
        { status: 400 }
      );
    }

    const action = await upsertActionInDb(auth.context.supabase, auth.context.coachId, {
      id: input.id || crypto.randomUUID(),
      clientId: input.clientId,
      sessionId: input.sessionId ?? null,
      title: input.title,
      status: asActionStatus(input.status),
      due: input.due,
      owner: input.owner,
      notes: input.notes,
    });

    return NextResponse.json({ action }, { status: 201 });
  } catch (error) {
    return mutationError(error);
  }
}

export async function PUT(request: Request) {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as {
      action?: Partial<CoachingAction> & { clientId?: string };
    };
    const input = body.action;
    if (!input?.id || !input.clientId || !input.title?.trim()) {
      return NextResponse.json(
        { error: "Action id, title and clientId are required." },
        { status: 400 }
      );
    }

    const action = await upsertActionInDb(auth.context.supabase, auth.context.coachId, {
      id: input.id,
      clientId: input.clientId,
      sessionId: input.sessionId ?? null,
      title: input.title,
      status: asActionStatus(input.status),
      due: input.due,
      owner: input.owner,
      notes: input.notes,
    });

    return NextResponse.json({ action });
  } catch (error) {
    return mutationError(error);
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  try {
    const actionId = new URL(request.url).searchParams.get("id");
    if (!actionId) {
      return NextResponse.json({ error: "Action id is required." }, { status: 400 });
    }

    const ok = await deleteActionInDb(
      auth.context.supabase,
      auth.context.coachId,
      actionId
    );
    if (!ok) return notFoundOrForbidden();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return mutationError(error);
  }
}
