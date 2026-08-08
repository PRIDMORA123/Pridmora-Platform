import { NextResponse } from "next/server";
import { z } from "zod";
import {
  requirePlatformOwner,
  ownerValidationResponse,
} from "@/lib/owner/auth";
import { writePlatformAudit } from "@/lib/owner/audit";
import {
  assertSafePaymentMethodPayload,
  buildMaskedPaymentDescriptor,
  sanitiseLastFour,
} from "@/lib/owner/payment-methods";
import { derivePurchaseOrderStatus } from "@/lib/owner/purchase-orders";

export const runtime = "nodejs";

const mutateSchema = z.discriminatedUnion("entity", [
  z.object({
    entity: z.literal("subscription"),
    organisationId: z.string().uuid(),
    planCode: z.string().min(1).max(80),
    seats: z.number().int().min(0),
    billingFrequency: z.enum(["monthly", "annual", "custom"]),
    status: z.enum(["trial", "active", "past_due", "paused", "cancelled"]),
    currency: z.string().min(3).max(3).default("GBP"),
    monthlyValueMinor: z.number().int().min(0).nullable().optional(),
    annualValueMinor: z.number().int().min(0).nullable().optional(),
    startsAt: z.string().date().nullable().optional(),
    renewalAt: z.string().date().nullable().optional(),
    trialEndsAt: z.string().date().nullable().optional(),
    externalProvider: z.string().max(80).nullable().optional(),
    externalCustomerId: z.string().max(200).nullable().optional(),
    externalSubscriptionId: z.string().max(200).nullable().optional(),
  }),
  z.object({
    entity: z.literal("invoice"),
    organisationId: z.string().uuid(),
    invoiceNumber: z.string().min(1).max(80),
    invoiceDate: z.string().date(),
    dueDate: z.string().date().nullable().optional(),
    netMinor: z.number().int().min(0),
    vatMinor: z.number().int().min(0),
    grossMinor: z.number().int().min(0),
    currency: z.string().min(3).max(3).default("GBP"),
    status: z.enum([
      "draft",
      "issued",
      "paid",
      "part_paid",
      "overdue",
      "void",
      "refunded",
      "credited",
    ]),
    paymentDate: z.string().date().nullable().optional(),
    purchaseOrderReference: z.string().max(120).nullable().optional(),
    externalProvider: z.string().max(80).nullable().optional(),
    externalInvoiceId: z.string().max(200).nullable().optional(),
    documentReference: z.string().max(500).nullable().optional(),
  }),
  z.object({
    entity: z.literal("payment_method"),
    organisationId: z.string().uuid(),
    methodType: z.enum([
      "card",
      "direct_debit",
      "bank_transfer",
      "purchase_order",
    ]),
    provider: z.string().max(80).nullable().optional(),
    providerCustomerId: z.string().max(200).nullable().optional(),
    providerPaymentMethodId: z.string().max(200).nullable().optional(),
    brand: z.string().max(40).nullable().optional(),
    lastFour: z.string().max(4).nullable().optional(),
    expMonth: z.number().int().min(1).max(12).nullable().optional(),
    expYear: z.number().int().min(2000).max(2100).nullable().optional(),
    billingName: z.string().max(200).nullable().optional(),
    isDefault: z.boolean().optional(),
    status: z.enum(["active", "inactive", "expired", "failed"]).optional(),
    cardNumber: z.unknown().optional(),
    cvv: z.unknown().optional(),
  }),
  z.object({
    entity: z.literal("purchase_order"),
    organisationId: z.string().uuid(),
    poNumber: z.string().min(1).max(80),
    description: z.string().max(500).nullable().optional(),
    approvedValueMinor: z.number().int().min(0),
    currency: z.string().min(3).max(3).default("GBP"),
    startsAt: z.string().date().nullable().optional(),
    expiresAt: z.string().date().nullable().optional(),
    amountInvoicedMinor: z.number().int().min(0).optional(),
    status: z
      .enum(["active", "expiring", "expired", "fully_used", "cancelled"])
      .optional(),
    documentReference: z.string().max(500).nullable().optional(),
  }),
  z.object({
    entity: z.literal("contract"),
    organisationId: z.string().uuid(),
    name: z.string().min(1).max(200),
    reference: z.string().max(120).nullable().optional(),
    startsAt: z.string().date().nullable().optional(),
    endsAt: z.string().date().nullable().optional(),
    noticePeriodDays: z.number().int().min(0).nullable().optional(),
    renewalType: z.enum(["manual", "auto", "fixed_term", "rolling"]).optional(),
    contractValueMinor: z.number().int().min(0).nullable().optional(),
    currency: z.string().min(3).max(3).default("GBP"),
    accountOwner: z.string().max(200).nullable().optional(),
    status: z
      .enum(["draft", "active", "renewal_due", "expired", "terminated"])
      .optional(),
    documentReference: z.string().max(500).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  }),
  z.object({
    entity: z.literal("trial"),
    organisationId: z.string().uuid(),
    trialStartsAt: z.string().date(),
    trialEndsAt: z.string().date(),
    durationDays: z.number().int().min(1).max(3650),
    conversionStatus: z.enum([
      "new",
      "engaging",
      "review_required",
      "conversion_discussion",
      "converted",
      "not_converted",
    ]),
    followUpAt: z.string().date().nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  }),
]);

