import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { calculateCustomerHealth } from "@/lib/owner/customer-health";
import { sanitiseAuditMetadata } from "@/lib/owner/audit";
import {
  assertSafePaymentMethodPayload,
  buildMaskedPaymentDescriptor,
  sanitiseLastFour,
} from "@/lib/owner/payment-methods";
import {
  derivePurchaseOrderStatus,
  purchaseOrderWarnings,
  remainingPoBalance,
} from "@/lib/owner/purchase-orders";
import { assertOwnerPayloadIsSafe } from "@/lib/owner/privacy";
import { formatMoneyMinor, monthlyFromSubscription, sumNullable } from "@/lib/owner/money";

const root = process.cwd();

function read(pathFromRoot: string): string {
  return readFileSync(join(root, pathFromRoot), "utf8");
}

describe("owner console foundation", () => {
  it("ships owner console migration with platform_owner and commercial tables", () => {
    const path = "supabase/migrations/20260808120000_owner_console.sql";
    expect(existsSync(join(root, path))).toBe(true);
    const sql = read(path);
    expect(sql).toContain("platform_owners");
    expect(sql).toContain("is_platform_owner");
    expect(sql).toContain("organisation_subscriptions");
    expect(sql).toContain("organisation_payment_methods");
    expect(sql).toContain("invoices");
    expect(sql).toContain("purchase_orders");
    expect(sql).toContain("organisation_contracts");
    expect(sql).toContain("organisation_trials");
    expect(sql).toContain("support_cases");
    expect(sql).toContain("platform_audit_events");
    expect(sql).toContain("platform_settings");
    expect(sql).toContain("owner_organisation_usage_counts");
    expect(sql).toContain("owner_platform_usage_totals");
  });

  it("excludes self-development from Owner People/team-member counts, not seat counts", () => {
    const path =
      "supabase/migrations/20260820120000_owner_people_counts_exclude_self_development.sql";
    expect(existsSync(join(root, path))).toBe(true);
    const sql = read(path);
    expect(sql).toContain("team_members");
    expect(sql).toContain("total_team_members");
    expect(sql).toContain("not public.client_is_self_development(c.id)");
    expect(sql).not.toContain("seats_purchased");
    expect(sql).not.toContain("practitioner_seats");
  });

  it("does not grant platform owners direct select on confidential coaching content tables", () => {
    const sql = read("supabase/migrations/20260808120000_owner_console.sql");
    expect(sql).toMatch(/IMPORTANT: intentionally NO platform_owner policies/i);
    expect(sql).not.toMatch(
      /create policy .*platform owner.* on public\.sessions/i
    );
    expect(sql).not.toMatch(
      /create policy .*platform owner.* on public\.development_updates/i
    );
    expect(sql).not.toMatch(
      /create policy .*platform owner.* on public\.client_items/i
    );
  });

  it("keeps usage RPCs count-only", () => {
    const sql = read("supabase/migrations/20260808120000_owner_console.sql");
    expect(sql).toContain("conversations_completed_30d");
    expect(sql).not.toMatch(/select\s+s\.(notes|summary|ai_summary)/i);
    expect(sql).toContain("Never returns conversation or note content");
  });

  it("exposes owner routes under /owner", () => {
    for (const path of [
      "app/owner/page.tsx",
      "app/owner/organisations/page.tsx",
      "app/owner/organisations/new/page.tsx",
      "app/owner/organisations/[id]/page.tsx",
      "app/owner/users/page.tsx",
      "app/owner/commercial/page.tsx",
      "app/owner/support/page.tsx",
      "app/owner/health/page.tsx",
      "app/owner/audit/page.tsx",
      "app/owner/settings/page.tsx",
      "app/owner/layout.tsx",
    ]) {
      expect(existsSync(join(root, path))).toBe(true);
    }
  });

  it("authorises owner APIs with requirePlatformOwner", () => {
    const routes = [
      "app/api/owner/overview/route.ts",
      "app/api/owner/organisations/route.ts",
      "app/api/owner/users/route.ts",
      "app/api/owner/commercial/route.ts",
      "app/api/owner/support/route.ts",
      "app/api/owner/health/route.ts",
      "app/api/owner/audit/route.ts",
      "app/api/owner/settings/route.ts",
      "app/api/owner/organisations/[id]/deletion-preflight/route.ts",
      "app/api/owner/organisations/[id]/deletion-initiation/route.ts",
      "app/api/owner/organisations/[id]/commercial-retention/route.ts",
      "app/api/owner/organisations/[id]/retain-minimise/route.ts",
      "app/api/owner/organisations/[id]/tenant-purge/route.ts",
      "app/api/owner/organisations/[id]/final-verification/route.ts",
      "app/api/owner/organisations/[id]/audit-reminimise/route.ts",
    ];
    for (const path of routes) {
      const source = read(path);
      expect(source).toContain("requirePlatformOwner");
      if (
        !path.includes("deletion-") &&
        !path.includes("commercial-retention") &&
        !path.includes("retain-minimise") &&
        !path.includes("tenant-purge") &&
        !path.includes("final-verification") &&
        !path.includes("audit-reminimise")
      ) {
        expect(source).not.toContain("organisation_deletion");
      }
    }
  });

  it("owner layout denies non-owners server-side", () => {
    const layout = read("app/owner/layout.tsx");
    expect(layout).toContain("isPlatformOwner");
    expect(layout).toContain("Access denied");
    expect(layout).toContain("redirect");
  });

  it("Data lifecycle always renders retain_minimise instead of hiding the panel", () => {
    const page = read("app/owner/organisations/[id]/page.tsx");
    expect(page).toContain("Support and audit retain / minimise");
    expect(page).toContain(
      "retain_minimise is only available while the organisation is"
    );
    const start = page.indexOf("<RetainMinimisePanel");
    const end = page.indexOf("/>", start);
    const callSite = page.slice(start, end);
    expect(callSite).toContain("commercialRetention?.organisationStatus");
    expect(callSite).not.toContain("retainMinimise?.organisationStatus");
    const panel = page.slice(page.indexOf("function RetainMinimisePanel"));
    expect(panel).not.toContain("if (!frozen) return null");
    expect(panel).toContain("Loading retain_minimise status…");
    expect(panel).toContain("role=\"alert\"");
    expect(panel).toContain(
      "retain_minimise is not available for this run state."
    );
    expect(panel).toContain("Minimise retained support and audit records");
  });

  it("Data lifecycle gates permanent tenant-data erasure until every Slice 3 gate passes", () => {
    const page = read("app/owner/organisations/[id]/page.tsx");
    expect(page).toContain("Permanent tenant-data erasure");
    expect(page).toContain("Permanently erase tenant data");
    expect(page).not.toMatch(/Permanently delete/i);
    expect(page).not.toContain("Create deletion certificate");
    const panel = page.slice(page.indexOf("function TenantPurgePanel"));
    expect(panel).toContain("state?.purgeAvailable");
    expect(panel).toContain("I understand this permanently erases");
    expect(panel).toContain("Purge execution failed and requires review");
    expect(panel).toContain("Final deletion certificate is not created in this stage");
    expect(panel).not.toContain("if (!frozen) return null");
  });

  it("renders deletion lifecycle for a former organisation without restoring the row", () => {
    const page = read("app/owner/organisations/[id]/page.tsx");
    expect(page).toContain("formerOrganisationLifecycle");
    expect(page).toContain("organisationNameSnapshot");
    expect(page).toContain("FinalVerificationPanel");
    expect(page).toContain("Deletion certificate");
    expect(page).not.toContain("Issue certificate");
    expect(page).toContain(
      "controls are not available after those stages complete"
    );
    const detail = read("app/api/owner/organisations/[id]/route.ts");
    expect(detail).toContain("formerOrganisationLifecycle: true");
    expect(detail).toContain("organisation: null");
  });
});

