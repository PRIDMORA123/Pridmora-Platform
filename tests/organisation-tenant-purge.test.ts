import { describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertOwnerPayloadIsSafe } from "@/lib/owner/privacy";
import {
  AUTHORITATIVE_STORAGE_BUCKET,
  FORBIDDEN_AUTH_USER_DELETION_APIS,
  FUTURE_PURGE_TRANSITIONS,
  ORGANISATION_PURGE_MANIFEST,
  ORGANISATION_PURGE_MUST_NEVER_DELETE_AUTH_USERS,
  OWNER_PURGE_AUTHORISATION,
  TENANT_PURGE_CASCADE_VERIFY_TABLES,
  TENANT_PURGE_CLEAR_LINK_TABLES,
  TENANT_PURGE_EXPLICIT_TABLES,
  TENANT_PURGE_NONBLOCKING_REVIEW_CODES,
  TENANT_PURGE_PROTECTED_TABLES,
  TENANT_PURGE_RESIDUAL_SURFACES,
  TENANT_PURGE_STAGES,
  reviewCodeBlocksTenantPurgeExecution,
  tenantPurgeResidualAttribution,
  tenantPurgeResidualTables,
} from "@/lib/owner/organisation-purge-architecture";
import {
  attemptedPathsStayWithinManifest,
  capturedStorageRemovalTargets,
  deleteAndVerifyBoundStorage,
  evaluateTenantPurgeGates,
  executeOrganisationTenantPurge,
  OWNER_CAPTURE_STORAGE_MANIFEST_RPC,
  OWNER_MARK_STORAGE_CLEANUP_RPC,
  OWNER_PURGE_TENANT_DATA_RPC,
  residualTenantRowsBlockPurge,
  residualVerificationBlocksStorageStage,
  tenantPurgeSqlForbidsAuthDeletion,
  tenantPurgeSqlProtectsSurfaces,
  tenantPurgeSqlVerifiesResidualSurfaces,
  type BoundStorageManifestRow,
} from "@/lib/owner/organisation-tenant-purge";

const root = process.cwd();
const MIGRATION =
  "supabase/migrations/20260827250000_organisation_tenant_purge.sql";
const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const RUN_ID = "99999999-9999-4999-8999-999999999999";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CLIENT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CAPTURED_PATH = `${ORG_ID}/${CLIENT_ID}/abcd1234-file.pdf`;
const FOREIGN_PATH = `${ORG_B}/${CLIENT_ID}/abcd1234-other.pdf`;

function read(pathFromRoot: string): string {
  return readFileSync(join(root, pathFromRoot), "utf8");
}

function baseGates(
  overrides?: Partial<Parameters<typeof evaluateTenantPurgeGates>[0]>
) {
  return evaluateTenantPurgeGates({
    organisationStatus: "pending_closure",
    organisationName: "Northwind",
    organisationType: "business",
    runId: RUN_ID,
    runStatus: "commercial_copied",
    runOrganisationId: ORG_ID,
    runFormerOrganisationId: ORG_ID,
    expectedOrganisationId: ORG_ID,
    commercialCopyVerified: true,
    retainMinimisePending: 0,
    purgeReadinessResult: "requires_review",
    purgeReadinessReasons: [
      {
        code: "BACKUP_EXTERNAL_RETENTION_UNCONFIRMED",
        severity: "review",
        message: "Backup unconfirmed.",
      },
    ],
    storageAuthoritative: true,
    migrationReviewAmbiguous: 0,
    migrationReviewUnknown: 0,
    inventoryIncomplete: false,
    ...overrides,
  });
}

function manifestRow(
  overrides?: Partial<BoundStorageManifestRow>
): BoundStorageManifestRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    bucket: "development-evidence",
    object_path: CAPTURED_PATH,
    deleted_at: null,
    verified_absent_at: null,
    ...overrides,
  };
}

