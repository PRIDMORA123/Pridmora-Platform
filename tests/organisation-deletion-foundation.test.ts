import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  organisationAllowsMemberAccess,
  hasPermission,
} from "@/lib/organisations/permissions";
import { requireOrganisationPermission } from "@/lib/organisations/current-organisation";
import type { OrganisationRequestContext } from "@/lib/organisations/current-organisation";
import {
  ORGANISATION_DELETION_OPEN_RUN_STATUSES,
  ORGANISATION_DELETION_RUN_STATUSES,
  RETAINED_COMMERCIAL_FORBIDDEN_SNAPSHOT_KEYS,
  RETAINED_COMMERCIAL_RECORD_TYPES,
  UNDELETABLE_ORGANISATION_IDS_SETTING_KEY,
} from "@/lib/owner/organisation-deletion-foundation";

const root = process.cwd();
const DL03 =
  "supabase/migrations/20260827200000_organisation_deletion_foundation.sql";

function read(pathFromRoot: string): string {
  return readFileSync(join(root, pathFromRoot), "utf8");
}

function latestSqlContaining(pattern: RegExp): { file: string; sql: string } {
  const dir = join(root, "supabase/migrations");
  const files = readdirSync(dir)
    .filter(name => name.endsWith(".sql"))
    .sort();
  let latest: { file: string; sql: string } | null = null;
  for (const file of files) {
    const sql = readFileSync(join(dir, file), "utf8");
    if (pattern.test(sql)) {
      latest = { file, sql };
    }
  }
  if (!latest) {
    throw new Error(`No migration matching ${pattern}`);
  }
  return latest;
}

