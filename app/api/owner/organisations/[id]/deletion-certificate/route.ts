import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ownerUnavailableResponse,
  ownerValidationResponse,
  requirePlatformOwner,
} from "@/lib/owner/auth";
import { issueOrganisationDeletionCertificate } from "@/lib/owner/organisation-deletion-certificate";
import { assertOwnerPayloadIsSafe } from "@/lib/owner/privacy";
import {
  getSupabaseServiceClient,
  isSupabaseServiceRoleConfigured,
} from "@/lib/supabase/service-role";
import { isUuid } from "@/lib/uuid";

export const runtime = "nodejs";

const issueSchema = z.object({
  deletionRunId: z.string().uuid(),
  issueCertificateAcknowledged: z.literal(true),
});

/**
 * Issue the existing immutable deletion certificate after a fresh server-side
 * final verification pass. Does not delete tenant/Storage/Auth/commercial/
 * support/audit data. GET verification remains a separate read-only route.
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

  const parsed = issueSchema.safeParse(body);
  if (!parsed.success) {
    const ackMissing =
      body !== null &&
      typeof body === "object" &&
      "issueCertificateAcknowledged" in body &&
      (body as { issueCertificateAcknowledged?: unknown }).issueCertificateAcknowledged !== true;
    if (ackMissing) {
      return NextResponse.json(
        {
          error: "Confirm that this records application-data purge completion only.",
          code: "ACKNOWLEDGEMENT_REQUIRED",
          certificateCreated: false,
          runCompleted: false,
          authUsersDeleted: false,
          backupStatus: "unknown",
          externalFollowUpStatus: "unknown",
          eligibleErasureClaim: null,
        },
        { status: 422 }
      );
    }
    return ownerValidationResponse("Invalid deletion certificate request.");
  }

  if (!isSupabaseServiceRoleConfigured()) {
    return ownerUnavailableResponse(
      "Deletion certificate issuance is unavailable because server database access is not configured."
    );
  }

  try {
    const result = await issueOrganisationDeletionCertificate({
      ownerSupabase: auth.context.supabase,
      inventorySupabase: getSupabaseServiceClient(),
      formerOrganisationId: id,
      deletionRunId: parsed.data.deletionRunId,
      issueCertificateAcknowledged: parsed.data.issueCertificateAcknowledged,
    });
    assertOwnerPayloadIsSafe(result);
    if (!result.ok) {
      const status =
        result.code === "RUN_NOT_FOUND"
          ? 404
          : result.code === "PERMISSION_DENIED"
            ? 403
            : result.code === "ACKNOWLEDGEMENT_REQUIRED"
              ? 422
              : 409;
      return NextResponse.json(
        {
          error: result.error,
          code: result.code,
          certificateCreated: false,
          runCompleted: false,
          authUsersDeleted: false,
          backupStatus: "unknown",
          externalFollowUpStatus: "unknown",
          eligibleErasureClaim: null,
        },
        { status }
      );
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("deletion certificate issuance failed:", error);
    return NextResponse.json(
      { error: "Unable to issue the deletion certificate." },
      { status: 500 }
    );
  }
}
