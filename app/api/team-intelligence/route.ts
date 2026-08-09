import { NextResponse } from "next/server";
import {
  buildTeamIntelligenceView,
  listEvidenceForClient,
} from "@/lib/development-evidence";
import { isSelfDevelopmentClientRow } from "@/lib/my-development/self-development-identity";
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
    // Prefer is_self_development when the column exists; fall back if absent.
    const selectWithFlag =
      "id, name, identity_mode, display_label, confidential_reference, ai_name_allowed, role, organisation, organisation_id, coach_id, is_self_development";
    const selectFallback =
      "id, name, identity_mode, display_label, confidential_reference, ai_name_allowed, role, organisation, organisation_id, coach_id";

    async function loadClients(select: string) {
      let query = supabase
        .from("clients")
        .select(select)
        .eq("organisation_id", organisationId)
        .is("archived_at", null);

      if (assignedIds.length > 0) {
        query = query.in("id", assignedIds);
      } else {
        query = query.eq("coach_id", userId);
      }

      return query;
    }

    let { data: clients, error } = await loadClients(selectWithFlag);

    if (
      error &&
      /is_self_development|schema cache|could not find/i.test(error.message)
    ) {
      ({ data: clients, error } = await loadClients(selectFallback));
    }

    if (error) {
      return NextResponse.json(
        { error: "Unable to load team relationships." },
        { status: 500 }
      );
    }

    type TeamClientRow = {
      id: string;
      name: string | null;
      identity_mode: string | null;
      display_label: string | null;
      confidential_reference: string | null;
      ai_name_allowed: boolean | null;
      role: string | null;
      organisation: string | null;
      organisation_id: string | null;
      is_self_development?: boolean | null;
    };

    // Defence in depth: never return rows from another organisation.
    // Same self-development exclusion as People (flag OR role sentinel).
    const scopedClients = ((clients ?? []) as unknown as TeamClientRow[]).filter(
      row => {
        const orgOk =
          typeof row.organisation_id === "string" &&
          row.organisation_id === organisationId;
        if (!orgOk) return false;
        return !isSelfDevelopmentClientRow(row);
      }
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
