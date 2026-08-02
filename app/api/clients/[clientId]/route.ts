import { NextResponse } from "next/server";
import { notFoundOrForbidden, requireAuthenticatedUser } from "@/lib/auth/session";
import { isPreparationStyle, type PreparationStyle } from "@/lib/preparation-style";
import {
  parseAgreement,
  parseInitialConversation,
  parseSupportingContext,
} from "@/lib/relationship-meta";
import { permanentlyDeleteClientInDb, updateClientProfileInDb } from "@/lib/supabase/repository";
import { toUserFriendlySupabaseError } from "@/lib/supabase/errors";
import { isUuid } from "@/lib/uuid";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ clientId: string }>;
};

function parseOverrideField(
  value: unknown
): PreparationStyle | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (isPreparationStyle(value)) return value;
  return undefined;
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  try {
    const { clientId } = await context.params;
    if (!clientId || !isUuid(clientId)) {
      return notFoundOrForbidden();
    }

    const body = (await request.json()) as {
      name?: string;
      organisation?: string;
      role?: string;
      email?: string;
      currentFocus?: string;
      status?: "Active" | "Paused";
      preparationStyleOverride?: unknown;
      relationshipAgreement?: unknown;
      initialConversation?: unknown;
      supportingContext?: unknown;
    };

    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "Client name is required." }, { status: 400 });
    }

    if (
      body.preparationStyleOverride !== undefined &&
      body.preparationStyleOverride !== null &&
      body.preparationStyleOverride !== "" &&
      !isPreparationStyle(body.preparationStyleOverride)
    ) {
      return NextResponse.json(
        {
          error:
            "Choose Manual, Assisted or Comprehensive support for this coaching relationship.",
        },
        { status: 400 }
      );
    }

    const preparationStyleOverride = parseOverrideField(body.preparationStyleOverride);

    const status =
      body.status === "Active" || body.status === "Paused"
        ? body.status
        : undefined;

    const client = await updateClientProfileInDb(
      auth.context.supabase,
      auth.context.coachId,
      clientId,
      {
        name,
        organisation: typeof body.organisation === "string" ? body.organisation : "",
        role: typeof body.role === "string" ? body.role : "",
        email: typeof body.email === "string" ? body.email : "",
        currentFocus:
          typeof body.currentFocus === "string" ? body.currentFocus : undefined,
        status,
        preparationStyleOverride,
        relationshipAgreement:
          body.relationshipAgreement !== undefined
            ? parseAgreement(body.relationshipAgreement)
            : undefined,
        initialConversation:
          body.initialConversation !== undefined
            ? parseInitialConversation(body.initialConversation)
            : undefined,
        supportingContext:
          body.supportingContext !== undefined
            ? parseSupportingContext(body.supportingContext)
            : undefined,
      }
    );

    if (!client) {
      return notFoundOrForbidden();
    }

    return NextResponse.json({ client });
  } catch (error) {
    console.error("Supabase update client error:", error);
    const message =
      error instanceof Error && error.message === "Client name is required."
        ? error.message
        : toUserFriendlySupabaseError(error);
    return NextResponse.json({ error: message }, { status: 503 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  try {
    const { clientId } = await context.params;
    if (!clientId || !isUuid(clientId)) {
      return notFoundOrForbidden();
    }

    // Ownership is verified from the authenticated session, then dependents +
    // the client row are deleted server-side (no PostgREST RPC dependency).
    // Foreign-owned or missing IDs return the same 404 (no existence leak).
    const deleted = await permanentlyDeleteClientInDb(
      auth.context.supabase,
      auth.context.coachId,
      clientId
    );

    if (!deleted) {
      return notFoundOrForbidden();
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Supabase permanently delete client error:", error);
    return NextResponse.json(
      { error: toUserFriendlySupabaseError(error) },
      { status: 503 }
    );
  }
}
