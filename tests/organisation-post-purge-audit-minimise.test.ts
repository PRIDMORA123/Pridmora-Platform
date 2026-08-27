import { describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertOwnerPayloadIsSafe } from "@/lib/owner/privacy";
import {
  DELETION_LIFECYCLE_AUDIT_SQL_MINIMISERS,
  FUTURE_FINALISATION_AUDIT_ACTIONS,
  FUTURE_FINALISATION_AUDIT_REQUIRES_SLICE2_MINIMISERS,
  PLATFORM_AUDIT_ENTITY_ID_RETAIN_TYPES,
  PLATFORM_AUDIT_METADATA_ALLOWLIST,
  POST_PURGE_LIFECYCLE_AUDIT_ACTIONS,
  WRITE_MINIMISED_DELETION_LIFECYCLE_AUDIT_SQL,
  futureFinalisationAuditSourceIsContracted,
  lifecycleAuditWriteTimeUsesAcceptedMinimisers,
} from "@/lib/owner/organisation-purge-architecture";
import {
  isPlatformAuditEventMinimised,
  minimisePlatformAuditEntityId,
  minimisePlatformAuditMetadata,
} from "@/lib/owner/organisation-retain-minimise";
import {
  OWNER_REMINIMISE_ORGANISATION_AUDIT_RPC,
  loadAuditReminimiseState,
  minimisedPostPurgeLifecycleAuditMetadata,
  postPurgeAuditMetadataOmitsAuthUsersDeleted,
  reminimiseOrganisationAuditEvents,
} from "@/lib/owner/organisation-audit-reminimise";
import { loadFinalVerificationState } from "@/lib/owner/organisation-final-verification";

const root = process.cwd();
const FIX_MIGRATION =
  "supabase/migrations/20260827260000_organisation_post_purge_audit_minimise.sql";
const PURGE_MIGRATION =
  "supabase/migrations/20260827250000_organisation_tenant_purge.sql";
const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const RUN_ID = "99999999-9999-4999-8999-999999999999";
const OTHER_RUN = "88888888-8888-4888-8888-888888888888";
const ACTOR = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function read(pathFromRoot: string): string {
  return readFileSync(join(root, pathFromRoot), "utf8");
}

const SLICE3_PURGED_METADATA = {
  formerOrganisationId: ORG_ID,
  deletionRunId: RUN_ID,
  runStatus: "purged",
  stage: "db_purged",
  permanentDeletionOccurred: true,
  authUsersDeleted: false,
};

const SLICE3_STORAGE_METADATA = {
  formerOrganisationId: ORG_ID,
  deletionRunId: RUN_ID,
  runStatus: "verifying",
  stage: "awaiting_certificate",
  permanentDeletionOccurred: true,
  authUsersDeleted: false,
};

function slice3AuditRow(
  action: string,
  metadata: Record<string, unknown>,
  extras?: Partial<{
    organisation_id: string | null;
    entity_type: string;
    entity_id: string | null;
    former_organisation_id: string;
  }>
) {
  return {
    organisation_id: extras?.organisation_id ?? null,
    former_organisation_id: extras?.former_organisation_id ?? ORG_ID,
    action,
    actor_user_id: ACTOR,
    entity_type: extras?.entity_type ?? "organisation_deletion_run",
    entity_id: extras?.entity_id === undefined ? RUN_ID : extras.entity_id,
    metadata,
  };
}

