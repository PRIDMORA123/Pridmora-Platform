import { NextResponse } from "next/server";
import {
  ownerUnavailableResponse,
  requirePlatformOwner,
} from "@/lib/owner/auth";
import { loadFinalVerificationState } from "@/lib/owner/organisation-final-verification";
import { assertOwnerPayloadIsSafe } from "@/lib/owner/privacy";
import {
  getSupabaseServiceClient,
  isSupabaseServiceRoleConfigured,
} from "@/lib/supabase/service-role";
import { isUuid } from "@/lib/uuid";

export const runtime = "nodejs";

/**
 * Independent read-only final verification. Does not create a certificate,
 * update the deletion run, or mutate Storage/Auth/tenant data.
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
      "Final verification is unavailable because server database access is not configured."
    );
  }

  try {
    const payload = await loadFinalVerificationState({
      ownerSupabase: auth.context.supabase,
      inventorySupabase: getSupabaseServiceClient(),
      formerOrganisationId: id,
    });
    assertOwnerPayloadIsSafe(payload);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("final verification failed:", error);
    return NextResponse.json(
      { error: "Unable to load final verification." },
      { status: 500 }
    );
  }
}
