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

  it("exposes only the locked customer licence tiers in Owner settings", () => {
    const page = read("app/owner/organisations/[id]/page.tsx");

    expect(page).toContain("Licence tier");
    expect(page).toContain("CUSTOMER_LICENCE_PLAN_NAMES.map");
    expect(page).toContain("managerCapacityForPlan(planName)");
    expect(page).toContain("setPendingLicencePlan(planName)");
    expect(page).toContain(
      "updateOrganisation({ licencePlanName: planName })"
    );
    expect(page).toContain("Change licence tier");
    expect(page).toContain(
      "Changing tier keeps the same organisation, Managers and"
    );
  });

  it("does not automatically remove or deactivate Managers during a capacity change", () => {
    const route = read("app/api/owner/organisations/[id]/route.ts");

    expect(route).not.toContain('.delete()');
    expect(route).toContain(
      "Deactivate Managers first or choose a licence tier with sufficient capacity."
    );
  });
});