describe("DL-08 post-purge audit write-time minimisation", () => {
  it("writes tenant_rows_purged and storage_cleanup_verified through Slice 2 minimisers", () => {
    const sql = read(FIX_MIGRATION);
    expect(existsSync(join(root, FIX_MIGRATION))).toBe(true);
    expect(lifecycleAuditWriteTimeUsesAcceptedMinimisers(sql)).toBe(true);
    expect(sql).toContain(WRITE_MINIMISED_DELETION_LIFECYCLE_AUDIT_SQL);
    for (const helper of DELETION_LIFECYCLE_AUDIT_SQL_MINIMISERS) {
      expect(sql).toContain(helper);
    }
    expect(sql).toContain("organisation.tenant_rows_purged");
    expect(sql).toContain("organisation.storage_cleanup_verified");
    expect(sql).toContain("new.organisation_id := null");
    expect(sql).toMatch(/former_organisation_id is not null/);
    expect(POST_PURGE_LIFECYCLE_AUDIT_ACTIONS).toEqual([
      "organisation.tenant_rows_purged",
      "organisation.storage_cleanup_verified",
    ]);
  });

  it("does not persist authUsersDeleted in retained audit metadata", () => {
    expect(PLATFORM_AUDIT_METADATA_ALLOWLIST).not.toContain("authUsersDeleted");
    const purged = minimisedPostPurgeLifecycleAuditMetadata({
      formerOrganisationId: ORG_ID,
      deletionRunId: RUN_ID,
      runStatus: "purged",
      stage: "db_purged",
    });
    const storage = minimisedPostPurgeLifecycleAuditMetadata({
      formerOrganisationId: ORG_ID,
      deletionRunId: RUN_ID,
      runStatus: "verifying",
      stage: "awaiting_certificate",
    });
    expect(postPurgeAuditMetadataOmitsAuthUsersDeleted(purged)).toBe(true);
    expect(postPurgeAuditMetadataOmitsAuthUsersDeleted(storage)).toBe(true);
    expect(purged.authUsersDeleted).toBeUndefined();
    expect(storage.authUsersDeleted).toBeUndefined();
    expect(minimisePlatformAuditMetadata(SLICE3_PURGED_METADATA).authUsersDeleted).toBeUndefined();
    const sql = read(FIX_MIGRATION);
    const helper = sql.slice(
      sql.indexOf("write_minimised_deletion_lifecycle_audit"),
      sql.indexOf("minimise_retained_platform_audit_row")
    );
    expect(helper).not.toContain("authUsersDeleted");
    const markFn = sql.slice(sql.indexOf("owner_mark_organisation_storage_cleanup"));
    const auditWrite = markFn.slice(
      markFn.indexOf("perform public.write_minimised_deletion_lifecycle_audit"),
      markFn.indexOf("return jsonb_build_object")
    );
    expect(auditWrite).not.toContain("'authUsersDeleted'");
  });

  it("keeps entity_id fail-closed, actor retained, organisation_id NULL, former org retained", () => {
    expect(minimisePlatformAuditEntityId("organisation_deletion_run", RUN_ID)).toBe(
      RUN_ID
    );
    expect(minimisePlatformAuditEntityId("unknown_future_table", RUN_ID)).toBeNull();
    expect([...PLATFORM_AUDIT_ENTITY_ID_RETAIN_TYPES]).toContain(
      "organisation_deletion_run"
    );
    const minimised = slice3AuditRow(
      "organisation.tenant_rows_purged",
      minimisedPostPurgeLifecycleAuditMetadata({
        formerOrganisationId: ORG_ID,
        deletionRunId: RUN_ID,
        runStatus: "purged",
        stage: "db_purged",
      })
    );
    expect(minimised.organisation_id).toBeNull();
    expect(minimised.former_organisation_id).toBe(ORG_ID);
    expect(minimised.actor_user_id).toBe(ACTOR);
    expect(minimised.entity_id).toBe(RUN_ID);
    expect(isPlatformAuditEventMinimised(minimised)).toBe(true);
    expect(
      isPlatformAuditEventMinimised(
        slice3AuditRow("organisation.tenant_rows_purged", SLICE3_PURGED_METADATA)
      )
    ).toBe(false);
    expect(
      isPlatformAuditEventMinimised(
        slice3AuditRow("organisation.storage_cleanup_verified", SLICE3_STORAGE_METADATA)
      )
    ).toBe(false);
    expect(
      isPlatformAuditEventMinimised({
        ...minimised,
        entity_type: "unknown_future_table",
        entity_id: RUN_ID,
      })
    ).toBe(false);
  });

  it("makes storage-cleanup success audit retry-safe", () => {
    const sql = read(FIX_MIGRATION);
    const mark = sql.slice(sql.indexOf("owner_mark_organisation_storage_cleanup"));
    expect(mark).toContain("organisation.storage_cleanup_verified");
    expect(mark).toContain("v_already");
    expect(mark).toMatch(/if not v_already then/);
    expect(mark).toContain(WRITE_MINIMISED_DELETION_LIFECYCLE_AUDIT_SQL);
  });
});

