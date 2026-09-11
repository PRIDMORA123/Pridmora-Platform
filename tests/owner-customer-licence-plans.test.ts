import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CUSTOMER_LICENCE_PLAN_NAMES,
  isCustomerLicencePlanName,
  managerCapacityForPlan,
} from "@/lib/owner/customer-licence-plans";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

describe("Owner customer licence plans", () => {
  it("defines the locked commercial Manager capacities", () => {
    expect(CUSTOMER_LICENCE_PLAN_NAMES).toEqual([
      "Pilot",
      "Core",
      "Growth",
      "Scale",
    ]);

    expect(managerCapacityForPlan("Pilot")).toBe(15);
    expect(managerCapacityForPlan("Core")).toBe(25);
    expect(managerCapacityForPlan("Growth")).toBe(50);
    expect(managerCapacityForPlan("Scale")).toBe(100);
  });

  it("accepts only recognised customer licence plans", () => {
    expect(isCustomerLicencePlanName("Pilot")).toBe(true);
    expect(isCustomerLicencePlanName("Core")).toBe(true);
    expect(isCustomerLicencePlanName("Growth")).toBe(true);
    expect(isCustomerLicencePlanName("Scale")).toBe(true);

    expect(isCustomerLicencePlanName("Enterprise")).toBe(false);
    expect(isCustomerLicencePlanName("standard_monthly")).toBe(false);
    expect(isCustomerLicencePlanName("Anything")).toBe(false);
  });

  it("protects licence capacity changes in the Owner API", () => {
    const route = read("app/api/owner/organisations/[id]/route.ts");

    expect(route).toContain("loadPractitionerSeatUsage");
    expect(route).toContain("managerCapacityForPlan");
    expect(route).toContain("isCustomerLicencePlanName");
    expect(route).toContain("LICENCE_CAPACITY_BELOW_USAGE");
    expect(route).toContain(
      "requiredCapacity < seatUsage.summary.seatsInUse"
    );
    expect(route).toContain(
      "updates.practitioner_seats_purchased = requiredCapacity"
    );
  });

  it("does not allow the Owner API to write arbitrary requested seat capacity", () => {
    const route = read("app/api/owner/organisations/[id]/route.ts");

    expect(route).not.toContain(
      "updates.practitioner_seats_purchased = data.seatsPurchased"
    );

    expect(route).toContain(
      "data.seatsPurchased !== requiredCapacity"
    );
  });

  it("exposes only the locked customer licence capacities in Owner settings", () => {
    const page = read("app/owner/organisations/[id]/page.tsx");

    expect(page).toContain("Licence capacity");
    expect(page).toContain("CUSTOMER_LICENCE_PLAN_NAMES.map");
    expect(page).toContain("managerCapacityForPlan(planName)");
    expect(page).toContain("setPendingLicencePlan(planName)");
    expect(page).toContain(
      "updateOrganisation({ licencePlanName: planName })"
    );
    expect(page).toContain("Change licence tier");
    expect(page).toContain(
      "Changing capacity keeps the same organisation, Managers and"
    );
  });

  it("does not automatically remove or deactivate Managers during a capacity change", () => {
    const route = read("app/api/owner/organisations/[id]/route.ts");

    expect(route).not.toContain('.delete()');
    expect(route).toContain(
      "Deactivate Managers first or choose a licence tier with sufficient capacity."
    );
  });


  it("supports the locked Paid Pilot to annual licence workflow", () => {
    const route = read("app/api/owner/organisations/[id]/route.ts");
    const service = read("lib/owner/continue-annual-licence.ts");
    const page = read("app/owner/organisations/[id]/page.tsx");

    expect(route).toContain('"continue_annual_licence"');
    expect(route).toContain("annualPlanName");
    expect(route).toContain("annualStartsAt");
    expect(route).toContain("annualRenewalAt");
    expect(route).toContain("continueOrganisationAnnualLicence");

    expect(service).toContain("owner_continue_annual_licence");
    expect(service).toContain("loadPractitionerSeatUsage");
    expect(service).toContain("LICENCE_CAPACITY_BELOW_USAGE");
    expect(service).toContain("managerCapacityForPlan");

    expect(page).toContain("Annual licence");
    expect(page).toContain("ANNUAL_LICENCE_PLAN_NAMES");
    expect(page).toContain("Review annual licence");
    expect(page).toContain('action: "continue_annual_licence"');
    expect(page).toContain(
      "development evidence and Development Intelligence"
    );
  });

  it("locks annual plans to Core, Growth and Scale with exact Manager capacity", () => {
    const migration = read(
      "supabase/migrations/20260911143000_owner_continue_annual_licence.sql"
    );

    expect(migration).toContain(
      "p_plan_name not in ('Core', 'Growth', 'Scale')"
    );
    expect(migration).toContain("when 'Core' then 25");
    expect(migration).toContain("when 'Growth' then 50");
    expect(migration).toContain("when 'Scale' then 100");
    expect(migration).toContain("'INVALID_PLAN_CAPACITY'");
  });

  it("enforces one annual term and prevents future-start scheduling", () => {
    const migration = read(
      "supabase/migrations/20260911143000_owner_continue_annual_licence.sql"
    );

    expect(migration).toContain("p_starts_at > current_date");
    expect(migration).toContain(
      "p_renewal_at <> (p_starts_at + interval '1 year')::date"
    );
    expect(migration).toContain("'INVALID_RENEWAL_DATE'");
  });

  it("makes an exact annual continuation retry idempotent", () => {
    const migration = read(
      "supabase/migrations/20260911143000_owner_continue_annual_licence.sql"
    );

    expect(migration).toContain("v_existing_subscription_id");
    expect(migration).toContain(
      "s.metadata ->> 'commercialModel' = 'customer_annual_licence'"
    );
    expect(migration).toContain("'alreadyApplied', true");
    expect(migration).toContain(
      "v_org.practitioner_seats_purchased = v_required_seats"
    );
  });

  it("continues the same organisation and preserves previous commercial terms as history", () => {
    const migration = read(
      "supabase/migrations/20260911143000_owner_continue_annual_licence.sql"
    );

    expect(migration).toContain("update public.organisations");
    expect(migration).toContain("where id = p_organisation_id");
    expect(migration).toContain("update public.organisation_subscriptions");
    expect(migration).toContain(
      "'supersededByAnnualContinuation', true"
    );
    expect(migration).toContain(
      "insert into public.organisation_subscriptions"
    );
    expect(migration).toContain(
      "'organisation.annual_licence_continued'"
    );
    expect(migration).not.toContain("delete from public.organisations");
  });

  it("counts renewal reporting from active subscriptions only", () => {
    const repository = read("lib/owner/repository.ts");

    expect(repository).toContain(
      "renewals30: activeSubscriptions.filter"
    );
    expect(repository).toContain(
      "renewals60: activeSubscriptions.filter"
    );
    expect(repository).toContain(
      "renewals90: activeSubscriptions.filter"
    );
  });

});
