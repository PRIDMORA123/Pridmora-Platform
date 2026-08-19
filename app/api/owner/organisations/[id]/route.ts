import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformOwner, ownerValidationResponse } from "@/lib/owner/auth";
import { writePlatformAudit } from "@/lib/owner/audit";
import { convertTrialOrganisationToActive } from "@/lib/owner/convert-trial-to-active";
import { assertOwnerPayloadIsSafe } from "@/lib/owner/privacy";
import {
  getOwnerOrganisationDetail,
  listContracts,
  listInvoices,
  listOwnerUsers,
  listPaymentMethods,
  listPlatformAuditEvents,
  listPurchaseOrders,
  listSubscriptions,
  listSupportCases,
  listTrials,
} from "@/lib/owner/repository";

export const runtime = "nodejs";

const patchSchema = z.object({
  action: z.enum(["convert_trial_to_active"]).optional(),
  legalName: z.string().trim().max(200).nullable().optional(),
  tradingName: z.string().trim().max(200).nullable().optional(),
  sector: z.string().trim().max(120).nullable().optional(),
  companySize: z.string().trim().max(80).nullable().optional(),
  primaryContactName: z.string().trim().max(200).nullable().optional(),
  primaryContactEmail: z.string().trim().email().nullable().optional().or(z.literal("")),
  billingContactName: z.string().trim().max(200).nullable().optional(),
  billingContactEmail: z.string().trim().email().nullable().optional().or(z.literal("")),
  accountOwnerLabel: z.string().trim().max(200).nullable().optional(),
  licenceStatus: z
    .enum(["active", "trial", "suspended", "cancelled", "expired"])
    .optional(),
  licencePlanName: z.string().trim().max(120).optional(),
  seatsPurchased: z.number().int().min(0).max(100000).optional(),
  licenceEndsAt: z.string().date().nullable().optional(),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requirePlatformOwner();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;

  try {
    const detail = await getOwnerOrganisationDetail(auth.context.supabase, id);
    if (!detail) {
      return NextResponse.json({ error: "Organisation not found." }, { status: 404 });
    }

    const [users, subscriptions, invoices, paymentMethods, purchaseOrders, contracts, trials, support, audit] =
      await Promise.all([
        listOwnerUsers(auth.context.supabase, { organisationId: id }),
        listSubscriptions(auth.context.supabase).then(rows =>
          rows.filter(row => row.organisationId === id)
        ),
        listInvoices(auth.context.supabase, { organisationId: id }),
        listPaymentMethods(auth.context.supabase, id),
        listPurchaseOrders(auth.context.supabase, id),
        listContracts(auth.context.supabase, id),
        listTrials(auth.context.supabase).then(rows =>
          rows.filter(row => row.organisationId === id)
        ),
        listSupportCases(auth.context.supabase, { organisationId: id }),
        listPlatformAuditEvents(auth.context.supabase, 50).then(rows =>
          rows.filter(row => row.organisationId === id)
        ),
      ]);

    const payload = {
      ...detail,
      users,
      subscriptions,
      invoices,
      paymentMethods,
      purchaseOrders,
      contracts,
      trials,
      support,
      audit,
      confidentialityNote:
        "Owner Console shows operational and commercial metadata only. Conversation contents, reflections, preparation text and private notes are not available here.",
    };

    assertOwnerPayloadIsSafe(payload);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Owner organisation detail failed:", error);
    return NextResponse.json(
      { error: "Unable to load organisation." },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requirePlatformOwner();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return ownerValidationResponse("Invalid request body.");
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return ownerValidationResponse("Invalid organisation update.");
  }

  const data = parsed.data;

  if (data.action === "convert_trial_to_active") {
    const result = await convertTrialOrganisationToActive({
      supabase: auth.context.supabase,
      organisationId: id,
      actorUserId: auth.context.user.id,
    });
    if (!result.ok) {
      const status =
        result.code === "NOT_FOUND"
          ? 404
          : result.code === "NOT_TRIAL"
            ? 400
            : 500;
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status }
      );
    }
    return NextResponse.json({
      ok: true,
      organisationId: result.organisationId,
      licenceStatus: "active",
      licenceEndsAt: null,
    });
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (data.legalName !== undefined) updates.legal_name = data.legalName;
  if (data.tradingName !== undefined) updates.trading_name = data.tradingName;
  if (data.sector !== undefined) updates.sector = data.sector;
  if (data.companySize !== undefined) updates.company_size = data.companySize;
  if (data.primaryContactName !== undefined) {
    updates.primary_contact_name = data.primaryContactName;
  }
  if (data.primaryContactEmail !== undefined) {
    updates.primary_contact_email = data.primaryContactEmail || null;
  }
  if (data.billingContactName !== undefined) {
    updates.billing_contact_name = data.billingContactName;
  }
  if (data.billingContactEmail !== undefined) {
    updates.billing_contact_email = data.billingContactEmail || null;
  }
  if (data.accountOwnerLabel !== undefined) {
    updates.account_owner_label = data.accountOwnerLabel;
  }
  if (data.licenceStatus !== undefined) updates.licence_status = data.licenceStatus;
  if (data.licencePlanName !== undefined) {
    updates.licence_plan_name = data.licencePlanName;
  }
  if (data.seatsPurchased !== undefined) {
    updates.practitioner_seats_purchased = data.seatsPurchased;
  }
  if (data.licenceEndsAt !== undefined) updates.licence_ends_at = data.licenceEndsAt;

  const { error } = await auth.context.supabase
    .from("organisations")
    .update(updates)
    .eq("id", id);

  if (error) {
    console.error("Owner organisation update failed:", error.message);
    return NextResponse.json(
      { error: "Unable to update organisation." },
      { status: 500 }
    );
  }

  const action =
    data.licenceStatus === "suspended"
      ? "organisation.suspended"
      : data.licenceStatus === "active"
        ? "organisation.reactivated"
        : "organisation.updated";

  await writePlatformAudit({
    supabase: auth.context.supabase,
    actorUserId: auth.context.user.id,
    action,
    entityType: "organisation",
    entityId: id,
    organisationId: id,
    metadata: {
      fields: Object.keys(parsed.data),
      licenceStatus: data.licenceStatus ?? null,
    },
  });

  return NextResponse.json({ ok: true });
}