export async function POST(request: Request) {
  const auth = await requirePlatformOwner();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return ownerValidationResponse("Invalid request body.");
  }

  const parsed = mutateSchema.safeParse(body);
  if (!parsed.success) {
    return ownerValidationResponse("Invalid commercial payload.");
  }

  const supabase = auth.context.supabase;
  const data = parsed.data;

  try {
    if (data.entity === "subscription") {
      const { data: row, error } = await supabase
        .from("organisation_subscriptions")
        .insert({
          organisation_id: data.organisationId,
          plan_code: data.planCode,
          seats: data.seats,
          billing_frequency: data.billingFrequency,
          status: data.status,
          currency: data.currency,
          monthly_value_minor: data.monthlyValueMinor ?? null,
          annual_value_minor: data.annualValueMinor ?? null,
          starts_at: data.startsAt ?? null,
          renewal_at: data.renewalAt ?? null,
          trial_ends_at: data.trialEndsAt ?? null,
          external_provider: data.externalProvider ?? null,
          external_customer_id: data.externalCustomerId ?? null,
          external_subscription_id: data.externalSubscriptionId ?? null,
        })
        .select("id")
        .single();

      if (error) throw error;

      await writePlatformAudit({
        supabase,
        actorUserId: auth.context.user.id,
        action: "subscription.changed",
        entityType: "organisation_subscription",
        entityId: row.id,
        organisationId: data.organisationId,
        metadata: { status: data.status, planCode: data.planCode },
      });

      return NextResponse.json({ ok: true, id: row.id });
    }

    if (data.entity === "invoice") {
      const { data: row, error } = await supabase
        .from("invoices")
        .insert({
          organisation_id: data.organisationId,
          invoice_number: data.invoiceNumber,
          invoice_date: data.invoiceDate,
          due_date: data.dueDate ?? null,
          net_minor: data.netMinor,
          vat_minor: data.vatMinor,
          gross_minor: data.grossMinor,
          currency: data.currency,
          status: data.status,
          payment_date: data.paymentDate ?? null,
          purchase_order_reference: data.purchaseOrderReference ?? null,
          external_provider: data.externalProvider ?? null,
          external_invoice_id: data.externalInvoiceId ?? null,
          document_reference: data.documentReference ?? null,
        })
        .select("id")
        .single();

      if (error) throw error;

      await writePlatformAudit({
        supabase,
        actorUserId: auth.context.user.id,
        action: "invoice.status_changed",
        entityType: "invoice",
        entityId: row.id,
        organisationId: data.organisationId,
        metadata: {
          status: data.status,
          invoiceNumber: data.invoiceNumber,
          hasDocument: Boolean(data.documentReference),
        },
      });

      return NextResponse.json({ ok: true, id: row.id });
    }

    if (data.entity === "payment_method") {
      const safe = assertSafePaymentMethodPayload(data);
      if (!safe.ok) return ownerValidationResponse(safe.error);

      const lastFour = sanitiseLastFour(data.lastFour);
      const masked = buildMaskedPaymentDescriptor({
        methodType: data.methodType,
        brand: data.brand,
        lastFour,
        billingName: data.billingName,
      });

      const { data: row, error } = await supabase
        .from("organisation_payment_methods")
        .insert({
          organisation_id: data.organisationId,
          method_type: data.methodType,
          provider: data.provider ?? null,
          provider_customer_id: data.providerCustomerId ?? null,
          provider_payment_method_id: data.providerPaymentMethodId ?? null,
          brand: data.brand ?? null,
          last_four: lastFour,
          exp_month: data.expMonth ?? null,
          exp_year: data.expYear ?? null,
          billing_name: data.billingName ?? null,
          masked_descriptor: masked,
          is_default: data.isDefault ?? false,
          status: data.status ?? "active",
        })
        .select("id")
        .single();

      if (error) throw error;

      await writePlatformAudit({
        supabase,
        actorUserId: auth.context.user.id,
        action: "payment_method.created",
        entityType: "organisation_payment_method",
        entityId: row.id,
        organisationId: data.organisationId,
        metadata: { methodType: data.methodType, maskedDescriptor: masked },
      });

      return NextResponse.json({ ok: true, id: row.id });
    }

    if (data.entity === "purchase_order") {
      const amountInvoiced = data.amountInvoicedMinor ?? 0;
      const status = derivePurchaseOrderStatus({
        status: data.status ?? "active",
        approvedValueMinor: data.approvedValueMinor,
        amountInvoicedMinor: amountInvoiced,
        expiresAt: data.expiresAt ?? null,
      });

      const { data: row, error } = await supabase
        .from("purchase_orders")
        .insert({
          organisation_id: data.organisationId,
          po_number: data.poNumber,
          description: data.description ?? null,
          approved_value_minor: data.approvedValueMinor,
          currency: data.currency,
          starts_at: data.startsAt ?? null,
          expires_at: data.expiresAt ?? null,
          amount_invoiced_minor: amountInvoiced,
          status,
          document_reference: data.documentReference ?? null,
        })
        .select("id")
        .single();

      if (error) throw error;

      await writePlatformAudit({
        supabase,
        actorUserId: auth.context.user.id,
        action: "purchase_order.created",
        entityType: "purchase_order",
        entityId: row.id,
        organisationId: data.organisationId,
        metadata: { poNumber: data.poNumber, status },
      });

      return NextResponse.json({ ok: true, id: row.id });
    }

    if (data.entity === "contract") {
      const { data: row, error } = await supabase
        .from("organisation_contracts")
        .insert({
          organisation_id: data.organisationId,
          name: data.name,
          reference: data.reference ?? null,
          starts_at: data.startsAt ?? null,
          ends_at: data.endsAt ?? null,
          notice_period_days: data.noticePeriodDays ?? null,
          renewal_type: data.renewalType ?? "manual",
          contract_value_minor: data.contractValueMinor ?? null,
          currency: data.currency,
          account_owner: data.accountOwner ?? null,
          status: data.status ?? "draft",
          document_reference: data.documentReference ?? null,
          notes: data.notes ?? null,
        })
        .select("id")
        .single();

      if (error) throw error;

      await writePlatformAudit({
        supabase,
        actorUserId: auth.context.user.id,
        action: "contract.updated",
        entityType: "organisation_contract",
        entityId: row.id,
        organisationId: data.organisationId,
        metadata: { status: data.status ?? "draft", name: data.name },
      });

      return NextResponse.json({ ok: true, id: row.id });
    }

    if (data.entity === "trial") {
      const { data: row, error } = await supabase
        .from("organisation_trials")
        .upsert(
          {
            organisation_id: data.organisationId,
            trial_starts_at: data.trialStartsAt,
            trial_ends_at: data.trialEndsAt,
            duration_days: data.durationDays,
            conversion_status: data.conversionStatus,
            follow_up_at: data.followUpAt ?? null,
            notes: data.notes ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "organisation_id" }
        )
        .select("id")
        .single();

      if (error) throw error;

      await writePlatformAudit({
        supabase,
        actorUserId: auth.context.user.id,
        action: "trial.updated",
        entityType: "organisation_trial",
        entityId: row.id,
        organisationId: data.organisationId,
        metadata: { conversionStatus: data.conversionStatus },
      });

      return NextResponse.json({ ok: true, id: row.id });
    }

    return ownerValidationResponse("Unsupported entity.");
  } catch (error) {
    console.error("Owner commercial mutate failed:", error);
    return NextResponse.json(
      { error: "Unable to save commercial record." },
      { status: 500 }
    );
  }
}
