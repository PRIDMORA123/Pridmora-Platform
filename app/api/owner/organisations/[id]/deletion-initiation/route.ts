import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ownerUnavailableResponse,
  ownerValidationResponse,
  requirePlatformOwner,
} from "@/lib/owner/auth";
import {
  INSTRUCTION_REFERENCE_MAX_LENGTH,
  initiateOrganisationClosure,
  loadOpenOrganisationDeletionRun,
} from "@/lib/owner/organisation-deletion-initiation";
import { assertOwnerPayloadIsSafe } from "@/lib/owner/privacy";
import {
  getSupabaseServiceClient,
  isSupabaseServiceRoleConfigured,
} from "@/lib/supabase/service-role";
import { isUuid } from "@/lib/uuid";

export const runtime = "nodejs";

const initiateSchema = z.object({
  confirmationName: z.string().min(1).max(200),
  instructionReference: z.string().min(1).max(INSTRUCTION_REFERENCE_MAX_LENGTH),
  freezeAcknowledged: z.literal(true),
});

/**
 * Read current open deletion run / closure state.
 * Does not mutate organisation status or tenant data.
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

  try {
    const payload = await loadOpenOrganisationDeletionRun({
      supabase: auth.context.supabase,
      organisationId: id,
    });
    assertOwnerPayloadIsSafe(payload);
    return NextResponse.json({
      ...payload,
      organisationId: id,
      permanentDeletionOccurred: false,
    });
  } catch (error) {
    console.error("Organisation deletion run lookup failed:", error);
    return NextResponse.json(
      { error: "Unable to load deletion run." },
      { status: 500 }
    );
  }
}

/**
 * Authorise closure and freeze organisation access.
 * Creates one organisation_deletion_run and sets pending_closure.
 * Does not purge, copy commercial records, delete storage, or create a certificate.
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

  const parsed = initiateSchema.safeParse(body);
  if (!parsed.success) {
    const freezeMissing =
      body !== null &&
      typeof body === "object" &&
      "freezeAcknowledged" in body &&
      (body as { freezeAcknowledged?: unknown }).freezeAcknowledged !== true;
    if (freezeMissing) {
      return NextResponse.json(
        {
          error: "Confirm that organisation access will be frozen before continuing.",
          code: "ACKNOWLEDGEMENT_REQUIRED",
        },
        { status: 422 }
      );
    }
    return ownerValidationResponse("Invalid closure initiation request.");
  }

  if (!isSupabaseServiceRoleConfigured()) {
    return ownerUnavailableResponse(
      "Organisation closure initiation is unavailable because server database access is not configured."
    );
  }

  try {
    const result = await initiateOrganisationClosure({
      ownerSupabase: auth.context.supabase,
      inventorySupabase: getSupabaseServiceClient(),
      organisationId: id,
      confirmationName: parsed.data.confirmationName,
      instructionReference: parsed.data.instructionReference,
      freezeAcknowledged: parsed.data.freezeAcknowledged,
    });

    assertOwnerPayloadIsSafe(result);

    if (!result.ok) {
      const status =
        result.code === "NOT_FOUND"
          ? 404
          : result.code === "PERMISSION_DENIED"
            ? 403
            : result.code === "PREFLIGHT_NOT_ELIGIBLE" ||
                result.code === "CONFIRMATION_MISMATCH" ||
                result.code === "ARCHIVED_ORGANISATION" ||
                result.code === "PERSONAL_ORGANISATION" ||
                result.code === "SAMPLE_INSTALLATION" ||
                result.code === "SAMPLE_SOURCE_ORGANISATION" ||
                result.code === "UNDELETABLE_ORGANISATION" ||
                result.code === "STATUS_NOT_ALLOWED" ||
                result.code === "INCONSISTENT_RUN" ||
                result.code === "INCONSISTENT_CLOSURE"
              ? 409
              : result.code === "INSTRUCTION_REQUIRED" ||
                  result.code === "ACKNOWLEDGEMENT_REQUIRED"
                ? 422
                : 500;
      return NextResponse.json(
        {
          error: result.error,
          code: result.code,
          eligibility: result.eligibility,
          reasons: result.reasons ?? [],
          permanentDeletionOccurred: false,
        },
        { status }
      );
    }

    return NextResponse.json({
      ok: true,
      alreadyStarted: result.alreadyStarted,
      deletionRunId: result.deletionRunId,
      organisationId: result.organisationId,
      formerOrganisationId: result.formerOrganisationId,
      organisationStatus: result.organisationStatus,
      runStatus: result.runStatus,
      stage: result.stage,
      requestedAt: result.requestedAt,
      authorisedBy: result.authorisedBy,
      instructionReference: result.instructionReference,
      permanentDeletionOccurred: false,
    });
  } catch (error) {
    console.error("Organisation closure initiation failed:", error);
    return NextResponse.json(
      { error: "Unable to authorise organisation closure." },
      { status: 500 }
    );
  }
}