function fakeOrgContext(
  status: "active" | "archived" | "pending_closure"
): OrganisationRequestContext {
  return {
    supabase: {} as OrganisationRequestContext["supabase"],
    user: { id: "user-1" } as OrganisationRequestContext["user"],
    coachId: "user-1",
    organisation: {
      userId: "user-1",
      organisationId: "org-1",
      membershipId: "mem-1",
      role: "owner",
      professionalRole: "coach",
      organisation: {
        id: "org-1",
        name: "Acme",
        slug: "acme",
        organisationType: "business",
        status,
        createdBy: "user-1",
        defaultPreparationStyle: null,
        aiEnabled: true,
        dataRetentionPolicyLabel: "standard",
        brandingStatus: "none",
        logoUrl: null,
        licence: {
          planName: "Pilot",
          seatsPurchased: 1,
          status: "active",
          startsAt: null,
          endsAt: null,
        },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        archivedAt: null,
      },
      membership: {
        id: "mem-1",
        organisationId: "org-1",
        userId: "user-1",
        role: "owner",
        professionalRole: "coach",
        status: "active",
        invitedBy: null,
        invitedAt: null,
        joinedAt: "2026-01-01T00:00:00.000Z",
        deactivatedAt: null,
        lastActiveAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    },
  };
}

describe("DL-03 organisation deletion foundation schema", () => {
  it("ships the foundation migration without purge execution", () => {
    expect(existsSync(join(root, DL03))).toBe(true);
    const sql = read(DL03);
    expect(sql).toContain("create table if not exists public.organisation_deletion_runs");
    expect(sql).toContain(
      "create table if not exists public.organisation_deletion_certificates"
    );
    expect(sql).toContain(
      "create table if not exists public.retained_organisation_commercial_records"
    );
    expect(sql).toContain(UNDELETABLE_ORGANISATION_IDS_SETTING_KEY);
    expect(sql).toContain("'{\"ids\":[]}'::jsonb");
    expect(sql).not.toMatch(/create\s+or\s+replace\s+function\s+public\.\w*purge/i);
    expect(sql).not.toMatch(
      /create\s+or\s+replace\s+function\s+public\.\w*delete_organisation/i
    );
    expect(sql).not.toMatch(
      /execute_organisation_deletion/i
    );
    expect(sql).not.toContain("DELETE FROM organisations");
    expect(sql).not.toContain("delete from public.organisations");
  });

  it("keeps deletion run states recoverable without exposing later-stage executors", () => {
    const sql = read(DL03);
    for (const status of ORGANISATION_DELETION_RUN_STATUSES) {
      expect(sql).toContain(`'${status}'`);
    }
    expect(ORGANISATION_DELETION_OPEN_RUN_STATUSES).toContain("failed");
    expect(ORGANISATION_DELETION_OPEN_RUN_STATUSES).toContain("purging");
    expect(sql).toContain("organisation_deletion_runs_one_open_per_org_idx");
    expect(sql).toContain(
      "no RPC/API in this slice executes freeze, copy, purge"
    );
  });

  it("certificates survive organisation deletion and have no organisations FK", () => {
    const sql = read(DL03);
    const certBlock = sql.slice(
      sql.indexOf("create table if not exists public.organisation_deletion_certificates"),
      sql.indexOf("create table if not exists public.retained_organisation_commercial_records")
    );
    expect(certBlock).toContain("former_organisation_id uuid not null");
    expect(certBlock).not.toMatch(/references public\.organisations/i);
    expect(certBlock).not.toMatch(/on delete cascade/i);
    expect(sql).toContain("organisation_deletion_certificates are immutable");
    expect(sql).toContain("before update on public.organisation_deletion_certificates");
    expect(sql).toContain("before delete on public.organisation_deletion_certificates");
  });

  it("deletion runs SET NULL the live organisation FK and keep former_organisation_id without FK", () => {
    const sql = read(DL03);
    expect(sql).toMatch(
      /organisation_id uuid null references public\.organisations\(id\) on delete set null/
    );
    expect(sql).toContain("former_organisation_id uuid not null");
    expect(sql).toContain("former_organisation_id has no organisations FK");
  });

  it("retained commercial records survive org deletion and forbid coaching payload keys", () => {
    const sql = read(DL03);
    const retainedBlock = sql.slice(
      sql.indexOf(
        "create table if not exists public.retained_organisation_commercial_records"
      )
    );
    expect(retainedBlock).not.toMatch(/references public\.organisations/i);
    expect(retainedBlock).toContain("retained_organisation_commercial_no_coaching_payload");
    for (const key of RETAINED_COMMERCIAL_FORBIDDEN_SNAPSHOT_KEYS) {
      expect(retainedBlock).toContain(`'${key}'`);
    }
    for (const type of RETAINED_COMMERCIAL_RECORD_TYPES) {
      expect(retainedBlock).toContain(`'${type}'`);
    }
  });

  it("documents future migration_review deletion must use descendant identifiers", () => {
    const sql = read(DL03);
    expect(sql).toContain("organisation_migration_review");
    expect(sql).toContain("authoritative table_name + record_id");
    expect(sql).toContain("Do not delete by scanning details JSON/text");
    expect(sql).not.toMatch(
      /delete from public\.organisation_migration_review/i
    );
  });

  it("keeps personal organisations and sample installations outside this deletion path", () => {
    const sql = read(DL03);
    expect(sql).toContain(
      "Personal organisations and sample installations remain outside this deletion path"
    );
    expect(sql).not.toContain("cleanup_sample_organisation_installation");
    expect(sql).not.toContain("ensure_personal_organisation");
  });
});

describe("DL-03 RLS and grants", () => {
  it("grants authenticated select only to platform owners and no mutate policies", () => {
    const sql = read(DL03);
    expect(sql).toContain("Deletion runs select platform owner");
    expect(sql).toContain("Deletion certificates select platform owner");
    expect(sql).toContain("Retained commercial select platform owner");
    expect(sql).toContain("using (public.is_platform_owner(auth.uid()))");
    expect(sql).toContain(
      "Intentionally no INSERT/UPDATE/DELETE policies for authenticated"
    );
    expect(sql).toContain("grant select on table public.organisation_deletion_runs to authenticated");
    expect(sql).not.toMatch(
      /grant (insert|update|delete) on table public\.organisation_deletion_/i
    );
    expect(sql).not.toMatch(
      /grant (insert|update|delete) on table public\.retained_organisation_commercial_records to authenticated/i
    );
    expect(sql).toContain(
      "grant select, insert on table public.organisation_deletion_certificates to service_role"
    );
    expect(sql).not.toMatch(
      /grant (update|delete) on table public\.organisation_deletion_certificates to service_role/
    );
  });

  it("does not grant any purge/deletion function to authenticated", () => {
    const sql = read(DL03);
    expect(sql).not.toMatch(
      /grant execute on function public\.\w*(purge|delete_organisation|execute_organisation_deletion)/i
    );
    expect(sql).toContain("Intentionally no organisation purge/delete RPC in this slice");
  });
});

describe("DL-03 pending_closure SQL freeze", () => {
  it("latest has_organisation_permission fails closed for pending_closure without changing role grants", () => {
    const { sql, file } = latestSqlContaining(
      /create\s+or\s+replace\s+function\s+public\.has_organisation_permission/i
    );
    expect(file).toBe("20260827200000_organisation_deletion_foundation.sql");
    expect(sql).toContain(
      "public.organisation_status_allows_member_access(m.organisation_id)"
    );
    expect(sql).toContain(
      "p_permission = 'sample_organisation.manage' and m.role = 'owner'"
    );
    expect(sql).toContain(
      "members.invite' and m.role in ('owner', 'administrator', 'oversight')"
    );
    expect(sql).toContain(
      "coaching_content.view' and m.role in ('practitioner', 'owner', 'administrator')"
    );
    expect(sql).not.toMatch(
      /coaching_content\.view' and m\.role in \([^)]*oversight/
    );
  });

  it("latest user_can_access_client_content denies pending_closure including coach_id fallback", () => {
    const { sql } = latestSqlContaining(
      /create\s+or\s+replace\s+function\s+public\.user_can_access_client_content/i
    );
    expect(sql).toContain("client_organisation_allows_member_access(p_client_id)");
    expect(sql).toContain("coach_id = p_user_id");
    expect(sql).toContain("user_is_assigned_to_client");
  });

  it("latest user_is_assigned_to_client and organisation_member_role honour the freeze", () => {
    const assigned = latestSqlContaining(
      /create\s+or\s+replace\s+function\s+public\.user_is_assigned_to_client/i
    );
    expect(assigned.sql).toContain("client_organisation_allows_member_access");
    const role = latestSqlContaining(
      /create\s+or\s+replace\s+function\s+public\.organisation_member_role/i
    );
    expect(role.sql).toContain("organisation_status_allows_member_access");
  });

  it("latest invitation accept rejects pending_closure before creating membership", () => {
    const { sql, file } = latestSqlContaining(
      /create\s+or\s+replace\s+function\s+public\.accept_organisation_invitation/i
    );
    expect(file).toBe("20260827200000_organisation_deletion_foundation.sql");
    const freezeIndex = sql.indexOf(
      "organisation_status_allows_member_access(v_invite.organisation_id)"
    );
    const insertIndex = sql.indexOf("insert into public.organisation_memberships");
    expect(freezeIndex).toBeGreaterThan(0);
    expect(insertIndex).toBeGreaterThan(freezeIndex);
  });

  it("is_active_organisation_member already requires organisations.status = active", () => {
    const foundation = read(
      "supabase/migrations/20260802140000_organisation_foundation.sql"
    );
    expect(foundation).toContain("o.status = 'active'");
    expect(read(DL03)).toContain(
      "is_active_organisation_member already requires organisations.status = active"
    );
  });

  it("does not freeze Platform Owner organisation policies", () => {
    const owner = read("supabase/migrations/20260808120000_owner_console.sql");
    expect(owner).toContain("Organisations select platform owner");
    expect(owner).toContain("using (public.is_platform_owner(auth.uid()))");
    expect(owner).not.toContain("organisation_status_allows_member_access");
    const dl03 = read(DL03);
    expect(dl03).toContain(
      "Platform Owner policies do not use this helper"
    );
  });
});

describe("DL-03 application access freeze", () => {
  it("role matrix is unchanged; pending_closure is a separate organisation-status gate", () => {
    expect(hasPermission("owner", "organisation.manage")).toBe(true);
    expect(hasPermission("practitioner", "coaching_content.view")).toBe(true);
    expect(organisationAllowsMemberAccess("active")).toBe(true);
    expect(organisationAllowsMemberAccess("archived")).toBe(true);
    expect(organisationAllowsMemberAccess("pending_closure")).toBe(false);
  });

  it("requireOrganisationPermission denies pending_closure even for owners", () => {
    expect(
      requireOrganisationPermission(fakeOrgContext("active"), "organisation.manage")
    ).toBeNull();
    const denied = requireOrganisationPermission(
      fakeOrgContext("pending_closure"),
      "organisation.manage"
    );
    expect(denied).not.toBeNull();
    expect(denied?.status).toBe(403);
  });

  it("workspace resolution and switch refuse pending_closure", () => {
    const repository = read("lib/organisations/repository.ts");
    expect(repository).toContain("organisationAllowsMemberAccess(org.status)");
    expect(repository).toContain(
      "!organisationAllowsMemberAccess(organisation.status)"
    );
    const current = read("lib/organisations/current-organisation.ts");
    expect(current).toContain(
      "organisationAllowsMemberAccess(resolved.context.organisation.status)"
    );
    expect(current).toContain("input.context.organisation.organisation.status");
  });
});

describe("DL-03 freeze bypass audit of API/RPC paths", () => {
  const memberGates = [
    "requireOrganisationContext",
    "requireAssignedClientAccess",
    "requireAssignedPersonInOrganisation",
    "requireSampleOrganisationManage",
  ];

  it("customer coaching/development API routes go through organisation context gates", () => {
    const apiRoot = join(root, "app/api");
    const unguarded: string[] = [];

    function walk(dir: string) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (entry.name !== "route.ts") continue;
        const rel = full.slice(join(root).length + 1);
        if (rel.startsWith("app/api/owner/")) continue;
        if (rel === "app/api/profile/route.ts") continue;
        if (rel === "app/api/intelligence/interpret/route.ts") continue;
        const source = readFileSync(full, "utf8");
        if (!memberGates.some(gate => source.includes(gate))) {
          unguarded.push(rel);
        }
      }
    }

    walk(apiRoot);
    expect(unguarded).toEqual([]);
  });

  it("sample installer and relationship RPCs depend on frozen has_organisation_permission", () => {
    expect(
      read("supabase/migrations/20260804180000_sample_organisation_installer.sql")
    ).toContain("has_organisation_permission");
    expect(
      read("supabase/migrations/20260804120000_confidential_coaching.sql")
    ).toContain("has_organisation_permission");
    expect(
      read("supabase/migrations/20260804160000_organisation_intelligence.sql")
    ).toContain("has_organisation_permission");
    expect(read(DL03)).toContain(
      "public.organisation_status_allows_member_access(m.organisation_id)"
    );
  });

  it("storage and evidence tenancy use user_can_access_client_content", () => {
    expect(
      read(
        "supabase/migrations/20260817120000_development_evidence_storage_tenancy.sql"
      )
    ).toContain("user_can_access_client_content");
    expect(read("lib/development-evidence/storage-path.ts")).toContain(
      "DEVELOPMENT_EVIDENCE_STORAGE_BUCKET"
    );
  });

  it("does not add Owner Console or customer delete-all controls", () => {
    expect(read("app/owner/organisations/[id]/page.tsx")).not.toMatch(
      /Permanent deletion|permanently delete organisation/i
    );
    expect(existsSync(join(root, "app/api/owner/organisations/[id]/deletion"))).toBe(
      false
    );
    expect(existsSync(join(root, "app/api/owner/deletion-runs"))).toBe(false);
    const ownerOrg = read("app/api/owner/organisations/[id]/route.ts");
    expect(ownerOrg).not.toContain("organisation_deletion");
    expect(ownerOrg).toContain("requirePlatformOwner");
  });
});

describe("DL-03 cross-tenant isolation remains", () => {
  it("assigned client access still rejects foreign organisation IDs", () => {
    const source = read("lib/organisations/current-organisation.ts");
    expect(source).toContain("clientOrganisationId !== activeOrganisationId");
    expect(source).toContain("organisationAllowsMemberAccess");
  });

  it("people list still scopes by organisation_id", () => {
    const repository = read("lib/supabase/repository.ts");
    expect(repository).toContain('query = query.eq("organisation_id", organisationId)');
    expect(repository).toContain("never return rows from another organisation");
  });
});
