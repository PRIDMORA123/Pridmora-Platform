import { NextResponse } from "next/server";
import { ensureCoachProfile, notFoundOrForbidden } from "@/lib/auth/session";
import {
  ClientArchivedError,
  OwnershipError,
  parseMyDevelopmentActionOperation,
  rejectSelfActionOwnershipFields,
  updateMyDevelopmentActionLifecycle,
} from "@/lib/my-development/self-action";
import { requireOrganisationContext } from "@/lib/organisations/current-organisation";
import {
  supabaseErrorResponse,
  toUserFriendlySupabaseError,
} from "@/lib/supabase/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ actionId: string }> };

/**
 * Stage 2.3.2.1 — Complete or reopen a Manager self-development action.
 * Self client is resolved server-side. Browser ownership ids are rejected.
 */
export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireOrganisationContext();
  if (!auth.ok) return auth.response;

  const { actionId } = await params;
  if (!actionId?.trim()) {
    return notFoundOrForbidden();
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const ownershipCheck = rejectSelfActionOwnershipFields(body);
  if (!ownershipCheck.ok) {
    return NextResponse.json(
      { error: ownershipCheck.error },
      { status: ownershipCheck.status }
    );
  }

  const operation = parseMyDevelopmentActionOperation(body.operation);
  if (!operation) {
    return NextResponse.json(
      {
        error:
          'Unsupported operation. Use operation: "complete" or operation: "reopen".',
      },
      { status: 400 }
    );
  }

  // Status must not be supplied independently — operation maps to status.
  if (body.status !== undefined && body.status !== null && body.status !== "") {
    return NextResponse.json(
      { error: "status cannot be set directly; use operation instead." },
      { status: 400 }
    );
  }

  try {
    await ensureCoachProfile(auth.context.supabase, auth.context.user);
    const result = await updateMyDevelopmentActionLifecycle({
      supabase: auth.context.supabase,
      organisationId: auth.context.organisation.organisationId,
      userId: auth.context.user.id,
      email: auth.context.user.email,
      actionId: actionId.trim(),
      operation,
    });

    return NextResponse.json({
      action: result.action,
      operation: result.operation,
    });
  } catch (error) {
    if (error instanceof OwnershipError) return notFoundOrForbidden();
    if (error instanceof ClientArchivedError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof Error && /Only Open|Only completed/i.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
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
