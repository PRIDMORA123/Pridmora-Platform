import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createCustomerOrganisationSchema,
  DEFAULT_CUSTOMER_ORG_SEATS,
  MAX_CUSTOMER_ORG_SEATS,
  MIN_CUSTOMER_ORG_SEATS,
} from "@/lib/owner/create-organisation-schema";
import {
  OWNER_CREATE_ORG_ERROR_CODES,
  ownerCreateOrgErrorMessage,
} from "@/lib/owner/create-organisation";

const root = process.cwd();

function read(pathFromRoot: string): string {
  return readFileSync(join(root, pathFromRoot), "utf8");
}

const MIGRATION =
  "supabase/migrations/20260809120000_owner_create_customer_organisation.sql";

describe("Slice 1 — owner create customer organisation", () => {
  it("ships create-organisation migration with columns, trial default 14, and RPC", () => {
    expect(existsSync(join(root, MIGRATION))).toBe(true);
    const sql = read(MIGRATION);
    expect(sql).toContain("add column if not exists country");
    expect(sql).toContain("add column if not exists website");
    expect(sql).toContain("add column if not exists owner_notes");
    expect(sql).toContain("duration_days");
    expect(sql).toMatch(/duration_days',\s*14/);
    expect(sql).toContain("owner_create_customer_organisation");
    expect(sql).toContain("is_platform_owner");
    expect(sql).toContain("licence_status");
    expect(sql).toContain("'trial'");
    expect(sql).toContain("organisation_trials");
    expect(sql).toContain("organisation_type");
    expect(sql).toContain("'business'");
    expect(sql).not.toContain("organisation_invitations");
    expect(sql).not.toContain("inviteUserByEmail");
  });

  it("exposes POST on owner organisations API with platform owner gate", () => {
    const route = read("app/api/owner/organisations/route.ts");
    expect(route).toContain("export async function POST");
    expect(route).toContain("requirePlatformOwner");
    expect(route).toContain("createCustomerOrganisation");
    expect(route).toContain("organisation.created");
    expect(route).toContain("writePlatformAudit");
    expect(route).not.toContain("first-invitation");
    expect(route).not.toContain("inviteUserByEmail");
  });

  it("ships New Organisation Owner Console UI without invitation flow", () => {
    expect(existsSync(join(root, "app/owner/organisations/new/page.tsx"))).toBe(
      true
    );
    const page = read("app/owner/organisations/new/page.tsx");
    expect(page).toContain("Create organisation");
    expect(page).toContain("owner-org-name");
    expect(page).toContain("owner-org-country");
    expect(page).toContain("owner-org-seats");
    expect(page).toContain("No invitation is sent");
    expect(page).not.toContain("Send Invitation");
    expect(page).not.toContain("Organisation Lead");

    const list = read("app/owner/organisations/page.tsx");
    expect(list).toContain('href="/owner/organisations/new"');
    expect(list).toContain("New organisation");
  });

  it("defaults seats to 5 and allows pilot override of at least 8", () => {
    expect(DEFAULT_CUSTOMER_ORG_SEATS).toBe(5);
    expect(MIN_CUSTOMER_ORG_SEATS).toBe(1);
    expect(MAX_CUSTOMER_ORG_SEATS).toBeGreaterThanOrEqual(8);

    const withDefault = createCustomerOrganisationSchema.safeParse({
      name: "Acme Pilot",
      country: "United Kingdom",
    });
    expect(withDefault.success).toBe(true);
    if (withDefault.success) {
      expect(withDefault.data.seats ?? null).toBeNull();
    }

    const withEight = createCustomerOrganisationSchema.safeParse({
      name: "Acme Pilot",
      country: "United Kingdom",
      seats: 8,
    });
    expect(withEight.success).toBe(true);
    if (withEight.success) {
      expect(withEight.data.seats).toBe(8);
    }
  });

  it("validates required name and country; optional website and notes", () => {
    expect(
      createCustomerOrganisationSchema.safeParse({
        name: "",
        country: "UK",
      }).success
    ).toBe(false);

    expect(
      createCustomerOrganisationSchema.safeParse({
        name: "Acme",
        country: "",
      }).success
    ).toBe(false);

    const ok = createCustomerOrganisationSchema.safeParse({
      name: "  Acme  ",
      country: "  UK  ",
      website: "",
      ownerNotes: "  internal  ",
      seats: 5,
    });
    expect(ok.success).toBe(true);
    if (ok.success) {
      expect(ok.data.name).toBe("Acme");
      expect(ok.data.country).toBe("UK");
      expect(ok.data.website).toBeNull();
      expect(ok.data.ownerNotes).toBe("internal");
    }
  });

  it("maps RPC error codes to owner-facing messages", () => {
    expect(OWNER_CREATE_ORG_ERROR_CODES).toContain("COUNTRY_REQUIRED");
    expect(ownerCreateOrgErrorMessage("INVALID_SEATS")).toMatch(/1 and 100/);
    expect(ownerCreateOrgErrorMessage("PERMISSION_DENIED")).toMatch(/denied/i);
  });

  it("does not change organisation membership permission matrix in this slice", () => {
    const permissions = read("lib/organisations/permissions.ts");
    expect(permissions).not.toContain("canInviteTeamMembers");
    expect(permissions).not.toContain("canManageOwnTeam");
  });
});
