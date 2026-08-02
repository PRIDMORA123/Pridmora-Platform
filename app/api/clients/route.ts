import { NextResponse } from "next/server";
import {
  claimLegacyDemoDataIfEligible,
  ensureCoachProfile,
} from "@/lib/auth/session";
import { requireOrganisationContext } from "@/lib/organisations/current-organisation";
import { canCreateRelationships } from "@/lib/organisations/permissions";
import { createClientInDb, listClientsFromDb } from "@/lib/supabase/repository";
import { initialsFromName } from "@/lib/supabase/map";
import { supabaseErrorResponse } from "@/lib/supabase/errors";
import type { Client } from "@/lib/types";

export const runtime = "nodejs";

function asOptionalTrimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET() {
  const auth = await requireOrganisationContext();
  if (!auth.ok) return auth.response;

  try {
    await ensureCoachProfile(auth.context.supabase, auth.context.user);
    await claimLegacyDemoDataIfEligible(auth.context.supabase, auth.context.user);

    const organisationId = auth.context.organisation.organisationId;
    const role = auth.context.organisation.role;

    // Practitioners / content roles: assigned relationships only.
    // Admins without assignment do not receive confidential People lists here.
    const assignedOnly =
      role === "practitioner" ||
      role === "owner" ||
      role === "administrator";

    const clients = await listClientsFromDb(
      auth.context.supabase,
      auth.context.coachId,
      {
        organisationId,
        assignedOnly,
      }
    );
    return NextResponse.json({
      clients,
      organisationId,
    });
  } catch (error) {
    return supabaseErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const auth = await requireOrganisationContext();
  if (!auth.ok) return auth.response;

  try {
    if (!canCreateRelationships(auth.context.organisation.role)) {
      return NextResponse.json({ error: "Permission denied." }, { status: 403 });
    }

    const body = (await request.json()) as {
      name?: unknown;
      organisation?: unknown;
      role?: unknown;
      currentFocus?: unknown;
      email?: unknown;
      // Never trust browser-supplied organisation ownership.
      organisationId?: unknown;
      client?: {
        name?: unknown;
        organisation?: unknown;
        role?: unknown;
        currentFocus?: unknown;
        email?: unknown;
      };
    };

    const source = body.client ?? body;
    const name = asOptionalTrimmed(source.name);
    if (!name) {
      return NextResponse.json({ error: "Client name is required." }, { status: 400 });
    }

    const organisation = asOptionalTrimmed(source.organisation);
    const role = asOptionalTrimmed(source.role);
    const currentFocus = asOptionalTrimmed(source.currentFocus);
    const email = asOptionalTrimmed(source.email);

    // Organisation ownership comes from secure context — never from the body.
    const organisationId = auth.context.organisation.organisationId;
    const id = crypto.randomUUID();
    const coachId = auth.context.coachId;
    const client: Client = {
      id,
      name,
      initials: initialsFromName(name),
      organisation,
      role,
      email,
      status: "Active",
      nextSession: "Not scheduled",
      currentFocus,
      identitySummary: "",
      coachInsight: "",
      preparationStyleOverride: null,
      strengths: [],
      values: [],
      themes: [],
      goals: [],
      actions: [],
      quotes: [],
      sessions: [],
      journey: [],
    };

    const saved = await createClientInDb(
      auth.context.supabase,
      coachId,
      client,
      organisationId !== coachId ? organisationId : organisationId
    );
    return NextResponse.json({ client: saved, organisationId }, { status: 201 });
  } catch (error) {
    return supabaseErrorResponse(error);
  }
}
