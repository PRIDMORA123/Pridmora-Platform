import { NextResponse } from "next/server";
import {
  requirePlatformOwner,
  ownerValidationResponse,
} from "@/lib/owner/auth";
import { writePlatformAudit } from "@/lib/owner/audit";
import { createCustomerOrganisation } from "@/lib/owner/create-organisation";
import { createCustomerOrganisationSchema } from "@/lib/owner/create-organisation-schema";
import { assertOwnerPayloadIsSafe } from "@/lib/owner/privacy";
import { listOwnerOrganisations } from "@/lib/owner/repository";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requirePlatformOwner();
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const organisations = await listOwnerOrganisations(auth.context.supabase, {
      search: searchParams.get("search") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      plan: searchParams.get("plan") ?? undefined,
    });

    const payload = { organisations };
    assertOwnerPayloadIsSafe(payload);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Owner organisations list failed:", error);
    return NextResponse.json(
      { error: "Unable to load organisations." },
      { status: 500 }
    );
  }
}

/**
 * Slice 1: create customer organisation with trial/licence.
 * No invitation / membership bootstrap in this route.
 */
export async function POST(request: Request) {
  const auth = await requirePlatformOwner();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return ownerValidationResponse("Invalid request body.");
  }

  const parsed = createCustomerOrganisationSchema.safeParse(body);
  if (!parsed.success) {
    const message =
      parsed.error.issues[0]?.message ?? "Invalid organisation payload.";
    return ownerValidationResponse(message);
  }

  try {
    const created = await createCustomerOrganisation({
      supabase: auth.context.supabase,
      name: parsed.data.name,
      country: parsed.data.country,
      website: parsed.data.website,
      ownerNotes: parsed.data.ownerNotes,
      seats: parsed.data.seats,
    });

    await writePlatformAudit({
      supabase: auth.context.supabase,
      actorUserId: auth.context.user.id,
      action: "organisation.created",
      entityType: "organisation",
      entityId: created.organisationId,
      organisationId: created.organisationId,
      metadata: {
        name: created.name,
        country: created.country,
        seats: created.seats,
        licenceStatus: created.licenceStatus,
        durationDays: created.durationDays,
        organisationType: created.organisationType,
        hasWebsite: Boolean(parsed.data.website),
        hasOwnerNotes: Boolean(parsed.data.ownerNotes),
      },
    });

    const payload = {
      ok: true as const,
      organisation: {
        id: created.organisationId,
        name: created.name,
        country: created.country,
        seatsPurchased: created.seats,
        licenceStatus: created.licenceStatus,
        licencePlanName: created.licencePlanName,
        licenceStartsAt: created.licenceStartsAt,
        licenceEndsAt: created.licenceEndsAt,
        durationDays: created.durationDays,
        trialId: created.trialId,
      },
    };
    assertOwnerPayloadIsSafe(payload);
    return NextResponse.json(payload, { status: 201 });
  } catch (error) {
    console.error("Owner create organisation failed:", error);
    const message =
      error instanceof Error ? error.message : "Unable to create organisation.";
    if (
      message.includes("required") ||
      message.includes("denied") ||
      message.includes("Seats") ||
      message.includes("too long")
    ) {
      return ownerValidationResponse(message);
    }
    return NextResponse.json(
      { error: "Unable to create organisation." },
      { status: 500 }
    );
  }
}