describe("owner console privacy and authorisation contracts", () => {
  it("does not treat platform_owner as an organisation membership role", () => {
    const types = read("lib/organisations/types.ts");
    expect(types).not.toContain('"platform_owner"');
    const ownerTypes = read("lib/owner/types.ts");
    expect(ownerTypes).toContain("platform-level role");
  });

  it("owner pages do not render confidential coaching content fields", () => {
    for (const path of [
      "app/owner/page.tsx",
      "app/owner/organisations/page.tsx",
      "app/owner/organisations/[id]/page.tsx",
      "app/owner/users/page.tsx",
      "app/owner/commercial/page.tsx",
    ]) {
      const source = read(path);
      expect(source).not.toMatch(/privateNotes|private_notes|summaryText|transcript/i);
    }
  });

  it("owner APIs assert safe payloads and avoid content selectors", () => {
    const overview = read("app/api/owner/overview/route.ts");
    expect(overview).toContain("assertOwnerPayloadIsSafe");
    expect(overview).not.toContain("private_notes");
    expect(overview).not.toContain("summary_text");

    const orgDetail = read("app/api/owner/organisations/[id]/route.ts");
    expect(orgDetail).toContain("assertOwnerPayloadIsSafe");
    expect(orgDetail).toContain("confidentialityNote");
  });

  it("rejects unsafe owner payload keys", () => {
    expect(() =>
      assertOwnerPayloadIsSafe({ privateNotes: "secret reflection" })
    ).toThrow(/privateNotes/i);
    expect(() =>
      assertOwnerPayloadIsSafe({ conversationsCompleted: 17 })
    ).not.toThrow();
  });

  it("sanitises audit metadata and strips confidential keys", () => {
    const clean = sanitiseAuditMetadata({
      status: "suspended",
      private_notes: "should not appear",
      summaryText: "should not appear",
      password: "x",
    });
    expect(clean.status).toBe("suspended");
    expect(clean.private_notes).toBeUndefined();
    expect(clean.summaryText).toBeUndefined();
    expect(clean.password).toBeUndefined();
  });
});

