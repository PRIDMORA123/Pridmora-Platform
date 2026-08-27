import { NextResponse } from "next/server";
import { requirePlatformOwner, ownerUnavailableResponse } from "@/lib/owner/auth";
import { loadOrganisationDeletionPreflight } from "@/lib/owner/organisation-deletion-preflight";
import { assertOwnerPayloadIsSafe } from "@/lib/owner/privacy";
import {
  getSupabaseServiceClient,
  isSupabaseServiceRoleConfigured,
} from "@/lib/supabase/service-role";
import { isUuid } from "@/lib/uuid";

export const runtime = "nodejs";

/**
 * Read-only organisation deletion preflight.
 * Does not freeze, copy, purge, or write deletion-foundation rows.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requirePlatformOwner();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Organisation not found." }, { status: 404 });
  }

  if (!isSupabaseServiceRoleConfigured()) {
    return ownerUnavailableResponse(
      "Organisation deletion preflight is unavailable because server database access is not configured."
    );
  }

  try {
    const payload = await loadOrganisationDeletionPreflight({
      supabase: getSupabaseServiceClient(),
      organisationId: id,
    });
    assertOwnerPayloadIsSafe(payload);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Organisation deletion preflight failed:", error);
    return NextResponse.json(
      { error: "Unable to load deletion preflight." },
      { status: 500 }
    );
  }
}
