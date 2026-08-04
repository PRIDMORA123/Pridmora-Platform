import { NextResponse } from "next/server";
import { requireOrganisationContext } from "@/lib/organisations/current-organisation";
import { listClientsFromDb } from "@/lib/supabase/repository";
import { supabaseErrorResponse } from "@/lib/supabase/errors";
import { searchPrivateIdentityClientIds } from "@/lib/private-identity";
import {
  relationshipPublicIdentity,
  type RelationshipPublicIdentity,
} from "@/lib/relationship-identity";
import type { Client } from "@/lib/types";

export const runtime = "nodejs";

/**
 * GET /api/clients/search?q=
 *
 * Authorised coaches can search by confidential reference, display label,
 * public name, role, organisation, and (server-side) private real name.
 *
 * Results always return the public relationship representation —
 * never the private real name.
 */
export async function GET(request: Request) {
  const auth = await requireOrganisationContext();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();

  if (!q) {
    return NextResponse.json({ results: [], query: q });
  }

  const organisationId = auth.context.organisation.organisationId;
  const role = auth.context.organisation.role;
  const assignedOnly =
    role === "practitioner" ||
    role === "owner" ||
    role === "administrator";

  try {
    const clients = await listClientsFromDb(
      auth.context.supabase,
      auth.context.coachId,
      {
        organisationId,
        assignedOnly,
      }
    );

    const lower = q.toLowerCase();
    const publicMatches = clients.filter(client => matchesPublicFields(client, lower));

    // Private name search: RLS restricts to direct practitioners.
    // Organisation-wide users without assignment match nothing.
    let privateMatchIds: string[] = [];
    if (organisationId && q.length >= 2) {
      try {
        privateMatchIds = await searchPrivateIdentityClientIds({
          supabase: auth.context.supabase,
          organisationId,
          query: q,
        });
      } catch (error) {
        console.warn("Private identity search skipped:", {
          organisationId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const byId = new Map<string, Client>();
    for (const client of publicMatches) {
      byId.set(client.id, client);
    }
    for (const id of privateMatchIds) {
      const client = clients.find(c => c.id === id);
      if (client) byId.set(client.id, client);
    }

    const results: Array<{
      id: string;
      identity: RelationshipPublicIdentity;
    }> = Array.from(byId.values()).map(client => ({
      id: client.id,
      identity: relationshipPublicIdentity(client),
    }));

    return NextResponse.json({ results, query: q });
  } catch (error) {
    return supabaseErrorResponse(error);
  }
}

function matchesPublicFields(client: Client, lowerQuery: string): boolean {
  const identity = relationshipPublicIdentity(client);
  const haystack = [
    identity.displayName,
    identity.displayLabel,
    identity.confidentialReference ?? "",
    identity.role,
    identity.organisation,
    client.name,
    client.currentFocus,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(lowerQuery);
}