describe("customer health", () => {
  it("marks low activation and overdue invoices as needs attention with reasons", () => {
    const health = calculateCustomerHealth({
      accountStatus: "trial",
      managersInvited: 12,
      managersActivated: 2,
      activeUsers30d: 0,
      conversationsCompleted30d: 0,
      lastActivityAt: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString(),
      renewalOrTrialDate: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10),
      outstandingInvoiceCount: 0,
      overdueInvoiceCount: 1,
      now: new Date(),
    });

    expect(health.level).toBe("needs_attention");
    expect(health.label).toBe("Needs Attention");
    expect(health.reasons.some(reason => /managers have activated/i.test(reason))).toBe(
      true
    );
    expect(health.reasons.some(reason => /overdue invoice/i.test(reason))).toBe(true);
  });

  it("can report healthy when signals are stable", () => {
    const health = calculateCustomerHealth({
      accountStatus: "active",
      managersInvited: 10,
      managersActivated: 9,
      activeUsers30d: 8,
      conversationsCompleted30d: 12,
      lastActivityAt: new Date().toISOString(),
      renewalOrTrialDate: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10),
      outstandingInvoiceCount: 0,
      overdueInvoiceCount: 0,
    });
    expect(health.level).toBe("healthy");
  });
});

describe("commercial helpers", () => {
  it("masks payment methods and rejects full card details", () => {
    expect(
      buildMaskedPaymentDescriptor({
        methodType: "card",
        brand: "Visa",
        lastFour: "4242",
      })
    ).toBe("Visa •••• 4242");
    expect(
      buildMaskedPaymentDescriptor({ methodType: "bank_transfer" })
    ).toBe("Bank transfer / invoice account");
    expect(sanitiseLastFour("****4242")).toBe("4242");
    expect(
      assertSafePaymentMethodPayload({ cardNumber: "4242424242424242" }).ok
    ).toBe(false);
    expect(assertSafePaymentMethodPayload({ lastFour: "4242" }).ok).toBe(true);
  });

  it("calculates purchase order balances, statuses and warnings", () => {
    expect(remainingPoBalance(10000, 2500)).toBe(7500);
    expect(
      derivePurchaseOrderStatus({
        status: "active",
        approvedValueMinor: 10000,
        amountInvoicedMinor: 10000,
        expiresAt: null,
      })
    ).toBe("fully_used");

    const warnings = purchaseOrderWarnings({
      status: "active",
      approvedValueMinor: 10000,
      amountInvoicedMinor: 9500,
      expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10),
      invoiceRequiresPo: true,
      invoiceHasPoReference: false,
    });
    expect(warnings).toContain("PO expires within 30 days");
    expect(warnings).toContain("PO value nearly exhausted");
    expect(warnings).toContain("Invoice has no required PO");
  });

  it("formats money and aggregates only real values", () => {
    expect(formatMoneyMinor(240000, "GBP")).toMatch(/2,400\.00/);
    expect(formatMoneyMinor(null)).toBe("Not available");
    expect(
      monthlyFromSubscription({
        billingFrequency: "annual",
        monthlyValueMinor: null,
        annualValueMinor: 120000,
      })
    ).toBe(10000);
    expect(sumNullable([null, null])).toBeNull();
    expect(sumNullable([100, null, 50])).toBe(150);
  });
});

describe("owner console UI contracts", () => {
  it("uses denser owner navigation labels", () => {
    const nav = read("components/owner/owner-navigation.tsx");
    expect(nav).toContain("Overview");
    expect(nav).toContain("Organisations");
    expect(nav).toContain("Users");
    expect(nav).toContain("Commercial");
    expect(nav).toContain("Support");
    expect(nav).toContain("Platform Health");
    expect(nav).toContain("Audit");
    expect(nav).toContain("Settings");
  });

  it("provides empty states and responsive stacked records", () => {
    const css = read("app/owner-console.css");
    expect(css).toContain(".owner-empty");
    expect(css).toContain(".owner-stack");
    expect(css).toContain("@media (max-width: 820px)");
    expect(css).toContain("min-height: 44px");

    const orgs = read("app/owner/organisations/page.tsx");
    expect(orgs).toContain("OwnerEmpty");
    expect(orgs).toContain("owner-stack");
  });

  it("platform health does not fabricate green operational status", () => {
    const health = read("app/api/owner/health/route.ts");
    expect(health).toContain("Monitoring not configured");
    expect(health).not.toMatch(/uptime:\s*99/);
    const page = read("app/owner/health/page.tsx");
    expect(page).toContain("Monitoring not configured");
  });

  it("settings route blocks secret credentials", () => {
    const settings = read("app/api/owner/settings/route.ts");
    expect(settings).toContain("SECRET_KEY_PATTERN");
    expect(settings).toContain("Secret credentials cannot be stored");
  });
});

describe("existing organisation licence migration remains non-billing", () => {
  it("keeps the original licence migration free of stripe/invoice automation", () => {
    const sql = read("supabase/migrations/20260802150000_organisation_licence.sql");
    expect(sql.toLowerCase()).not.toMatch(/\bstripe\b/);
    expect(sql.toLowerCase()).not.toMatch(/\binvoice\b/);
    expect(sql).not.toMatch(/create table.*subscription/i);
  });
});
