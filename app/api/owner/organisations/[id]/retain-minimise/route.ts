import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ownerUnavailableResponse,
  ownerValidationResponse,
  requirePlatformOwner,
} from "@/lib/owner/auth";
import {
  loadRetainMinimiseState,
  minimiseOrganisationRetainRecords,
} from "@/lib/owner/organisation-retain-minimise";
import { assertOwnerPayloadIsSafe } from "@/lib/owner/privacy";
import {
  getSupabaseServiceClient,
  isSupabaseServiceRoleConfigured,
} from "@/lib/supabase/service-role";
import { isUuid } from "@/lib/uuid";

export const runtime = "nodejs";

const minimiseSchema = z.object({
  deletionRunId: z.string().uuid(),
  minimiseAcknowledged: z.literal(true),
});

/**
 * Read retain_minimise state for support_cases and platform_audit_events.
 * Does not minimise, purge, or mutate tenant data.
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
      "retain_minimise status is unavailable because server database access is not configured."
    );
  }

  try {
    const payload = await loadRetainMinimiseState({
      ownerSupabase: auth.context.supabase,
      inventorySupabase: getSupabaseServiceClient(),
      organisationId: id,
    });
    assertOwnerPayloadIsSafe(payload);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("retain_minimise status failed:", error);
    return NextResponse.json(
      { error: "Unable to load retain_minimise status." },
      { status: 500 }
    );
  }
}

/**
 * Minimise support_cases and platform_audit_events for a frozen deletion run.
 * Does not delete tenant rows, Storage, or Auth users, and does not advance purge.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requirePlatformOwner();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Organisation not found." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return ownerValidationResponse("Invalid request body.");
  }

  const parsed = minimiseSchema.safeParse(body);
  if (!parsed.success) {
    const ackMissing =
      body !== null &&
      typeof body === "object" &&
      "minimiseAcknowledged" in body &&
      (body as { minimiseAcknowledged?: unknown }).minimiseAcknowledged !== true;
    if (ackMissing) {
      return NextResponse.json(
        {
          error:
            "Confirm that this minimises support and audit records only and does not delete tenant data.",
          code: "ACKNOWLEDGEMENT_REQUIRED",
        },
        { status: 422 }
      );
    }
    return ownerValidationResponse("Invalid retain_minimise request.");
  }

  if (!isSupabaseServiceRoleConfigured()) {
    return ownerUnavailableResponse(
      "retain_minimise is unavailable because server database access is not configured."
    );
  }

  try {
    const result = await minimiseOrganisationRetainRecords({
      ownerSupabase: auth.context.supabase,
      inventorySupabase: getSupabaseServiceClient(),
      organisationId: id,
      deletionRunId: parsed.data.deletionRunId,
      minimiseAcknowledged: parsed.data.minimiseAcknowledged,
    });

    assertOwnerPayloadIsSafe(result);

    if (!result.ok) {
      const status =
        result.code === "NOT_FOUND" || result.code === "RUN_NOT_FOUND"
          ? 404
          : result.code === "PERMISSION_DENIED"
            ? 403
            : result.code === "ACKNOWLEDGEMENT_REQUIRED"
              ? 422
              : result.code === "STATUS_NOT_ALLOWED" ||
                  result.code === "PERSONAL_ORGANISATION" ||
                  result.code === "SAMPLE_INSTALLATION" ||
                  result.code === "SAMPLE_SOURCE_ORGANISATION" ||
                  result.code === "UNDELETABLE_ORGANISATION" ||
                  result.code === "INCONSISTENT_RUN" ||
                  result.code === "RUN_STATE_NOT_ALLOWED"
                ? 409
                : 500;
      return NextResponse.json(
        {
          error: result.error,
          code: result.code,
          permanentDeletionOccurred: false,
        },
        { status }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("retain_minimise failed:", error);
    return NextResponse.json(
      { error: "Unable to minimise retained support and audit records." },
      { status: 500 }
    );
  }
}
