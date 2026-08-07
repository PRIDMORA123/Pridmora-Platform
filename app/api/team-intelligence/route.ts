import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import {
  buildTeamIntelligenceView,
  listEvidenceForClient,
} from "@/lib/development-evidence";
import { parseIdentityMode } from "@/lib/relationship-identity";
import { getRelationshipDisplayName } from "@/lib/relationship-identity";

/**
 * Team Intelligence for the current organisation workspace.
 * Aggregates safely across assigned relationships.
 */
export async function GET() {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  try {
    const { data: memberships } = await auth.context.supabase
      .from("organisation_memberships")
      .select("organisation_id")
      .eq("user_id", auth.context.user.id)
      .eq("status", "active");

    const organisationIds = (memberships ?? [])
      .map(row => row.organisation_id as string)
      .filter(Boolean);

    if (organisationIds.length === 0) {
      return NextResponse.json({
        view: buildTeamIntelligenceView({ members: [] }),
        emptyReason: "No organisation workspace is active.",
      });
    }

    // Prefer the first active org membership for V1 team view.
    const organisationId = organisationIds[0]!;

    const { data: clients, error } = await auth.context.supabase
      .from("clients")
      .select(
        "id, name, identity_mode, display_label, confidential_reference, ai_name_allowed, role, organisation"
      )
      .eq("organisation_id", organisationId)
      .is("archived_at", null);

    if (error) {
      return NextResponse.json(
        { error: "Unable to load team relationships." },
        { status: 500 }
      );
    }

    const members = [];
    for (const client of clients ?? []) {
      const evidence = await listEvidenceForClient(
        auth.context.supabase,
        auth.context.user.id,
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