describe("DL-08 last-mile audit re-minimise", () => {
  it("SQL is scoped to former org + run and does not require organisations", () => {
    const sql = read(FIX_MIGRATION);
    const rpc = sql.slice(sql.indexOf("owner_reminimise_organisation_audit_events"));
    expect(rpc).toContain("p_former_organisation_id");
    expect(rpc).toContain("p_deletion_run_id");
    expect(rpc).toContain("former_organisation_id is distinct from p_former_organisation_id");
    expect(rpc).toContain("update public.platform_audit_events");
    expect(rpc).toContain("minimise_platform_audit_entity_id");
    expect(rpc).toContain("minimise_platform_audit_metadata");
    expect(rpc).not.toMatch(/from public\.organisations/);
    expect(rpc).not.toMatch(/delete\s+from\s+public\.platform_audit_events/i);
    expect(rpc).not.toMatch(/delete\s+from\s+public\.support_cases/i);
    expect(rpc).not.toMatch(
      /delete\s+from\s+public\.retained_organisation_commercial_records/i
    );
    expect(rpc).not.toMatch(/update public\.retained_organisation_commercial_records/i);
    expect(rpc).not.toMatch(/update public\.organisation_deletion_runs/);
    expect(rpc).not.toContain("insert into public.platform_audit_events");
    expect(rpc).not.toContain("organisation_deletion_certificates");
    expect(rpc).not.toContain("auth.admin");
    expect(rpc).not.toContain("storage.from");
    expect(rpc).toContain("'runStatusUnchanged', true");
    expect(rpc).toContain("'certificateCreated', false");
  });

  it("works without the organisations row and is scoped away from another tenant", async () => {
    const writes = { rpc: 0, update: 0, delete: 0, insert: 0 };
    let auditRows = [
      slice3AuditRow("organisation.tenant_rows_purged", SLICE3_PURGED_METADATA),
      slice3AuditRow(
        "organisation.storage_cleanup_verified",
        SLICE3_STORAGE_METADATA
      ),
    ];
    const orgBRows = [
      slice3AuditRow("organisation.tenant_rows_purged", SLICE3_PURGED_METADATA, {
        former_organisation_id: ORG_B,
      }),
    ];

    function client(): SupabaseClient {
      return {
        rpc(name: string, args: Record<string, unknown>) {
          writes.rpc += 1;
          expect(name).toBe(OWNER_REMINIMISE_ORGANISATION_AUDIT_RPC);
          expect(args.p_former_organisation_id).toBe(ORG_ID);
          expect(args.p_deletion_run_id).toBe(RUN_ID);
          expect(args.p_former_organisation_id).not.toBe(ORG_B);
          expect(args.p_deletion_run_id).not.toBe(OTHER_RUN);
          auditRows = auditRows.map(row => ({
            ...row,
            metadata: minimisedPostPurgeLifecycleAuditMetadata({
              formerOrganisationId: ORG_ID,
              deletionRunId: RUN_ID,
              runStatus: String(row.metadata.runStatus),
              stage: String(row.metadata.stage),
            }),
          }));
          return Promise.resolve({
            data: {
              ok: true,
              deletionRunId: RUN_ID,
              auditEventsUpdated: 2,
              runStatus: "verifying",
              stage: "awaiting_certificate",
            },
            error: null,
          });
        },
        from(table: string) {
          const filters: Array<[string, string, unknown]> = [];
          const builder = {
            select() {
              return builder;
            },
            eq(column: string, value: unknown) {
              filters.push(["eq", column, value]);
              return builder;
            },
            neq() {
              return builder;
            },
            insert() {
              writes.insert += 1;
              return Promise.resolve({ error: { message: "insert forbidden" } });
            },
            update() {
              writes.update += 1;
              return {
                eq() {
                  return Promise.resolve({ error: { message: "update forbidden" } });
                },
              };
            },
            delete() {
              writes.delete += 1;
              return {
                eq() {
                  return Promise.resolve({ error: { message: "delete forbidden" } });
                },
              };
            },
            async maybeSingle() {
              if (table === "organisations") {
                return { data: null, error: null };
              }
              const former = filters.find(item => item[1] === "former_organisation_id")?.[2];
              if (table === "organisation_deletion_runs") {
                if (former !== ORG_ID) return { data: null, error: null };
                return {
                  data: {
                    id: RUN_ID,
                    former_organisation_id: ORG_ID,
                    status: "verifying",
                    stage: "awaiting_certificate",
                  },
                  error: null,
                };
              }
              return { data: null, error: null };
            },
            then(
              resolve: (value: {
                data: unknown;
                count: number | null;
                error: null;
              }) => unknown
            ) {
              const former = filters.find(item => item[1] === "former_organisation_id")?.[2];
              const orgId = filters.find(item => item[1] === "organisation_id")?.[2];
              if (table === "platform_audit_events" && former === ORG_B) {
                return resolve({ data: orgBRows, count: orgBRows.length, error: null });
              }
              if (table === "platform_audit_events" && former === ORG_ID) {
                return resolve({
                  data: auditRows,
                  count: auditRows.length,
                  error: null,
                });
              }
              if (table === "platform_audit_events" && orgId === ORG_ID) {
                return resolve({ data: [], count: 0, error: null });
              }
              return resolve({ data: [], count: 0, error: null });
            },
          };
          return builder;
        },
      } as unknown as SupabaseClient;
    }

    const supabase = client();
    const before = await loadAuditReminimiseState({
      ownerSupabase: supabase,
      inventorySupabase: supabase,
      formerOrganisationId: ORG_ID,
    });
    expect(before.organisationRowAbsent).toBe(true);
    expect(before.auditNonMinimised).toBe(2);
    expect(before.reminimiseAvailable).toBe(true);

    const denied = await reminimiseOrganisationAuditEvents({
      ownerSupabase: supabase,
      inventorySupabase: supabase,
      formerOrganisationId: ORG_ID,
      deletionRunId: RUN_ID,
      reminimiseAcknowledged: false,
    });
    expect(denied.ok).toBe(false);
    expect(writes.rpc).toBe(0);

    const first = await reminimiseOrganisationAuditEvents({
      ownerSupabase: supabase,
      inventorySupabase: supabase,
      formerOrganisationId: ORG_ID,
      deletionRunId: RUN_ID,
      reminimiseAcknowledged: true,
    });
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.auditNonMinimised).toBe(0);
      expect(first.runStatusUnchanged).toBe(true);
      expect(first.certificateCreated).toBe(false);
      expect(first.tenantRowsDeleted).toBe(false);
    }
    expect(auditRows.every(row => isPlatformAuditEventMinimised(row))).toBe(true);
    expect(orgBRows[0]?.former_organisation_id).toBe(ORG_B);
    expect(isPlatformAuditEventMinimised(orgBRows[0]!)).toBe(false);

    const second = await reminimiseOrganisationAuditEvents({
      ownerSupabase: supabase,
      inventorySupabase: supabase,
      formerOrganisationId: ORG_ID,
      deletionRunId: RUN_ID,
      reminimiseAcknowledged: true,
    });
    expect(second.ok).toBe(true);
    expect(writes.rpc).toBe(2);
    expect(writes.delete).toBe(0);
    expect(writes.insert).toBe(0);
  });
});

