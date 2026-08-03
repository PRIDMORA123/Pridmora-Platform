import { NextResponse } from "next/server";
import type { Session } from "@/lib/types";
import { notFoundOrForbidden } from "@/lib/auth/session";
import {
  requireAssignedClientAccess,
  requireOrganisationContext,
  redactPrivateNotesFields,
} from "@/lib/organisations/current-organisation";
import {
  CREATE_CONVERSATION_USER_ERROR,
  RELATIONSHIP_ORGANISATION_MISSING,
  RelationshipOrganisationMissingError,
  resolveSessionOrganisationId,
} from "@/lib/organisations/session-organisation";
import { sanitizeSessionHumanTextFields } from "@/lib/coach-notes";
import {
  ClientArchivedError,
  createSessionInDb,
  listSessionsForClientInDb,
  OwnershipError,
  saveSessionInDb,
} from "@/lib/supabase/repository";

export const runtime = "nodejs";

function sessionMutationError(error: unknown) {
  if (error instanceof RelationshipOrganisationMissingError) {
    console.error("[sessions] RELATIONSHIP_ORGANISATION_MISSING", {
      code: error.code,
      message: error.message,
    });
    return NextResponse.json(
      {
        error: CREATE_CONVERSATION_USER_ERROR,
        code: RELATIONSHIP_ORGANISATION_MISSING,
        errorCode: RELATIONSHIP_ORGANISATION_MISSING,
      },
      { status: 422 }
    );
  }
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
  console.error("Supabase session mutation error:", {
    name: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error ? error.message : String(error),
  });
  return NextResponse.json(
    { error: CREATE_CONVERSATION_USER_ERROR },
    { status: 503 }
  );
}

function sanitizeIncomingSession(session: Session, coachId: string): Session {
  return {
    ...session,
    ...sanitizeSessionHumanTextFields(session),
    // Ownership is derived server-side — never trust browser coachId.
    coachId,
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
      { error: CREATE_CONVERSATION_USER_ERROR },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireOrganisationContext();
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as {
      session?: Session & { organisationId?: unknown; organisation_id?: unknown };
    };
    if (!body.session) {
      return NextResponse.json({ error: "Session payload is required." }, { status: 400 });
    }

    // Never trust browser-supplied organisation ownership.
    if ("organisationId" in body.session || "organisation_id" in body.session) {
      delete (body.session as { organisationId?: unknown }).organisationId;
      delete (body.session as { organisation_id?: unknown }).organisation_id;
    }

    const access = await requireAssignedClientAccess({
      supabase: auth.context.supabase,
      context: auth.context,
      clientId: body.session.clientId,
    });
    if (!access.ok) return access.response;

    const organisationId = resolveSessionOrganisationId(access.clientOrganisationId);

    const session = await createSessionInDb(
      auth.context.supabase,
      auth.context.coachId,
      sanitizeIncomingSession(body.session, auth.context.coachId),
      organisationId
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
    const body = (await request.json()) as {
      session?: Session & { organisationId?: unknown; organisation_id?: unknown };
    };
    if (!body.session) {
      return NextResponse.json({ error: "Session payload is required." }, { status: 400 });
    }

    // Never trust browser-supplied organisation ownership.
    if ("organisationId" in body.session || "organisation_id" in body.session) {
      delete (body.session as { organisationId?: unknown }).organisationId;
      delete (body.session as { organisation_id?: unknown }).organisation_id;
    }

    const access = await requireAssignedClientAccess({
      supabase: auth.context.supabase,
      context: auth.context,
      clientId: body.session.clientId,
    });
    if (!access.ok) return access.response;

    const organisationId = resolveSessionOrganisationId(access.clientOrganisationId);

    const session = await saveSessionInDb(
      auth.context.supabase,
      auth.context.coachId,
      sanitizeIncomingSession(body.session, auth.context.coachId),
      organisationId
    );
    return NextResponse.json({ session });
  } catch (error) {
    return sessionMutationError(error);
  }
}
