import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ownerUnavailableResponse,
  ownerValidationResponse,
  requirePlatformOwner,
} from "@/lib/owner/auth";
import {
  executeOrganisationTenantPurge,
  loadTenantPurgeState,
} from "@/lib/owner/organisation-tenant-purge";
import { assertOwnerPayloadIsSafe } from "@/lib/owner/privacy";
import {
  getSupabaseServiceClient,
  isSupabaseServiceRoleConfigured,
} from "@/lib/supabase/service-role";
import { isUuid } from "@/lib/uuid";

export const runtime = "nodejs";

const purgeSchema = z.object({
  deletionRunId: z.string().uuid(),
  confirmationName: z.string().trim().min(1),
  instructionReference: z.string().trim().min(1),
  permanentErasureAcknowledged: z.literal(true),
});

/**
 * Read tenant-purge readiness. Does not purge, delete Storage, or mutate Auth.
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
      "Tenant purge status is unavailable because server database access is not configured."
    );
  }

  try {
    const payload = await loadTenantPurgeState({
      ownerSupabase: auth.context.supabase,
      inventorySupabase: getSupabaseServiceClient(),
      organisationId: id,
    });
    assertOwnerPayloadIsSafe(payload);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("tenant purge status failed:", error);
    return NextResponse.json(
      { error: "Unable to load tenant purge status." },
      { status: 500 }
    );
  }
}

/**
 * Permanently erase authorised tenant DB rows and captured Storage objects.
 * Does not delete Auth users or create a deletion certificate.
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

  const parsed = purgeSchema.safeParse(body);
  if (!parsed.success) {
    const ackMissing =
      body !== null &&
      typeof body === "object" &&
      "permanentErasureAcknowledged" in body &&
      (body as { permanentErasureAcknowledged?: unknown }).permanentErasureAcknowledged !== true;
    if (ackMissing) {
      return NextResponse.json(
        {
          error:
            "Confirm that this permanently erases tenant database data and captured Storage objects.",
          code: "ACKNOWLEDGEMENT_REQUIRED",
        },
        { status: 422 }
      );
    }
    return ownerValidationResponse("Invalid tenant purge request.");
  }

  if (!isSupabaseServiceRoleConfigured()) {
    return ownerUnavailableResponse(
      "Tenant purge is unavailable because server database access is not configured."
    );
  }

  try {
    const result = await executeOrganisationTenantPurge({
      ownerSupabase: auth.context.supabase,
      inventorySupabase: getSupabaseServiceClient(),
      organisationId: id,
      deletionRunId: parsed.data.deletionRunId,
      confirmationName: parsed.data.confirmationName,
      instructionReference: parsed.data.instructionReference,
      permanentErasureAcknowledged: parsed.data.permanentErasureAcknowledged,
    });

    assertOwnerPayloadIsSafe(result);

    if (!result.ok) {
      const status =
        result.code === "NOT_FOUND" || result.code === "RUN_NOT_FOUND"
          ? 404
          : result.code === "ACKNOWLEDGEMENT_REQUIRED" ||
              result.code === "CONFIRMATION_NAME_MISMATCH" ||
              result.code === "INSTRUCTION_REQUIRED"
            ? 422
            : 409;
      return NextResponse.json(
        {
          error: result.error,
          code: result.code,
          permanentDeletionOccurred: result.permanentDeletionOccurred,
          authUsersDeleted: false,
          certificateCreated: false,
        },
        { status }
      );
    }

    return NextResponse.json(result.state);
  } catch (error) {
    console.error("tenant purge failed:", error);
    return NextResponse.json(
      { error: "Unable to purge tenant data." },
      { status: 500 }
    );
  }
}