describe("DL-08 Slice 4A verifier remains fail-closed", () => {
  it("still blocks non-minimised Slice 3 audit events and passes once they are minimised", async () => {
    const inventory = {
      commercialRetention: {
        sources: [{ recordType: "licence_snapshot", retainedCount: 1 }],
      },
    };
    let audit = [
      slice3AuditRow("organisation.tenant_rows_purged", SLICE3_PURGED_METADATA),
      slice3AuditRow(
        "organisation.storage_cleanup_verified",
        SLICE3_STORAGE_METADATA
      ),
    ];

    function verificationClient(): SupabaseClient {
      return {
        from(table: string) {
          const filters: Array<[string, string, unknown]> = [];
          const builder = {
            select() {
              return builder;
            },
            eq(column: string, value: unknown) {
              filters.push(["eq", column, value]);
              return builder;
            },
            neq() {
              return builder;
            },
            in() {
              return builder;
            },
            order() {
              return builder;
            },
            limit() {
              return builder;
            },
            range() {
              return builder;
            },
            async maybeSingle() {
              if (table === "organisations") return { data: null, error: null };
              if (table === "organisation_deletion_runs") {
                return {
                  data: {
                    id: RUN_ID,
                    organisation_id: null,
                    former_organisation_id: ORG_ID,
                    organisation_name_snapshot: "Northwind",
                    status: "verifying",
                    stage: "awaiting_certificate",
                    storage_status: "passed",
                    verification_status: "passed",
                    inventory,
                    last_error: null,
                  },
                  error: null,
                };
              }
              return { data: null, error: null };
            },
            then(
              resolve: (value: {
                data: unknown;
                count: number | null;
                error: null;
              }) => unknown
            ) {
              if (table === "platform_audit_events") {
                const former = filters.some(item => item[1] === "former_organisation_id");
                if (former) {
                  return resolve({ data: audit, count: audit.length, error: null });
                }
                return resolve({ data: [], count: 0, error: null });
              }
              if (table === "retained_organisation_commercial_records") {
                return resolve({
                  data: [{ record_type: "licence_snapshot", snapshot: { plan: "team" } }],
                  count: 1,
                  error: null,
                });
              }
              return resolve({ data: [], count: 0, error: null });
            },
          };
          return builder;
        },
        storage: {
          from() {
            return {
              list() {
                return Promise.resolve({ data: [], error: null });
              },
            };
          },
        },
      } as unknown as SupabaseClient;
    }

    const blocked = await loadFinalVerificationState({
      ownerSupabase: verificationClient(),
      inventorySupabase: verificationClient(),
      formerOrganisationId: ORG_ID,
    });
    expect(blocked.finalVerificationResult).toBe("failed");
    expect(blocked.blockingReasons.map(item => item.code)).toContain(
      "RETAIN_MINIMISE_INCOMPLETE"
    );
    expect(blocked.retainedSupportAudit.auditNonMinimised).toBe(2);

    audit = audit.map(row => ({
      ...row,
      metadata: minimisedPostPurgeLifecycleAuditMetadata({
        formerOrganisationId: ORG_ID,
        deletionRunId: RUN_ID,
        runStatus: String(row.metadata.runStatus),
        stage: String(row.metadata.stage),
      }),
    }));
    const passed = await loadFinalVerificationState({
      ownerSupabase: verificationClient(),
      inventorySupabase: verificationClient(),
      formerOrganisationId: ORG_ID,
    });
    expect(passed.retainedSupportAudit.auditNonMinimised).toBe(0);
    expect(passed.blockingReasons.map(item => item.code)).not.toContain(
      "RETAIN_MINIMISE_INCOMPLETE"
    );
  });
});

