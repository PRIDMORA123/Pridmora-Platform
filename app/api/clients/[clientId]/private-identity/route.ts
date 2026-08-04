import { NextResponse } from "next/server";
import {
  requireAssignedClientAccess,
  requireOrganisationContext,
} from "@/lib/organisations/current-organisation";
import { supabaseErrorResponse } from "@/lib/supabase/errors";
import { isUuid } from "@/lib/uuid";
import {
  auditPrivateIdentityViewed,
  deletePrivateIdentity,
  fetchPrivateIdentity,
  upsertPrivateIdentity,
} from "@/lib/private-identity";
import { hasAnyPrivateIdentityField } from "@/lib/relationship-identity";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ clientId: string }> };

function asOptionalTrimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function resolveClientId(
  context: RouteContext
): Promise<string | null> {
  const { clientId } = await context.params;
  const id = clientId?.trim() ?? "";
  return id && isUuid(id) ? id : null;
}

/**
 * GET — fetch private identity for a directly assigned practitioner.
 * Never included in list/org-wide client responses.
 */
export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireOrganisationContext();
  if (!auth.ok) return auth.response;

  const clientId = await resolveClientId(context);
  if (!clientId) {
    return NextResponse.json({ error: "Resource not found." }, { status: 404 });
  }

  const access = await requireAssignedClientAccess({
    supabase: auth.context.supabase,
    context: auth.context,
    clientId,
  });
  if (!access.ok) return access.response;

  try {
    const record = await fetchPrivateIdentity(auth.context.supabase, clientId);

    const organisationId =
      access.clientOrganisationId ?? auth.context.organisation.organisationId;

    if (record && organisationId) {
      await auditPrivateIdentityViewed({
        supabase: auth.context.supabase,
        organisationId,
        actorUserId: auth.context.user.id,
        clientId,
      });
    }

    return NextResponse.json({
      privateIdentity: record
        ? {
            realName: record.realName,
            email: record.email,
            phone: record.phone,
            privateNotes: record.privateNotes,
            updatedAt: record.updatedAt,
          }
        : null,
    });
  } catch (error) {
    return supabaseErrorResponse(error);
  }
}

/**
 * PUT — create or update private identity (direct practitioners only).
 */
export async function PUT(request: Request, context: RouteContext) {
  const auth = await requireOrganisationContext();
  if (!auth.ok) return auth.response;

  const clientId = await resolveClientId(context);
  if (!clientId) {
    return NextResponse.json({ error: "Resource not found." }, { status: 404 });
  }

  const access = await requireAssignedClientAccess({
    supabase: auth.context.supabase,
    context: auth.context,
    clientId,
  });
  if (!access.ok) return access.response;

  const organisationId =
    access.clientOrganisationId ?? auth.context.organisation.organisationId;
  if (!organisationId) {
    return NextResponse.json(
      { error: "Organisation context is required." },
      { status: 422 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const fields = {
    realName: asOptionalTrimmed(body.realName),
    email: asOptionalTrimmed(body.email),
    phone: asOptionalTrimmed(body.phone),
    privateNotes: asOptionalTrimmed(body.privateNotes),
  };

  if (!hasAnyPrivateIdentityField(fields)) {
    return NextResponse.json(
      { error: "At least one private identity field is required." },
      { status: 400 }
    );
  }

  try {
    const existing = await fetchPrivateIdentity(auth.context.supabase, clientId);
    const record = await upsertPrivateIdentity({
      supabase: auth.context.supabase,
      clientId,
      organisationId,
      coachId: access.clientCoachId,
      actorUserId: auth.context.user.id,
      fields,
      auditAction: existing
        ? "private_identity_updated"
        : "private_identity_created",
    });

    return NextResponse.json({
      privateIdentity: {
        realName: record.realName,
        email: record.email,
        phone: record.phone,
        privateNotes: record.privateNotes,
        updatedAt: record.updatedAt,
      },
    });
  } catch (error) {
    return supabaseErrorResponse(error);
  }
}

/**
 * DELETE — remove private identity row.
 */
export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireOrganisationContext();
  if (!auth.ok) return auth.response;

  const clientId = await resolveClientId(context);
  if (!clientId) {
    return NextResponse.json({ error: "Resource not found." }, { status: 404 });
  }

  const access = await requireAssignedClientAccess({
    supabase: auth.context.supabase,
    context: auth.context,
    clientId,
  });
  if (!access.ok) return access.response;

  const organisationId =
    access.clientOrganisationId ?? auth.context.organisation.organisationId;
  if (!organisationId) {
    return NextResponse.json(
      { error: "Organisation context is required." },
      { status: 422 }
    );
  }

  try {
    await deletePrivateIdentity({
      supabase: auth.context.supabase,
      clientId,
      organisationId,
      actorUserId: auth.context.user.id,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return supabaseErrorResponse(error);
  }
}
