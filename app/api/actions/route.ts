import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionStatus, CoachingAction } from "@/lib/types";
import { notFoundOrForbidden } from "@/lib/auth/session";
import { requireOrganisationContext } from "@/lib/organisations/current-organisation";
import { requireAssignedPersonInOrganisation } from "@/lib/organisations/person-access-gate";
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

async function resolveActionClientId(
  supabase: SupabaseClient,
  coachId: string,
  actionId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("client_items")
    .select("id, client_id")
    .eq("id", actionId)
    .eq("coach_id", coachId)
    .eq("item_type", "action")
    .maybeSingle();

  if (error || !data) return null;
  return typeof data.client_id === "string" ? data.client_id : null;
}

export async function POST(request: Request) {
  let body: {
    action?: Partial<CoachingAction> & { clientId?: string };
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const input = body.action;
  if (!input?.clientId || !input.title?.trim()) {
    return NextResponse.json(
      { error: "Action title and clientId are required." },
      { status: 400 }
    );
  }

  const access = await requireAssignedPersonInOrganisation({
    clientId: input.clientId,
  });
  if (!access.ok) return access.response;

  try {
    const action = await upsertActionInDb(
      access.context.supabase,
      access.context.coachId,
      {
        id: input.id || crypto.randomUUID(),
        clientId: access.clientId,
        sessionId: input.sessionId ?? null,
        title: input.title,
        status: asActionStatus(input.status),
        due: input.due,
        owner: input.owner,
        notes: input.notes,
      }
    );

    return NextResponse.json({ action }, { status: 201 });
  } catch (error) {
    return mutationError(error);
  }
}

export async function PUT(request: Request) {
  let body: {
    action?: Partial<CoachingAction> & { clientId?: string };
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const input = body.action;
  if (!input?.id || !input.title?.trim()) {
    return NextResponse.json(
      { error: "Action id, title and clientId are required." },
      { status: 400 }
    );
  }

  const org = await requireOrganisationContext();
  if (!org.ok) return org.response;

  try {
    const parentClientId = await resolveActionClientId(
      org.context.supabase,
      org.context.coachId,
      input.id
    );

    let authorisedClientId: string;
    if (parentClientId) {
      // Never trust browser-supplied client ownership for an existing action.
      if (
        typeof input.clientId === "string" &&
        input.clientId.trim() &&
        input.clientId.trim() !== parentClientId
      ) {
        return notFoundOrForbidden();
      }
      authorisedClientId = parentClientId;
    } else if (input.clientId?.trim()) {
      // Upsert of a new action id still requires an authorised person.
      authorisedClientId = input.clientId.trim();
    } else {
      return notFoundOrForbidden();
    }

    const access = await requireAssignedPersonInOrganisation({
      clientId: authorisedClientId,
    });
    if (!access.ok) return access.response;

    const action = await upsertActionInDb(
      access.context.supabase,
      access.context.coachId,
      {
        id: input.id,
        clientId: access.clientId,
        sessionId: input.sessionId ?? null,
        title: input.title,
        status: asActionStatus(input.status),
        due: input.due,
        owner: input.owner,
        notes: input.notes,
      }
    );

    return NextResponse.json({ action });
  } catch (error) {
    return mutationError(error);
  }
}

export async function DELETE(request: Request) {
  const org = await requireOrganisationContext();
  if (!org.ok) return org.response;

  try {
    const actionId = new URL(request.url).searchParams.get("id");
    if (!actionId) {
      return NextResponse.json({ error: "Action id is required." }, { status: 400 });
    }

    const parentClientId = await resolveActionClientId(
      org.context.supabase,
      org.context.coachId,
      actionId
    );
    if (!parentClientId) {
      return notFoundOrForbidden();
    }

    const access = await requireAssignedPersonInOrganisation({
      clientId: parentClientId,
    });
    if (!access.ok) return access.response;

    const ok = await deleteActionInDb(
      access.context.supabase,
      access.context.coachId,
      actionId
    );
    if (!ok) return notFoundOrForbidden();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return mutationError(error);
  }
}
