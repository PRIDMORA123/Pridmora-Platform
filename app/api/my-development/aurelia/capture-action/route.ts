import { NextResponse } from "next/server";
import {
  ensureCoachProfile,
  notFoundOrForbidden,
} from "@/lib/auth/session";
import {
  rejectClientSuppliedDevelopmentContext,
  rejectPersonIdentifiers,
} from "@/lib/ai/manager-aurelia-conversation";
import { resolveMyDevelopmentActor } from "@/lib/my-development/workspace";
import { ensureSelfDevelopmentRelationship } from "@/lib/my-development/self-relationship";
import { requireOrganisationContext } from "@/lib/organisations/current-organisation";
import {
  ClientArchivedError,
  OwnershipError,
  upsertActionInDb,
} from "@/lib/supabase/repository";
import {
  supabaseErrorResponse,
  toUserFriendlySupabaseError,
} from "@/lib/supabase/errors";

export const runtime = "nodejs";

/**
 * Stage 2.2.4 — confirm an Action capture for the Manager self-development record.
 * Resolves self clientId server-side. Does not accept browser-invented client IDs.
 */
export async function POST(request: Request) {
  const auth = await requireOrganisationContext();
  if (!auth.ok) return auth.response;

  if (auth.context.organisation.professionalRole !== "manager") {
    return NextResponse.json(
      { error: "Manager Aurelia capture is only available to Managers." },
      { status: 403 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const personCheck = rejectPersonIdentifiers(body);
  if (!personCheck.ok) {
    return NextResponse.json(
      { error: personCheck.error },
      { status: personCheck.status }
    );
  }

  const portfolioCheck = rejectClientSuppliedDevelopmentContext(body);
  if (!portfolioCheck.ok) {
    return NextResponse.json(
      { error: portfolioCheck.error },
      { status: portfolioCheck.status }
    );
  }

  // Explicitly reject client-supplied self client ids for this capture path.
  if (
    body.clientId !== undefined ||
    body.selfClientId !== undefined ||
    (body.action &&
      typeof body.action === "object" &&
      body.action !== null &&
      ("clientId" in body.action || "selfClientId" in body.action))
  ) {
    return NextResponse.json(
      { error: "clientId must be resolved server-side for Aurelia capture." },
      { status: 400 }
    );
  }

  const title =
    typeof body.title === "string" ? body.title.trim().replace(/\s+/g, " ") : "";
  if (!title) {
    return NextResponse.json(
      { error: "Action title is required." },
      { status: 400 }
    );
  }

  let due: string | undefined;
  if (typeof body.due === "string" && body.due.trim()) {
    const trimmed = body.due.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return NextResponse.json(
        { error: "due must be a YYYY-MM-DD date when provided." },
        { status: 400 }
      );
    }
    due = trimmed;
  }

  try {
    await ensureCoachProfile(auth.context.supabase, auth.context.user);
    const { fullName } = await resolveMyDevelopmentActor({
      supabase: auth.context.supabase,
      organisationId: auth.context.organisation.organisationId,
      userId: auth.context.user.id,
      email: auth.context.user.email,
    });

    const selfClient = await ensureSelfDevelopmentRelationship({
      supabase: auth.context.supabase,
      organisationId: auth.context.organisation.organisationId,
      userId: auth.context.user.id,
      fullName,
    });

    const action = await upsertActionInDb(
      auth.context.supabase,
      auth.context.user.id,
      {
        id: crypto.randomUUID(),
        clientId: selfClient.id,
        title,
        status: "Open",
        due,
      }
    );

    return NextResponse.json({ action }, { status: 201 });
  } catch (error) {
    if (error instanceof OwnershipError) return notFoundOrForbidden();
    if (error instanceof ClientArchivedError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    try {
      return supabaseErrorResponse(error);
    } catch {
      return NextResponse.json(
        { error: toUserFriendlySupabaseError(error) },
        { status: 503 }
      );
    }
  }
}
