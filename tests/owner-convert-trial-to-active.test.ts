import { describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CONVERT_TRIAL_CONFIRMATION,
  OWNER_CONVERT_TRIAL_RPC,
  convertTrialOrganisationToActive,
  ownerOrganisationSettingsActions,
} from "@/lib/owner/convert-trial-to-active";

const root = join(__dirname, "..");
const MIGRATION =
  "supabase/migrations/20260819140000_owner_convert_trial_to_active.sql";

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

describe("ownerOrganisationSettingsActions", () => {
  it("trial shows Convert + Suspend, not Reactivate", () => {
    expect(ownerOrganisationSettingsActions("trial")).toEqual({
      showConvertTrial: true,
      showSuspend: true,
      showReactivate: false,
    });
  });

  it("active shows Suspend only, not Reactivate", () => {
    expect(ownerOrganisationSettingsActions("active")).toEqual({
      showConvertTrial: false,
      showSuspend: true,
      showReactivate: false,
    });
  });

  it("suspended shows Reactivate only", () => {
    expect(ownerOrganisationSettingsActions("suspended")).toEqual({
      showConvertTrial: false,
      showSuspend: false,
      showReactivate: true,
    });
  });
});

describe("atomic owner_convert_trial_organisation_to_active RPC", () => {
  it("ships migration with transactional conversion semantics", () => {
    expect(existsSync(join(root, MIGRATION))).toBe(true);
    const sql = read(MIGRATION);
    expect(sql).toContain(
      "create or replace function public.owner_convert_trial_organisation_to_active"
    );
    expect(sql).toContain("security definer");
    expect(sql).toContain("is_platform_owner");
    expect(sql).toContain("for update");
    expect(sql).toContain("licence_status = 'active'");
    expect(sql).toContain("licence_ends_at = null");
    expect(sql).toContain("conversion_status = 'converted'");
    expect(sql).toContain("organisation.trial_converted_to_active");
    expect(sql).toContain("platform_audit_events");
    expect(sql).toContain("alreadyConverted");
    expect(sql).not.toMatch(/delete\s+from\s+public\.organisation_trials/i);
    // Must not reassign operational status / seats / plan columns
    expect(sql).not.toMatch(/\bpractitioner_seats_purchased\s*=/);
    expect(sql).not.toMatch(/\blicence_plan_name\s*=/);
    expect(sql).not.toMatch(
      /update\s+public\.organisations[\s\S]{0,400}\bstatus\s*=\s*'/i
    );
    expect(sql).toContain("grant execute");
    expect(sql).toContain("to authenticated");
    expect(sql).toContain("revoke all");
    expect(sql).toContain("from anon");
  });

  it("keeps org update and trial update inside one function body (atomic)", () => {
    const sql = read(MIGRATION);
    const updateOrg = sql.indexOf("update public.organisations");
    const updateTrial = sql.indexOf("update public.organisation_trials");
    const insertAudit = sql.indexOf("insert into public.platform_audit_events");
    expect(updateOrg).toBeGreaterThan(-1);
    expect(updateTrial).toBeGreaterThan(updateOrg);
    expect(insertAudit).toBeGreaterThan(updateTrial);
    // No intermediate COMMIT / separate functions
    expect(sql).not.toMatch(/\bcommit\b/i);
  });

  it("rejects non-trial after idempotent already-converted check", () => {
    const sql = read(MIGRATION);
    expect(sql).toContain("'NOT_TRIAL'");
    expect(sql).toContain("licence_status is distinct from 'trial'");
  });
});

describe("convertTrialOrganisationToActive client", () => {
  const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

  it("successful atomic conversion maps RPC payload", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        ok: true,
        alreadyConverted: false,
        organisationId: ORG_ID,
        licenceStatus: "active",
        licenceEndsAt: null,
        licencePlanName: "Pilot",
        practitionerSeatsPurchased: 5,
        organisationStatus: "active",
      },
      error: null,
    });

    const result = await convertTrialOrganisationToActive({
      supabase: { rpc } as never,
      organisationId: ORG_ID,
      actorUserId: "owner-user",
    });

    expect(rpc).toHaveBeenCalledWith(OWNER_CONVERT_TRIAL_RPC, {
      p_organisation_id: ORG_ID,
    });
    expect(result).toEqual({
      ok: true,
      organisationId: ORG_ID,
      alreadyConverted: false,
      licenceStatus: "active",
      licenceEndsAt: null,
    });
  });

  it("repeat request maps alreadyConverted without failure", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        ok: true,
        alreadyConverted: true,
        organisationId: ORG_ID,
        licenceStatus: "active",
        licenceEndsAt: null,
      },
      error: null,
    });

    const result = await convertTrialOrganisationToActive({
      supabase: { rpc } as never,
      organisationId: ORG_ID,
      actorUserId: "owner-user",
    });

    expect(result).toEqual({
      ok: true,
      organisationId: ORG_ID,
      alreadyConverted: true,
      licenceStatus: "active",
      licenceEndsAt: null,
    });
  });

  it("rejects non-trial organisations", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ok: false, code: "NOT_TRIAL" },
      error: null,
    });

    const result = await convertTrialOrganisationToActive({
      supabase: { rpc } as never,
      organisationId: ORG_ID,
      actorUserId: "owner-user",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("NOT_TRIAL");
      expect(result.error).toMatch(/only trial organisations/i);
    }
  });

  it("maps permission denial from RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ok: false, code: "PERMISSION_DENIED" },
      error: null,
    });

    const result = await convertTrialOrganisationToActive({
      supabase: { rpc } as never,
      organisationId: ORG_ID,
      actorUserId: "not-owner",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("PERMISSION_DENIED");
  });

  it("does not use multi-step client table updates (no partial state)", () => {
    const source = read("lib/owner/convert-trial-to-active.ts");
    expect(source).toContain("OWNER_CONVERT_TRIAL_RPC");
    expect(source).toContain(".rpc(");
    expect(source).not.toMatch(/\.from\("organisations"\)\s*\.update/);
    expect(source).not.toMatch(/\.from\("organisation_trials"\)\s*\.update/);
    expect(source).not.toContain("writePlatformAudit");
  });
});

describe("Owner Console convert trial wiring", () => {
  it("Settings UI distinguishes trial / active / suspended actions", () => {
    const page = read("app/owner/organisations/[id]/page.tsx");
    expect(page).toContain("Convert trial to active");
    expect(page).toContain("CONVERT_TRIAL_CONFIRMATION");
    expect(page).toContain('action: "convert_trial_to_active"');
    expect(page).toContain("ownerOrganisationSettingsActions");
  });

  it("PATCH route requires platform owner and convert action", () => {
    const route = read("app/api/owner/organisations/[id]/route.ts");
    expect(route).toContain("requirePlatformOwner");
    expect(route).toContain("convert_trial_to_active");
    expect(route).toContain("convertTrialOrganisationToActive");
  });

  it("conversion confirmation explains data preservation", () => {
    expect(CONVERT_TRIAL_CONFIRMATION).toMatch(/permanent active organisation/i);
    expect(CONVERT_TRIAL_CONFIRMATION).toMatch(/preserved/i);
    expect(CONVERT_TRIAL_CONFIRMATION).toMatch(/trial end date will be removed/i);
  });
});
