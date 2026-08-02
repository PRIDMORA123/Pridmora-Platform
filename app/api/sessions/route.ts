import { NextResponse } from "next/server";
import type { Session } from "@/lib/types";
import { notFoundOrForbidden } from "@/lib/auth/session";
import {
  requireAssignedClientAccess,
  requireOrganisationContext,
  redactPrivateNotesFields,
} from "@/lib/organisations/current-organisation";
import { sanitizeSessionHumanTextFields } from "@/lib/coach-notes";
import {
  ClientArchivedError,
  createSessionInDb,
  listSessionsForClientInDb,
  OwnershipError,
  saveSessionInDb,
} from "@/lib/supabase/repository";
import { toUserFriendlySupabaseError } from "@/lib/supabase/errors";

export const runtime = "nodejs";

function sessionMutationError(error: unknown) {
  if (error instanceof OwnershipError) {
    return notFoundOrForbidden();
  }
  if (error instanceof ClientArchivedError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (
    error instanceof Error &&
    /prohibited workflow metadata|workflow payload/i.test(error.message)
  ) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  console.error("Supabase session mutation error:", error);
  return NextResponse.json(
    { error: toUserFriendlySupabaseError(error) },
    { status: 503 }
  );
}

function sanitizeIncomingSession(session: Session): Session {
  return {
    ...session,
    ...sanitizeSessionHumanTextFields(session),
  };
}

export async function GET(request: Request) {
  const auth = await requireOrganisationContext();
  if (!auth.ok) return auth.response;

  try {
    const clientId = new URL(request.url).searchParams.get("clientId");
    if (!clientId) {
      return NextResponse.json({ error: "clientId is required." }, { status: 400 });
    }

    const access = await requireAssignedClientAccess({
      supabase: auth.context.supabase,
      context: auth.context,
      clientId,
    });
    if (!access.ok) return access.response;

    const sessions = await listSessionsForClientInDb(
      auth.context.supabase,
      auth.context.coachId,
      clientId
    );

    if (sessions === null) {
      return notFoundOrForbidden();
    }

    const redacted = sessions.map(session =>
      redactPrivateNotesFields(session as unknown as Record<string, unknown>, {
        userId: auth.context.user.id,
        role: auth.context.organisation.role,
        assignmentRole: access.assignment?.assignmentRole ?? "primary",
        privateNotesOwnerId: access.privateNotesOwnerId,
      })
    );

    return NextResponse.json({ sessions: redacted });
  } catch (error) {
    console.error("Supabase list sessions error:", error);
    return NextResponse.json(
      { error: toUserFriendlySupabaseError(error) },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireOrganisationContext();
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as { session?: Session };
    if (!body.session) {
      return NextResponse.json({ error: "Session payload is required." }, { status: 400 });
    }

    const access = await requireAssignedClientAccess({
      supabase: auth.context.supabase,
      context: auth.context,
      clientId: body.session.clientId,
    });
    if (!access.ok) return access.response;

    const session = await createSessionInDb(
      auth.context.supabase,
      auth.context.coachId,
      sanitizeIncomingSession(body.session)
    );
    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    return sessionMutationError(error);
  }
}

export async function PUT(request: Request) {
  const auth = await requireOrganisationContext();
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as { session?: Session };
    if (!body.session) {
      return NextResponse.json({ error: "Session payload is required." }, { status: 400 });
    }

    const access = await requireAssignedClientAccess({
      supabase: auth.context.supabase,
      context: auth.context,
      clientId: body.session.clientId,
    });
    if (!access.ok) return access.response;

    const session = await saveSessionInDb(
      auth.context.supabase,
      auth.context.coachId,
      sanitizeIncomingSession(body.session)
    );
    return NextResponse.json({ session });
  } catch (error) {
    return sessionMutationError(error);
  }
}