describe("DL-08 future finalisation audit contract", () => {
  it("requires future purge_completed / certificate audit writers to use Slice 2 minimisers", () => {
    expect(FUTURE_FINALISATION_AUDIT_REQUIRES_SLICE2_MINIMISERS).toBe(true);
    expect(FUTURE_FINALISATION_AUDIT_ACTIONS).toEqual(["organisation.purge_completed"]);
    const sql = `${read(PURGE_MIGRATION)}\n${read(FIX_MIGRATION)}\n${read(
      "supabase/migrations/20260827270000_organisation_deletion_certificate.sql"
    )}`;
    expect(futureFinalisationAuditSourceIsContracted(sql)).toBe(true);
    expect(sql).not.toMatch(
      /insert\s+into\s+public\.platform_audit_events[\s\S]{0,400}'organisation\.purge_completed'/
    );
    expect(sql).toContain("write_minimised_deletion_lifecycle_audit");
    expect(sql).toContain("'organisation.purge_completed'");
    expect(read(FIX_MIGRATION)).toContain(
      "Future organisation.purge_completed must use this helper"
    );
    expect(
      futureFinalisationAuditSourceIsContracted(
        `insert into public.platform_audit_events (action) values ('organisation.purge_completed');`
      )
    ).toBe(false);
    expect(
      futureFinalisationAuditSourceIsContracted(
        `insert into public.platform_audit_events (entity_id, metadata, action) values (minimise_platform_audit_entity_id('organisation_deletion_run', id), minimise_platform_audit_metadata('{}'::jsonb), 'organisation.purge_completed');`
      )
    ).toBe(true);
  });

  it("authorises the re-minimise route without creating a certificate", () => {
    const route = read(
      "app/api/owner/organisations/[id]/audit-reminimise/route.ts"
    );
    expect(route).toContain("requirePlatformOwner");
    expect(route).toContain("assertOwnerPayloadIsSafe");
    expect(route).toContain("export async function GET");
    expect(route).toContain("export async function POST");
    expect(route).not.toContain("export async function DELETE");
    expect(route).not.toContain("organisation_deletion_certificates");
    expect(() =>
      assertOwnerPayloadIsSafe({
        auditNonMinimised: 2,
        authUsersDeleted: false,
        certificateCreated: false,
      })
    ).not.toThrow();
    const page = read("app/owner/organisations/[id]/page.tsx");
    expect(page).not.toContain("/audit-reminimise");
    expect(page).not.toContain("Create deletion certificate");
  });
});