function createBoundStorageClient(input: {
  rows?: BoundStorageManifestRow[] | null;
  loadError?: boolean;
  present?: Set<string>;
  removeErrorFor?: string[];
  prefixTop?: Array<{ name: string; id?: string | null; metadata?: object | null }>;
  nested?: Record<string, Array<{ name: string }>>;
  listError?: boolean;
}) {
  const present = input.present ?? new Set<string>();
  const removed: string[] = [];
  const client = {
    from(table: string) {
      expect(table).toBe("organisation_deletion_storage_manifest");
      return {
        select() {
          return {
            eq() {
              if (input.loadError) {
                return Promise.resolve({ data: null, error: { message: "read failed" } });
              }
              return Promise.resolve({ data: input.rows ?? [], error: null });
            },
          };
        },
        update() {
          return {
            eq() {
              return {
                eq() {
                  return Promise.resolve({ error: null });
                },
              };
            },
          };
        },
      };
    },
    storage: {
      from(bucket: string) {
        expect(bucket).toBe("development-evidence");
        return {
          list(parent: string, opts?: { search?: string }) {
            if (input.listError) {
              return Promise.resolve({ data: null, error: { message: "list failed" } });
            }
            if (opts?.search) {
              const key = `${parent}/${opts.search}`;
              return Promise.resolve({
                data: present.has(key) ? [{ name: opts.search }] : [],
                error: null,
              });
            }
            if (parent === ORG_ID) {
              return Promise.resolve({
                data: input.prefixTop ?? [],
                error: null,
              });
            }
            return Promise.resolve({
              data: input.nested?.[parent] ?? [],
              error: null,
            });
          },
          remove(paths: string[]) {
            removed.push(...paths);
            for (const path of paths) {
              if (input.removeErrorFor?.includes(path)) {
                return Promise.resolve({ error: { message: "remove failed" } });
              }
              present.delete(path);
            }
            return Promise.resolve({ error: null });
          },
        };
      },
    },
    removed,
  };
  return client;
}

