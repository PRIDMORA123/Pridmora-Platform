import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ownerUnavailableResponse,
  ownerValidationResponse,
  requirePlatformOwner,
} from "@/lib/owner/auth";
import {
  copyOrganisationCommercialRecords,
  loadCommercialRetentionState,
} from "@/lib/owner/organisation-commercial-retention";
import { assertOwnerPayloadIsSafe } from "@/lib/owner/privacy";
import {
  getSupabaseServiceClient,
  isSupabaseServiceRoleConfigured,
} from "@/lib/supabase/service-role";
import { isUuid } from "@/lib/uuid";

export const runtime = "nodejs";

const copySchema = z.object({
  deletionRunId: z.string().uuid(),
  commercialCopyAcknowledged: z.literal(true),
});

/**
 * Read commercial retention / purge-readiness state.
 * Does not copy, purge, or mutate tenant data.
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
      "Commercial retention status is unavailable because server database access is not configured."
    );
  }

  try {
    const payload = await loadCommercialRetentionState({
      ownerSupabase: auth.context.supabase,
      inventorySupabase: getSupabaseServiceClient(),
      organisationId: id,
    });
    assertOwnerPayloadIsSafe(payload);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Commercial retention status failed:", error);
    return NextResponse.json(
      { error: "Unable to load commercial retention status." },
      { status: 500 }
    );
  }
}

/**
 * Prepare retained commercial records for a frozen deletion run.
 * Does not purge tenant data, delete storage, or create a certificate.
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

  const parsed = copySchema.safeParse(body);
  if (!parsed.success) {
    const freezeMissing =
      body !== null &&
      typeof body === "object" &&
      "commercialCopyAcknowledged" in body &&
      (body as { commercialCopyAcknowledged?: unknown }).commercialCopyAcknowledged !==
        true;
    if (freezeMissing) {
      return NextResponse.json(
        {
          error:
            "Confirm that this copies commercial metadata only and does not delete tenant data.",
          code: "ACKNOWLEDGEMENT_REQUIRED",
        },
        { status: 422 }
      );
    }
    return ownerValidationResponse("Invalid commercial retention request.");
  }

  if (!isSupabaseServiceRoleConfigured()) {
    return ownerUnavailableResponse(
      "Commercial retention copy is unavailable because server database access is not configured."
    );
  }

  try {
    const result = await copyOrganisationCommercialRecords({
      ownerSupabase: auth.context.supabase,
      inventorySupabase: getSupabaseServiceClient(),
      organisationId: id,
      deletionRunId: parsed.data.deletionRunId,
      commercialCopyAcknowledged: parsed.data.commercialCopyAcknowledged,
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
                  result.code === "RUN_STATE_NOT_ALLOWED" ||
                  result.code === "COMMERCIAL_COPY_INCOMPLETE"
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
    console.error("Commercial retention copy failed:", error);
    return NextResponse.json(
      { error: "Unable to prepare the retained commercial record." },
      { status: 500 }
    );
  }
}
