import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ownerUnavailableResponse,
  ownerValidationResponse,
  requirePlatformOwner,
} from "@/lib/owner/auth";
import {
  loadAuditReminimiseState,
  reminimiseOrganisationAuditEvents,
} from "@/lib/owner/organisation-audit-reminimise";
import { assertOwnerPayloadIsSafe } from "@/lib/owner/privacy";
import {
  getSupabaseServiceClient,
  isSupabaseServiceRoleConfigured,
} from "@/lib/supabase/service-role";
import { isUuid } from "@/lib/uuid";

export const runtime = "nodejs";

const reminimiseSchema = z.object({
  deletionRunId: z.string().uuid(),
  reminimiseAcknowledged: z.literal(true),
});

/**
 * Read-only retained-audit re-minimise status. Does not mutate.
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
      "Audit re-minimise status is unavailable because server database access is not configured."
    );
  }

  try {
    const payload = await loadAuditReminimiseState({
      ownerSupabase: auth.context.supabase,
      inventorySupabase: getSupabaseServiceClient(),
      formerOrganisationId: id,
    });
    assertOwnerPayloadIsSafe(payload);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("audit re-minimise status failed:", error);
    return NextResponse.json(
      { error: "Unable to load audit re-minimise status." },
      { status: 500 }
    );
  }
}

/**
 * Idempotently re-minimise retained platform_audit_events for a former
 * organisation. Does not create a certificate or change the deletion run.
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

  const parsed = reminimiseSchema.safeParse(body);
  if (!parsed.success) {
    const ackMissing =
      body !== null &&
      typeof body === "object" &&
      "reminimiseAcknowledged" in body &&
      (body as { reminimiseAcknowledged?: unknown }).reminimiseAcknowledged !== true;
    if (ackMissing) {
      return NextResponse.json(
        {
          error: "Confirm that this re-minimises retained audit events only.",
          code: "ACKNOWLEDGEMENT_REQUIRED",
        },
        { status: 422 }
      );
    }
    return ownerValidationResponse("Invalid audit re-minimise request.");
  }

  if (!isSupabaseServiceRoleConfigured()) {
    return ownerUnavailableResponse(
      "Audit re-minimise is unavailable because server database access is not configured."
    );
  }

  try {
    const result = await reminimiseOrganisationAuditEvents({
      ownerSupabase: auth.context.supabase,
      inventorySupabase: getSupabaseServiceClient(),
      formerOrganisationId: id,
      deletionRunId: parsed.data.deletionRunId,
      reminimiseAcknowledged: parsed.data.reminimiseAcknowledged,
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
              : result.code === "INCONSISTENT_RUN" ||
                  result.code === "RUN_STATE_NOT_ALLOWED"
                ? 409
                : 500;
      return NextResponse.json(
        {
          error: result.error,
          code: result.code,
          certificateCreated: false,
          authUsersDeleted: false,
        },
        { status }
      );
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("audit re-minimise failed:", error);
    return NextResponse.json(
      { error: "Unable to re-minimise retained audit events." },
      { status: 500 }
    );
  }
}