describe("DL-08 Slice 3 gates", () => {
  it("allows execution when backup/external review is the only remaining review", () => {
    const result = baseGates();
    expect(reviewCodeBlocksTenantPurgeExecution("BACKUP_EXTERNAL_RETENTION_UNCONFIRMED")).toBe(false);
    expect(TENANT_PURGE_NONBLOCKING_REVIEW_CODES).toEqual([
      "BACKUP_EXTERNAL_RETENTION_UNCONFIRMED",
    ]);
    expect(result.purgeAvailable).toBe(true);
    expect(result.gates.every(gate => gate.passed)).toBe(true);
  });

  it("rejects the wrong organisation or run", () => {
    expect(baseGates({ runFormerOrganisationId: ORG_B }).purgeAvailable).toBe(false);
    expect(baseGates({ runOrganisationId: ORG_B }).purgeAvailable).toBe(false);
    expect(baseGates({ runId: null }).purgeAvailable).toBe(false);
  });

  it("rejects organisations that are not pending_closure", () => {
    expect(baseGates({ organisationStatus: "active" }).purgeAvailable).toBe(false);
    expect(baseGates({ organisationStatus: "closed" }).purgeAvailable).toBe(false);
  });

  it("rejects incomplete commercial retention", () => {
    expect(
      baseGates({
        commercialCopyVerified: false,
        runStatus: "frozen",
        purgeReadinessReasons: [
          {
            code: "COMMERCIAL_COPY_NOT_VERIFIED",
            severity: "review",
            message: "not copied",
          },
        ],
      }).purgeAvailable
    ).toBe(false);
  });

  it("rejects pending retain-minimise rows", () => {
    expect(baseGates({ retainMinimisePending: 2 }).purgeAvailable).toBe(false);
  });

  it("rejects ambiguous migration-review rows", () => {
    const result = baseGates({ migrationReviewAmbiguous: 1 });
    expect(result.purgeAvailable).toBe(false);
    expect(result.blockingReasons.map(item => item.code)).toContain(
      "MIGRATION_REVIEW_AMBIGUOUS"
    );
  });

  it("rejects unknown relevant migration-review rows", () => {
    const result = baseGates({ migrationReviewUnknown: 1 });
    expect(result.purgeAvailable).toBe(false);
    expect(result.blockingReasons.map(item => item.code)).toContain(
      "MIGRATION_REVIEW_UNKNOWN_TABLE"
    );
  });

  it("rejects non-authoritative Storage", () => {
    expect(baseGates({ storageAuthoritative: false }).purgeAvailable).toBe(false);
  });

  it("rejects incomplete inventory and blocking review codes", () => {
    expect(baseGates({ inventoryIncomplete: true }).purgeAvailable).toBe(false);
    expect(
      baseGates({
        purgeReadinessReasons: [
          {
            code: "STORAGE_PREFIX_UNVERIFIED",
            severity: "review",
            message: "prefix unverified",
          },
        ],
      }).purgeAvailable
    ).toBe(false);
    expect(baseGates({ organisationType: "personal" }).purgeAvailable).toBe(false);
    expect(baseGates({ purgeReadinessResult: "blocked" }).purgeAvailable).toBe(false);
  });

  it("requires destructive acknowledgement on execute", async () => {
    const denied = await executeOrganisationTenantPurge({
      ownerSupabase: {} as SupabaseClient,
      inventorySupabase: {} as SupabaseClient,
      organisationId: ORG_ID,
      deletionRunId: RUN_ID,
      confirmationName: "Northwind",
      instructionReference: "GDPR-1",
      permanentErasureAcknowledged: false,
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.code).toBe("ACKNOWLEDGEMENT_REQUIRED");
  });

  it("skips commercial count mismatch only when retrying an interrupted purge", () => {
    const first = baseGates({
      purgeReadinessReasons: [
        {
          code: "BACKUP_EXTERNAL_RETENTION_UNCONFIRMED",
          severity: "review",
          message: "Backup unconfirmed.",
        },
        {
          code: "COMMERCIAL_COUNT_MISMATCH",
          severity: "block",
          message: "counts drifted",
        },
      ],
    });
    expect(first.purgeAvailable).toBe(false);
    const retry = baseGates({
      runStatus: "failed",
      purgeReadinessReasons: [
        {
          code: "BACKUP_EXTERNAL_RETENTION_UNCONFIRMED",
          severity: "review",
          message: "Backup unconfirmed.",
        },
        {
          code: "COMMERCIAL_COUNT_MISMATCH",
          severity: "block",
          message: "counts drifted",
        },
        {
          code: "UNEXPECTED_RUN_STATE",
          severity: "block",
          message: "failed",
        },
      ],
    });
    expect(retry.purgeAvailable).toBe(true);
  });
});

describe("DL-08 Slice 3 SQL contracts", () => {
  it("uses the accepted purge manifest order and protects retained surfaces", () => {
    expect(existsSync(join(root, MIGRATION))).toBe(true);
    const sql = read(MIGRATION);
    expect(TENANT_PURGE_EXPLICIT_TABLES).toContain("clients");
    expect(TENANT_PURGE_EXPLICIT_TABLES).toContain("sessions");
    expect(TENANT_PURGE_EXPLICIT_TABLES).toContain("organisations");
    expect(TENANT_PURGE_CLEAR_LINK_TABLES).toEqual(["profiles"]);
    expect(TENANT_PURGE_CASCADE_VERIFY_TABLES).toEqual(
      expect.arrayContaining([
        "organisation_intelligence_metrics",
        "organisation_intelligence_themes",
        "organisation_intelligence_recommendations",
      ])
    );
    expect(TENANT_PURGE_PROTECTED_TABLES).toEqual(
      expect.arrayContaining([
        "support_cases",
        "platform_audit_events",
        "retained_organisation_commercial_records",
        "organisation_deletion_runs",
        "organisation_deletion_certificates",
        "organisation_deletion_storage_manifest",
        "platform_owners",
        "platform_plans",
        "platform_settings",
      ])
    );
    expect(sql.indexOf("delete from public.clients")).toBeGreaterThan(
      sql.indexOf("delete from public.sessions")
    );
    expect(sql.indexOf("delete from public.organisations")).toBeGreaterThan(
      sql.indexOf("delete from public.clients")
    );
    expect(sql).toContain("update public.profiles");
    expect(sql).toContain("current_organisation_id = null");
    expect(sql).not.toMatch(/delete\s+from\s+public\.profiles/i);
    expect(sql).not.toMatch(/delete\s+from\s+public\.support_cases/i);
    expect(sql).not.toMatch(/delete\s+from\s+public\.platform_audit_events/i);
    expect(sql).not.toMatch(
      /delete\s+from\s+public\.retained_organisation_commercial_records/i
    );
    expect(sql).not.toMatch(/delete\s+from\s+public\.platform_owners/i);
    expect(sql).not.toMatch(/delete\s+from\s+public\.platform_plans/i);
    expect(sql).not.toMatch(/delete\s+from\s+public\.platform_settings/i);
    expect(tenantPurgeSqlProtectsSurfaces(sql)).toBe(true);
    expect(sql).toContain("'development-evidence'");
    expect(sql).not.toContain("documents-openai");
    expect(sql).not.toContain("storage.remove");
    expect(sql).not.toMatch(/insert\s+into\s+public\.organisation_deletion_certificates/i);
    expect(sql).not.toMatch(/status\s*=\s*'completed'/);
    expect(sql).not.toContain("completed_at");
    expect(sql).toContain("awaiting_certificate");
    expect(sql).toContain("alreadyCaptured");
    expect(sql).toContain("alreadyPurged");
    expect(sql).toContain("COMMERCIAL_COPY_NOT_VERIFIED");
    expect(sql).toContain("verification_status is distinct from 'passed'");
    expect(sql).toContain("organisation_id = $1");
    expect(sql).toContain("former_organisation_id is distinct from p_organisation_id");
    expect(sql).toContain("remainingCount");
    expect(tenantPurgeSqlVerifiesResidualSurfaces(sql)).toBe(true);
    expect(tenantPurgeSqlForbidsAuthDeletion(sql)).toBe(true);
    expect(ORGANISATION_PURGE_MUST_NEVER_DELETE_AUTH_USERS).toBe(true);
    expect(FORBIDDEN_AUTH_USER_DELETION_APIS.every(api => !sql.includes(api))).toBe(
      true
    );
  });

  it("deletes explicit manifest tables in FK-safe children-before-parents order", () => {
    const sql = read(MIGRATION);
    const foreachBlock = sql.match(
      /foreach v_table in array array\[([\s\S]*?)\]\s+loop\s+v_sql := format\('delete from public\.%I where organisation_id = \$1'/
    );
    expect(foreachBlock).not.toBeNull();
    const loopTables = [...(foreachBlock?.[1].matchAll(/'([a-z0-9_]+)'/g) ?? [])].map(
      match => match[1]
    );
    const expectedLoop = ORGANISATION_PURGE_MANIFEST.filter(
      item => loopTables.includes(item.table)
    )
      .sort((left, right) => left.deletionOrder - right.deletionOrder)
      .map(item => item.table);
    expect(loopTables).toEqual(expectedLoop);
    expect(sql.indexOf("delete from public.organisation_intelligence_metrics")).toBeLessThan(
      sql.indexOf("delete from public.organisation_intelligence_snapshots")
    );
    expect(sql.indexOf("delete from public.organisation_framework_capabilities")).toBeLessThan(
      sql.indexOf("delete from public.organisation_frameworks")
    );
    expect(sql.indexOf("delete from public.organisation_memberships")).toBeLessThan(
      sql.indexOf("delete from public.organisations")
    );
  });

  it("fails closed on unknown future entity types and does not search details JSON", () => {
    const sql = read(MIGRATION);
    expect(sql).not.toContain("r.details");
    expect(sql).not.toContain("details JSON");
    expect(sql).toContain("MIGRATION_REVIEW_UNKNOWN_TABLE");
    expect(sql).toContain("MIGRATION_REVIEW_AMBIGUOUS");
    expect(sql).toContain("STORAGE_PATH_NOT_AUTHORITATIVE");
    expect(sql).toContain("table_name not in ('clients', 'sessions')");
    expect(sql).not.toMatch(/details\s*->>/);
    expect(sql).not.toMatch(/details\s*::text/i);
  });

  it("does not introduce Auth deletion or a certificate", () => {
    const lib = read("lib/owner/organisation-tenant-purge.ts");
    const route = read(
      "app/api/owner/organisations/[id]/tenant-purge/route.ts"
    );
    expect(lib).not.toMatch(/auth\.admin\.deleteUser/);
    expect(route).not.toMatch(/auth\.admin\.deleteUser/);
    expect(route).not.toContain("export async function DELETE");
    expect(route).toContain("requirePlatformOwner");
    expect(OWNER_CAPTURE_STORAGE_MANIFEST_RPC).toBe(
      "owner_capture_organisation_storage_manifest"
    );
    expect(OWNER_PURGE_TENANT_DATA_RPC).toBe(
      "owner_purge_organisation_tenant_data"
    );
    expect(OWNER_MARK_STORAGE_CLEANUP_RPC).toBe(
      "owner_mark_organisation_storage_cleanup"
    );
    expect(OWNER_PURGE_AUTHORISATION.requiredFields).toEqual(
      expect.arrayContaining([
        "confirmationName",
        "deletionRunId",
        "instructionReference",
        "permanentErasureAcknowledged",
      ])
    );
    expect(FUTURE_PURGE_TRANSITIONS.some(item => item.to === "completed")).toBe(
      true
    );
    expect(
      FUTURE_PURGE_TRANSITIONS.find(item => item.from === "verifying" && item.to === "completed")
    ).toBeTruthy();
    expect(sqlHasNoCompletedTransition(lib)).toBe(true);
    expect(TENANT_PURGE_STAGES).toEqual(
      expect.arrayContaining([
        "not_started",
        "storage_manifest_captured",
        "db_purging",
        "db_purged",
        "storage_cleaning",
        "storage_verified",
        "awaiting_certificate",
        "failed",
      ])
    );
    expect(AUTHORITATIVE_STORAGE_BUCKET).toBe("development-evidence");
  });
});

function sqlHasNoCompletedTransition(source: string): boolean {
  return !/status\s*=\s*'completed'/.test(source) && !source.includes("Create deletion certificate");
}

describe("DL-08 Slice 3 Storage capture and deletion", () => {
  it("captures only the bound development-evidence paths and never another organisation", () => {
    const sql = read(MIGRATION);
    expect(sql).toContain("owner_capture_organisation_storage_manifest");
    expect(sql).toContain("split_part(d.storage_path, '/', 1) is distinct from p_organisation_id::text");
    expect(sql).toContain("alreadyCaptured");
    expect(capturedStorageRemovalTargets([manifestRow()])).toEqual([CAPTURED_PATH]);
    expect(
      attemptedPathsStayWithinManifest([CAPTURED_PATH], [FOREIGN_PATH])
    ).toBe(false);
    expect(
      attemptedPathsStayWithinManifest([CAPTURED_PATH], [CAPTURED_PATH])
    ).toBe(true);
  });

  it("deletes only captured Storage objects and verifies they are absent", async () => {
    const present = new Set([CAPTURED_PATH]);
    const client = createBoundStorageClient({
      rows: [manifestRow()],
      present,
    });
    const result = await deleteAndVerifyBoundStorage({
      supabase: client as unknown as SupabaseClient,
      deletionRunId: RUN_ID,
      organisationId: ORG_ID,
      capturedCount: 1,
    });
    expect(result.ok).toBe(true);
    expect(result.attemptedPaths).toEqual([CAPTURED_PATH]);
    expect(client.removed).toEqual([CAPTURED_PATH]);
    expect(client.removed).not.toContain(FOREIGN_PATH);
    expect(present.has(CAPTURED_PATH)).toBe(false);
  });

  it("fails closed on partial Storage deletion", async () => {
    const present = new Set([CAPTURED_PATH]);
    const client = createBoundStorageClient({
      rows: [manifestRow()],
      present,
      removeErrorFor: [CAPTURED_PATH],
    });
    const result = await deleteAndVerifyBoundStorage({
      supabase: client as unknown as SupabaseClient,
      deletionRunId: RUN_ID,
      organisationId: ORG_ID,
      capturedCount: 1,
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("PARTIAL_STORAGE_FAILURE");
    expect(present.has(CAPTURED_PATH)).toBe(true);
  });

  it("fails closed when the organisation prefix still has remainder objects", async () => {
    const client = createBoundStorageClient({
      rows: [manifestRow({ verified_absent_at: "2026-08-27T00:00:00.000Z" })],
      present: new Set(),
      prefixTop: [{ name: CLIENT_ID, id: null, metadata: null }],
      nested: {
        [`${ORG_ID}/${CLIENT_ID}`]: [{ name: "orphan.bin" }],
      },
    });
    const result = await deleteAndVerifyBoundStorage({
      supabase: client as unknown as SupabaseClient,
      deletionRunId: RUN_ID,
      organisationId: ORG_ID,
      capturedCount: 1,
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("STORAGE_PREFIX_REMAINDER");
    expect(client.removed).toEqual([]);
  });

  it("reuses verified rows on retry and does not broaden deletion scope", async () => {
    const client = createBoundStorageClient({
      rows: [
        manifestRow({
          deleted_at: "2026-08-27T00:00:00.000Z",
          verified_absent_at: "2026-08-27T00:00:01.000Z",
        }),
      ],
      present: new Set(),
    });
    const result = await deleteAndVerifyBoundStorage({
      supabase: client as unknown as SupabaseClient,
      deletionRunId: RUN_ID,
      organisationId: ORG_ID,
      capturedCount: 1,
    });
    expect(result.ok).toBe(true);
    expect(client.removed).toEqual([]);
    expect(
      capturedStorageRemovalTargets([
        manifestRow({ verified_absent_at: "2026-08-27T00:00:01.000Z" }),
      ])
    ).toEqual([]);
  });

  it("fails closed when the bound manifest cannot be loaded after capture", async () => {
    const client = createBoundStorageClient({ loadError: true });
    const result = await deleteAndVerifyBoundStorage({
      supabase: client as unknown as SupabaseClient,
      deletionRunId: RUN_ID,
      organisationId: ORG_ID,
      capturedCount: 1,
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("PARTIAL_STORAGE_FAILURE");
  });
});

describe("DL-08 Slice 3 Owner Console and privacy", () => {
  it("gates execution in the Owner Console without exposing coaching content", () => {
    const page = read("app/owner/organisations/[id]/page.tsx");
    expect(page).toContain("Permanent tenant-data erasure");
    expect(page).toContain("Permanently erase tenant data");
    expect(page).toContain("permanentErasureAcknowledged");
    expect(page).toContain("TenantPurgePanel");
    expect(page).not.toContain("Delete organisation");
    expect(page).not.toMatch(/privateNotes|transcript|reflection_text/i);
    expect(page).not.toContain("Create deletion certificate");
    const payload = {
      organisationId: ORG_ID,
      runStatus: "verifying",
      storage: { capturedCount: 1, deletedCount: 1, verifiedCount: 1 },
      authUsersDeleted: false,
      certificateCreated: false,
    };
    expect(() => assertOwnerPayloadIsSafe(payload)).not.toThrow();
    expect(() =>
      assertOwnerPayloadIsSafe({
        ...payload,
        privateNotes: "secret coaching",
      })
    ).toThrow(/confidential field/i);
  });
});

describe("DL-08 Slice 3 execute acknowledgements", () => {
  it("does not call RPCs when acknowledgement is missing", async () => {
    const rpc = vi.fn();
    const result = await executeOrganisationTenantPurge({
      ownerSupabase: { rpc } as unknown as SupabaseClient,
      inventorySupabase: { rpc } as unknown as SupabaseClient,
      organisationId: ORG_ID,
      deletionRunId: RUN_ID,
      confirmationName: "Northwind",
      instructionReference: "GDPR-1",
      permanentErasureAcknowledged: false,
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.authUsersDeleted).toBe(false);
      expect(result.certificateCreated).toBe(false);
      expect(result.permanentDeletionOccurred).toBe(false);
    }
  });
});

describe("DL-08 Slice 3 manifest coverage", () => {
  it("classifies the storage manifest as a retained purge artifact", () => {
    const item = ORGANISATION_PURGE_MANIFEST.find(
      row => row.table === "organisation_deletion_storage_manifest"
    );
    expect(item?.deletionMode).toBe("never");
    expect(item?.treatment).toBe("RETAIN");
    const org = ORGANISATION_PURGE_MANIFEST.find(row => row.table === "organisations");
    expect(org?.deletionOrder).toBe(200);
    expect(
      ORGANISATION_PURGE_MANIFEST.find(row => row.table === "profiles")?.deletionMode
    ).toBe("clear_link");
  });
});

describe("DL-08 Slice 3 exhaustive residual verification", () => {
  it("contracts residual coverage to every delete and remove-tenant-link manifest surface", () => {
    const expected = ORGANISATION_PURGE_MANIFEST.filter(item =>
      ["explicit", "verified_cascade", "clear_link"].includes(item.deletionMode)
    ).map(item => item.table);
    expect(TENANT_PURGE_RESIDUAL_SURFACES.map(item => item.table)).toEqual(expected);
    expect(
      [...TENANT_PURGE_RESIDUAL_SURFACES.map(item => item.table)].sort()
    ).toEqual(
      [
        ...TENANT_PURGE_EXPLICIT_TABLES,
        ...TENANT_PURGE_CASCADE_VERIFY_TABLES,
        ...TENANT_PURGE_CLEAR_LINK_TABLES,
      ].sort()
    );
    for (const entry of ORGANISATION_PURGE_MANIFEST) {
      expect(() => tenantPurgeResidualAttribution(entry)).not.toThrow();
    }
    const sql = read(MIGRATION);
    expect(tenantPurgeSqlVerifiesResidualSurfaces(sql)).toBe(true);
    const section = sql.slice(
      sql.indexOf("-- EXHAUSTIVE RESIDUAL VERIFICATION"),
      sql.indexOf("-- END EXHAUSTIVE RESIDUAL VERIFICATION")
    );
    const orgIdSection = section.slice(section.indexOf("-- residual organisation_id surfaces"));
    const orgIdBlock = orgIdSection.match(
      /foreach v_table in array array\[([\s\S]*?)\]\s+loop\s+v_sql := format\(\s*'select count\(\*\) from public\.%I where organisation_id = \$1'/
    );
    expect(orgIdBlock).not.toBeNull();
    const orgIdTables = [...(orgIdBlock?.[1].matchAll(/'([a-z0-9_]+)'/g) ?? [])].map(
      match => match[1]
    );
    expect(orgIdTables).toEqual(tenantPurgeResidualTables("organisation_id"));
    expect(tenantPurgeResidualTables("current_organisation_id")).toEqual(["profiles"]);
    expect(tenantPurgeResidualTables("organisation_pk")).toEqual(["organisations"]);
    expect(tenantPurgeResidualTables("migration_review_join")).toEqual([
      "organisation_migration_review",
    ]);
    expect(tenantPurgeResidualTables("client_id_in_org_clients")).toEqual([
      "sessions_workflow_backup_20260726",
    ]);
    expect(tenantPurgeResidualTables("snapshot_children")).toEqual(
      TENANT_PURGE_CASCADE_VERIFY_TABLES
    );
    expect(section).toContain("r.table_name = 'clients' and r.record_id = any(v_client_ids)");
    expect(section).toContain("r.table_name = 'sessions' and r.record_id = any(v_session_ids)");
    expect(section).not.toContain("r.details");
    expect(sql.indexOf("-- EXHAUSTIVE RESIDUAL VERIFICATION")).toBeLessThan(
      sql.indexOf("status = 'purged'")
    );
    expect(sql.indexOf("-- END EXHAUSTIVE RESIDUAL VERIFICATION")).toBeLessThan(
      sql.indexOf("status = 'purged'")
    );
  });

  it("fails closed for a residual row in every residual attribution category", () => {
    const categoryExamples = [
      "coaching_moments",
      "organisation_intelligence_metrics",
      "profiles",
      "organisations",
      "organisation_migration_review",
      "sessions_workflow_backup_20260726",
    ];
    for (const table of categoryExamples) {
      const result = residualTenantRowsBlockPurge({ table, remainingCount: 1 });
      expect(result.blocked).toBe(true);
      expect(result.code).toBe("RESIDUAL_TENANT_ROWS");
      expect(result.table).toBe(table);
      expect(result.remainingCount).toBe(1);
    }
    for (const entry of TENANT_PURGE_RESIDUAL_SURFACES) {
      expect(
        residualTenantRowsBlockPurge({ table: entry.table, remainingCount: 1 }).blocked
      ).toBe(true);
      expect(
        residualTenantRowsBlockPurge({ table: entry.table, remainingCount: 0 }).blocked
      ).toBe(false);
    }
    expect(
      residualVerificationBlocksStorageStage(
        TENANT_PURGE_RESIDUAL_SURFACES.map(item => ({
          table: item.table,
          remainingCount: 0,
        }))
      )
    ).toBe(false);
    expect(
      residualVerificationBlocksStorageStage([{ table: "clients", remainingCount: 1 }])
    ).toBe(true);
  });

  it("does not treat retained surfaces as residual tenant rows", () => {
    for (const table of TENANT_PURGE_PROTECTED_TABLES) {
      expect(
        residualTenantRowsBlockPurge({ table, remainingCount: 3 }).blocked
      ).toBe(false);
    }
    expect(
      residualTenantRowsBlockPurge({
        table: "future_unknown_tenant_table",
        remainingCount: 0,
      }).blocked
    ).toBe(true);
  });
});
