import { NextResponse } from "next/server";
import { requirePlatformOwner } from "@/lib/owner/auth";
import { assertOwnerPayloadIsSafe } from "@/lib/owner/privacy";
import {
  listContracts,
  listInvoices,
  listOwnerOrganisations,
  listPaymentMethods,
  listPurchaseOrders,
  listSubscriptions,
  listTrials,
  loadCommercialOverview,
  loadOrganisationUsageCounts,
} from "@/lib/owner/repository";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requirePlatformOwner();
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const tab = searchParams.get("tab") ?? "overview";
    const organisationId = searchParams.get("organisationId") ?? undefined;
    const status = searchParams.get("status") ?? undefined;
    const overdueOnly = searchParams.get("overdue") === "1";

    if (tab === "overview") {
      const overview = await loadCommercialOverview(auth.context.supabase);
      const payload = { tab, overview };
      assertOwnerPayloadIsSafe(payload);
      return NextResponse.json(payload);
    }

    if (tab === "subscriptions") {
      const [subscriptions, organisations] = await Promise.all([
        listSubscriptions(auth.context.supabase),
        listOwnerOrganisations(auth.context.supabase),
      ]);
      const nameById = new Map(organisations.map(o => [o.id, o.name]));
      const payload = {
        tab,
        subscriptions: subscriptions.map(sub => ({
          ...sub,
          organisationName: nameById.get(sub.organisationId) ?? "Organisation",
        })),
      };
      assertOwnerPayloadIsSafe(payload);
      return NextResponse.json(payload);
    }

    if (tab === "invoices") {
      const [invoices, organisations] = await Promise.all([
        listInvoices(auth.context.supabase, {
          organisationId,
          status,
          overdueOnly,
        }),
        listOwnerOrganisations(auth.context.supabase),
      ]);
      const nameById = new Map(organisations.map(o => [o.id, o.name]));
      const payload = {
        tab,
        invoices: invoices.map(inv => ({
          ...inv,
          organisationName: nameById.get(inv.organisationId) ?? "Organisation",
          hasDocument: Boolean(inv.documentReference),
        })),
      };
      assertOwnerPayloadIsSafe(payload);
      return NextResponse.json(payload);
    }

    if (tab === "payment_methods") {
      const [methods, organisations] = await Promise.all([
        listPaymentMethods(auth.context.supabase, organisationId),
        listOwnerOrganisations(auth.context.supabase),
      ]);
      const nameById = new Map(organisations.map(o => [o.id, o.name]));
      const payload = {
        tab,
        paymentMethods: methods.map(method => ({
          ...method,
          organisationName: nameById.get(method.organisationId) ?? "Organisation",
        })),
        integrationBoundary:
          "No payment provider is connected in this repository. Store provider metadata only when a provider is integrated. Never store full card numbers or CVV.",
      };
      assertOwnerPayloadIsSafe(payload);
      return NextResponse.json(payload);
    }

    if (tab === "purchase_orders") {
      const [purchaseOrders, organisations] = await Promise.all([
        listPurchaseOrders(auth.context.supabase, organisationId),
        listOwnerOrganisations(auth.context.supabase),
      ]);
      const nameById = new Map(organisations.map(o => [o.id, o.name]));
      const payload = {
        tab,
        purchaseOrders: purchaseOrders.map(po => ({
          ...po,
          organisationName: nameById.get(po.organisationId) ?? "Organisation",
        })),
      };
      assertOwnerPayloadIsSafe(payload);
      return NextResponse.json(payload);
    }

    if (tab === "contracts") {
      const [contracts, organisations] = await Promise.all([
        listContracts(auth.context.supabase, organisationId),
        listOwnerOrganisations(auth.context.supabase),
      ]);
      const nameById = new Map(organisations.map(o => [o.id, o.name]));
      const payload = {
        tab,
        contracts: contracts.map(contract => ({
          ...contract,
          organisationName:
            nameById.get(contract.organisationId) ?? "Organisation",
        })),
      };
      assertOwnerPayloadIsSafe(payload);
      return NextResponse.json(payload);
    }

    if (tab === "trials") {
      const [trials, organisations] = await Promise.all([
        listTrials(auth.context.supabase),
        listOwnerOrganisations(auth.context.supabase),
      ]);
      const nameById = new Map(organisations.map(o => [o.id, o.name]));
      const enriched = await Promise.all(
        trials.map(async trial => {
          const usage = await loadOrganisationUsageCounts(
            auth.context.supabase,
            trial.organisationId
          );
          return {
            ...trial,
            organisationName:
              nameById.get(trial.organisationId) ?? "Organisation",
            managersInvited: usage.managersInvited,
            managersActivated: usage.managersActivated,
            teamMembers: usage.teamMembers,
            preparationsGenerated: usage.preparationsGeneratedTotal,
            conversationsCompleted: usage.conversationsCompletedTotal,
            lastActivityAt: usage.lastActivityAt,
          };
        })
      );
      const payload = { tab, trials: enriched };
      assertOwnerPayloadIsSafe(payload);
      return NextResponse.json(payload);
    }

    return NextResponse.json({ error: "Unknown commercial tab." }, { status: 422 });
  } catch (error) {
    console.error("Owner commercial failed:", error);
    return NextResponse.json(
      { error: "Unable to load commercial data." },
      { status: 500 }
    );
  }
}
