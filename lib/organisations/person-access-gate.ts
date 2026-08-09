import { NextResponse } from "next/server";
import {
  requireAssignedClientAccess,
  requireOrganisationContext,
  type OrganisationRequestContext,
} from "@/lib/organisations/current-organisation";
import type { RelationshipAssignment } from "@/lib/organisations/types";
import { isUuid } from "@/lib/uuid";

export type AssignedPersonAccess = {
  ok: true;
  context: OrganisationRequestContext;
  clientId: string;
  assignment: RelationshipAssignment | null;
  privateNotesOwnerId: string;
  clientOrganisationId: string | null;
  clientCoachId: string;
};

/**
 * Strong person gate used by Prepare / Development-style AI routes:
 * authenticate → current organisation → person in org → assignment/authorisation.
 * Never trusts a browser-supplied person or organisation id as proof of access.
 */
export async function requireAssignedPersonInOrganisation(input: {
  clientId: unknown;
  bodyOrganisationId?: unknown;
  /** When true, also enforce organisation.aiEnabled (403 if disabled). */
  requireAiEnabled?: boolean;
}): Promise<AssignedPersonAccess | { ok: false; response: NextResponse }> {
  const auth = await requireOrganisationContext();
  if (!auth.ok) return auth;

  if (
    input.requireAiEnabled &&
    !auth.context.organisation.organisation.aiEnabled
  ) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "AI is disabled for this organisation." },
        { status: 403 }
      ),
    };
  }

  const clientId =
    typeof input.clientId === "string" ? input.clientId.trim() : "";
  if (!clientId || !isUuid(clientId)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "clientId is required." },
        { status: 400 }
      ),
    };
  }

  const access = await requireAssignedClientAccess({
    supabase: auth.context.supabase,
    context: auth.context,
    clientId,
  });
  if (!access.ok) return access;

  // Reject client-supplied organisation bypass attempts.
  if (
    typeof input.bodyOrganisationId === "string" &&
    input.bodyOrganisationId !== auth.context.organisation.organisationId
  ) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Resource not found." },
        { status: 404 }
      ),
    };
  }

  return {
    ok: true,
    context: auth.context,
    clientId,
    assignment: access.assignment,
    privateNotesOwnerId: access.privateNotesOwnerId,
    clientOrganisationId: access.clientOrganisationId,
    clientCoachId: access.clientCoachId,
  };
}
