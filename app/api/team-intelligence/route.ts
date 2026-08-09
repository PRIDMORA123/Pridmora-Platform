import { NextResponse } from "next/server";
import {
  buildTeamIntelligenceView,
  listEvidenceForClient,
} from "@/lib/development-evidence";
import { requireOrganisationContext } from "@/lib/organisations/current-organisation";
import { listAssignedClientIds } from "@/lib/organisations/repository";
import { parseIdentityMode } from "@/lib/relationship-identity";
import { getRelationshipDisplayName } from "@/lib/relationship-identity";

/**
 * Team Intelligence for the current organisation workspace.
 * Aggregates safely across assigned relationships only.
 * Never uses "first membership" — always the authenticated user's active org.
 */
export async function GET() {
  const auth = await requireOrganisationContext();
  if (!auth.ok) return auth.response;

  const organisationId = auth.context.organisation.organisationId;
  const userId = auth.context.user.id;
  const supabase = auth.context.supabase;

  try {
    const assignedIds = await listAssignedClientIds(
      supabase,
      organisationId,
      userId
    );

    // Mirror listClientsFromDb: assignment rows when present; otherwise
    // coach-owned rows still inside the active organisation (solo/legacy).
    let query = supabase
      .from("clients")
      .select(
        "id, name, identity_mode, display_label, confidential_reference, ai_name_allowed, role, organisation, organisation_id, coach_id"
      )
      .eq("organisation_id", organisationId)
      .is("archived_at", null);

    if (assignedIds.length > 0) {
      query = query.in("id", assignedIds);
    } else {
      query = query.eq("coach_id", userId);
    }

    const { data: clients, error } = await query;

    if (error) {
      return NextResponse.json(
        { error: "Unable to load team relationships." },
        { status: 500 }
      );
    }

    // Defence in depth: never return rows from another organisation.
    const scopedClients = (clients ?? []).filter(
      client =>
        typeof client.organisation_id === "string" &&
        client.organisation_id === organisationId
    );

    const members = [];
    for (const client of scopedClients) {
      const evidence = await listEvidenceForClient(
        supabase,
        userId,
        String(client.id)
      );
      members.push({
        relationshipId: String(client.id),
        publicLabel: getRelationshipDisplayName({
          name: String(client.name ?? ""),
          identityMode: client.identity_mode as string,
          displayLabel: client.display_label as string,
          confidentialReference: client.confidential_reference as string,
          aiNameAllowed: Boolean(client.ai_name_allowed),
          role: client.role as string,
          organisation: client.organisation as string,
        }),
        identityMode: parseIdentityMode(client.identity_mode),
        evidence,
      });
    }

    const view = buildTeamIntelligenceView({ members });
    return NextResponse.json({ view, organisationId });
  } catch (error) {
    console.error(
      "Team intelligence error:",
      error instanceof Error ? error.message : "unknown"
    );
    return NextResponse.json(
      { error: "Unable to load team intelligence." },
      { status: 500 }
    );
  }
}
