import { NextResponse } from "next/server";
import {
  claimLegacyDemoDataIfEligible,
  ensureCoachProfile,
} from "@/lib/auth/session";
import { requireOrganisationContext } from "@/lib/organisations/current-organisation";
import {
  canCreateRelationships,
  requiresAssignedOnlyPeopleList,
} from "@/lib/organisations/permissions";
import {
  createRelationshipAtomicInDb,
  listClientsFromDb,
} from "@/lib/supabase/repository";
import { initialsFromName } from "@/lib/supabase/map";
import { supabaseErrorResponse } from "@/lib/supabase/errors";
import {
  generateConfidentialReference,
  validateCreateRelationshipIdentity,
} from "@/lib/relationship-identity";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireOrganisationContext();
  if (!auth.ok) return auth.response;

  try {
    await ensureCoachProfile(auth.context.supabase, auth.context.user);
    await claimLegacyDemoDataIfEligible(auth.context.supabase, auth.context.user);

    const organisationId = auth.context.organisation.organisationId;
    const role = auth.context.organisation.role;

    // Practitioners / content roles / oversight: assigned relationships only.
    // Admins and Leads without assignment do not receive org-wide People lists here.
    const assignedOnly = requiresAssignedOnlyPeopleList(role);

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

    const body = (await request.json()) as Record<string, unknown>;
    const source =
      body.client && typeof body.client === "object"
        ? (body.client as Record<string, unknown>)
        : body;

    // Organisation ownership comes from secure context — never from the body.
    // Never trust browser-supplied organisationId / organisation_id.
    // Never trust browser-supplied coachId / coach_id / confidential_reference.
    const organisationId = auth.context.organisation.organisationId;
    if (!organisationId) {
      return NextResponse.json(
        { error: "Organisation context is required to create a relationship." },
        { status: 422 }
      );
    }

    const validated = validateCreateRelationshipIdentity(
      {
        identityMode: source.identityMode,
        name: source.name,
        displayLabel: source.displayLabel,
        role: source.role,
        organisation: source.organisation,
        currentFocus: source.currentFocus,
        email: source.email,
        aiNameAllowed: source.aiNameAllowed,
        privateRealName: source.privateRealName ?? source.realName,
        privateEmail: source.privateEmail,
        privatePhone: source.privatePhone ?? source.phone,
        privateNotes: source.privateNotes,
        confidentialReference: source.confidentialReference,
        organisationId: source.organisationId ?? body.organisationId,
        organisation_id: source.organisation_id ?? body.organisation_id,
        coachId: source.coachId ?? body.coachId,
        coach_id: source.coach_id ?? body.coach_id,
      },
      {
        // Local validation only — the SECURITY DEFINER RPC regenerates the
        // confidential reference server-side and never accepts a browser value.
        generateReference: generateConfidentialReference,
      }
    );

    if ("status" in validated) {
      return NextResponse.json(
        { error: validated.error },
        { status: validated.status }
      );
    }

    const saved = await createRelationshipAtomicInDb(auth.context.supabase, {
      organisationId,
      identityMode: validated.identityMode,
      name: validated.name,
      displayLabel: validated.displayLabel,
      role: validated.role,
      organisationLabel: validated.organisation,
      email: validated.email,
      currentFocus: validated.currentFocus,
      aiNameAllowed: validated.aiNameAllowed,
      initials: initialsFromName(validated.name),
      privateRealName: validated.privateIdentity?.realName,
      privateEmail: validated.privateIdentity?.email,
      privatePhone: validated.privateIdentity?.phone,
      privateNotes: validated.privateIdentity?.privateNotes,
    });

    return NextResponse.json({ client: saved, organisationId }, { status: 201 });
  } catch (error) {
    return supabaseErrorResponse(error);
  }
}
