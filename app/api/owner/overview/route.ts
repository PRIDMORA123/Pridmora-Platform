import { NextResponse } from "next/server";
import { requirePlatformOwner } from "@/lib/owner/auth";
import { assertOwnerPayloadIsSafe } from "@/lib/owner/privacy";
import {
  listInvoices,
  listOwnerOrganisations,
  listPlatformAuditEvents,
  listTrials,
  loadCommercialOverview,
  loadPlatformUsageTotals,
} from "@/lib/owner/repository";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requirePlatformOwner();
  if (!auth.ok) return auth.response;

  try {
    const [totals, organisations, commercial, invoices, trials, audit] =
      await Promise.all([
        loadPlatformUsageTotals(auth.context.supabase),
        listOwnerOrganisations(auth.context.supabase),
        loadCommercialOverview(auth.context.supabase),
        listInvoices(auth.context.supabase),
        listTrials(auth.context.supabase),
        listPlatformAuditEvents(auth.context.supabase, 8),
      ]);

    const now = new Date();
    const trialsEndingSoon = trials
      .filter(trial => {
        const end = new Date(`${trial.trialEndsAt}T00:00:00.000Z`);
        if (Number.isNaN(end.getTime())) return false;
        const days = (end.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
        return days >= 0 && days <= 14;
      })
      .slice(0, 8);

    const needsAttention = organisations
      .filter(org => org.health.level === "needs_attention")
      .slice(0, 8)
      .map(org => ({
        id: org.id,
        name: org.name,
        reasons: org.health.reasons,
        accountStatus: org.accountStatus,
        actionLabel:
          org.accountStatus === "trial" ? "Review conversion" : "Review account",
      }));

    const overdueInvoices = invoices.filter(inv => inv.status === "overdue");

    const payload = {
      totals,
      commercial: {
        mrrMinor: commercial.mrrMinor,
        arrMinor: commercial.arrMinor,
        outstandingInvoices: commercial.outstandingInvoices,
        overdueValueMinor: commercial.overdueValueMinor,
        valuesAvailable: commercial.valuesAvailable,
        trialsEndingSoon: trialsEndingSoon.length,
      },
      organisationHealth: organisations.slice(0, 8).map(org => ({
        id: org.id,
        name: org.name,
        health: org.health,
        accountStatus: org.accountStatus,
      })),
      needsAttention,
      trialsEndingSoon: trialsEndingSoon.map(trial => ({
        id: trial.id,
        organisationId: trial.organisationId,
        trialEndsAt: trial.trialEndsAt,
        conversionStatus: trial.conversionStatus,
      })),
      commercialAttention: overdueInvoices.slice(0, 8).map(inv => ({
        id: inv.id,
        organisationId: inv.organisationId,
        invoiceNumber: inv.invoiceNumber,
        grossMinor: inv.grossMinor,
        currency: inv.currency,
        dueDate: inv.dueDate,
        status: inv.status,
      })),
      recentActivity: audit.map(event => ({
        id: event.id,
        action: event.action,
        entityType: event.entityType,
        organisationId: event.organisationId,
        createdAt: event.createdAt,
      })),
      platformHealth: {
        application: "unknown",
        database: "unknown",
        authentication: "unknown",
        ai: "unknown",
        email: "unknown",
        storage: "unknown",
        payments: "unknown",
        note: "Monitoring not configured",
      },
    };

    assertOwnerPayloadIsSafe(payload);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Owner overview failed:", error);
    return NextResponse.json(
      { error: "Unable to load platform overview." },
      { status: 500 }
    );
  }
}
