import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertOwnerPayloadIsSafe } from "@/lib/owner/privacy";
import {
  AUTHORITATIVE_STORAGE_BUCKET,
  COMMERCIAL_LIVE_TABLES,
  FORBIDDEN_AUTH_USER_DELETION_APIS,
  MINIMISED_SUPPORT_CASE_SUBJECT,
  ORGANISATION_PURGE_MUST_NEVER_DELETE_AUTH_USERS,
  TENANT_PURGE_RESIDUAL_SURFACES,
  tenantPurgeResidualAttribution,
  tenantPurgeResidualTables,
} from "@/lib/owner/organisation-purge-architecture";
import {
  evaluateStorageFinalVerification,
  explicitEmptyStorageCaptureProven,
  FINAL_VERIFICATION_VERSION,
  finalVerificationSourceIsReadOnly,
  loadFinalVerificationState,
  residualSurfaceEvidenceKind,
  storageCaptureWasPerformed,
} from "@/lib/owner/organisation-final-verification";

const root = process.cwd();
const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const RUN_ID = "99999999-9999-4999-8999-999999999999";
const CAPTURED_PATH = `${ORG_ID}/cccccccc-cccc-4ccc-8ccc-cccccccccccc/abcd1234-file.pdf`;

function read(pathFromRoot: string): string {
  return readFileSync(join(root, pathFromRoot), "utf8");
}

const DEFAULT_INVENTORY = {
  commercialRetention: {
    sources: [
      { recordType: "invoice", retainedCount: 2 },
      { recordType: "subscription", retainedCount: 1 },
      { recordType: "licence_snapshot", retainedCount: 1 },
    ],
  },
};

const MINIMISED_SUPPORT = {
  organisation_id: null,
  former_organisation_id: ORG_ID,
  user_id: null,
  subject: MINIMISED_SUPPORT_CASE_SUBJECT,
  description: "",
  assigned_to: null,
  resolution_notes: null,
  created_by: null,
};

const MINIMISED_AUDIT = {
  organisation_id: null,
  former_organisation_id: ORG_ID,
  entity_type: "organisation_deletion_run",
  entity_id: RUN_ID,
  metadata: { deletionRunId: RUN_ID },
};

type ManifestRow = {
  id: string;
  bucket: string;
  object_path: string;
  deleted_at: string | null;
  verified_absent_at: string | null;
};

type Writes = {
  insert: number;
  update: number;
  delete: number;
  upsert: number;
  rpc: number;
  remove: number;
  download: number;
};

function createClient(input?: {
  orgPresent?: boolean;
  noRun?: boolean;
  runFormerOrganisationId?: string;
  runStatus?: string;
  stage?: string;
  storageStatus?: string | null;
  verificationStatus?: string;
  inventory?: unknown;
  manifestRows?: ManifestRow[];
  present?: Set<string>;
  prefixTop?: Array<{ name: string; id?: string | null; metadata?: object | null }>;
  nested?: Record<string, Array<{ name: string }>>;
  listError?: boolean;
  residualCounts?: Record<string, number>;
  profileLinks?: number;
  commercialCounts?: Partial<Record<(typeof COMMERCIAL_LIVE_TABLES)[number], number>>;
  retainedByType?: Record<string, number>;
  retainedSnapshots?: Array<{ record_type: string; snapshot: Record<string, unknown> }>;
  supportPending?: number;
  supportRows?: unknown[];
  auditPending?: number;
  auditRows?: unknown[];
  otherOrgResidual?: number;
  certificateCount?: number;
}): { client: SupabaseClient; writes: Writes; buckets: string[] } {
  const writes: Writes = {
    insert: 0,
    update: 0,
    delete: 0,
    upsert: 0,
    rpc: 0,
    remove: 0,
    download: 0,
  };
  const buckets: string[] = [];
  const present = input?.present ?? new Set<string>();
  const retainedByType = input?.retainedByType ?? {
    invoice: 2,
    subscription: 1,
    licence_snapshot: 1,
  };
  const run = input?.noRun
    ? null
    : {
        id: RUN_ID,
        organisation_id: null,
        former_organisation_id: input?.runFormerOrganisationId ?? ORG_ID,
        organisation_name_snapshot: "Northwind",
        status: input?.runStatus ?? "verifying",
        stage: input?.stage ?? "awaiting_certificate",
        storage_status: input?.storageStatus === undefined ? "passed" : input.storageStatus,
        verification_status: input?.verificationStatus ?? "passed",
        inventory: input?.inventory ?? DEFAULT_INVENTORY,
        last_error: null,
      };

  const client = {
    rpc() {
      writes.rpc += 1;
      return Promise.resolve({ data: null, error: { message: "rpc forbidden" } });
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
        neq(column: string, value: unknown) {
          filters.push(["neq", column, value]);
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
        insert() {
          writes.insert += 1;
          return {
            select() {
              return Promise.resolve({ data: null, error: { message: "insert forbidden" } });
            },
          };
        },
        update() {
          writes.update += 1;
          return {
            eq() {
              return Promise.resolve({ error: { message: "update forbidden" } });
            },
          };
        },
        upsert() {
          writes.upsert += 1;
          return Promise.resolve({ error: { message: "upsert forbidden" } });
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
            return {
              data: input?.orgPresent ? { id: ORG_ID } : null,
              error: null,
            };
          }
          if (table === "organisation_deletion_runs") {
            const former = filters.find(item => item[1] === "former_organisation_id")?.[2];
            if (!run || former !== run.former_organisation_id) {
              return { data: null, error: null };
            }
            const neqStatus = filters
              .filter(item => item[0] === "neq" && item[1] === "status")
              .map(item => item[2]);
            const eqStatus = filters.find(
              item => item[0] === "eq" && item[1] === "status"
            )?.[2];
            if (neqStatus.includes(run.status)) {
              return { data: null, error: null };
            }
            if (eqStatus && eqStatus !== run.status) {
              return { data: null, error: null };
            }
            return { data: run, error: null };
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
          const eq = (column: string) =>
            filters.find(item => item[0] === "eq" && item[1] === column)?.[2];
          const scopedOrg =
            (eq("organisation_id") as string | undefined) ??
            (eq("current_organisation_id") as string | undefined) ??
            (eq("former_organisation_id") as string | undefined);
          if (scopedOrg && scopedOrg !== ORG_ID) {
            return resolve({
              data: [],
              count: input?.otherOrgResidual ?? 9,
              error: null,
            });
          }

          if (table === "organisation_deletion_certificates") {
            return resolve({
              data: [],
              count: input?.certificateCount ?? 0,
              error: null,
            });
          }
          if (table === "organisation_deletion_storage_manifest") {
            const runId = eq("deletion_run_id");
            const rows = runId === RUN_ID ? (input?.manifestRows ?? []) : [];
            return resolve({ data: rows, count: rows.length, error: null });
          }
          if (table === "retained_organisation_commercial_records") {
            const runId = eq("deletion_run_id");
            const recordType = eq("record_type");
            if (runId && runId !== RUN_ID) {
              return resolve({ data: [], count: 0, error: null });
            }
            if (typeof recordType === "string") {
              return resolve({
                data: [],
                count: retainedByType[recordType] ?? 0,
                error: null,
              });
            }
            const snapshots = input?.retainedSnapshots ?? [
              { record_type: "invoice", snapshot: { id: "inv-1", amount: 100 } },
              { record_type: "invoice", snapshot: { id: "inv-2", amount: 50 } },
              { record_type: "subscription", snapshot: { plan: "team" } },
              { record_type: "licence_snapshot", snapshot: { planName: "team" } },
            ];
            const total = Object.values(retainedByType).reduce((sum, n) => sum + n, 0);
            return resolve({ data: snapshots, count: total, error: null });
          }
          if (table === "support_cases") {
            if (eq("former_organisation_id") === ORG_ID) {
              const rows = input?.supportRows ?? [MINIMISED_SUPPORT];
              return resolve({ data: rows, count: rows.length, error: null });
            }
            return resolve({
              data: [],
              count: input?.supportPending ?? 0,
              error: null,
            });
          }
          if (table === "platform_audit_events") {
            if (eq("former_organisation_id") === ORG_ID) {
              const rows = input?.auditRows ?? [MINIMISED_AUDIT];
              return resolve({ data: rows, count: rows.length, error: null });
            }
            return resolve({
              data: [],
              count: input?.auditPending ?? 0,
              error: null,
            });
          }
          if (table === "profiles") {
            return resolve({
              data: [],
              count: input?.profileLinks ?? 0,
              error: null,
            });
          }
          if ((COMMERCIAL_LIVE_TABLES as readonly string[]).includes(table)) {
            const counts = input?.commercialCounts ?? {};
            return resolve({
              data: [],
              count: counts[table as keyof typeof counts] ?? 0,
              error: null,
            });
          }
          if (table === "clients" || table === "sessions" || table === "organisation_intelligence_snapshots") {
            return resolve({ data: [], count: 0, error: null });
          }
          if (table === "organisation_migration_review" || table === "relationship_assignments") {
            return resolve({ data: [], count: 0, error: null });
          }
          return resolve({
            data: [],
            count: input?.residualCounts?.[table] ?? 0,
            error: null,
          });
        },
      };
      return builder;
    },
    storage: {
      from(bucket: string) {
        buckets.push(bucket);
        return {
          list(parent: string, opts?: { search?: string }) {
            if (input?.listError) {
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
                data: input?.prefixTop ?? [],
                error: null,
              });
            }
            return Promise.resolve({
              data: input?.nested?.[parent] ?? [],
              error: null,
            });
          },
          download() {
            writes.download += 1;
            return Promise.resolve({ data: null, error: { message: "download forbidden" } });
          },
          remove() {
            writes.remove += 1;
            return Promise.resolve({ data: null, error: { message: "remove forbidden" } });
          },
        };
      },
    },
  };

  return { client: client as unknown as SupabaseClient, writes, buckets };
}

async function load(overrides?: Parameters<typeof createClient>[0]) {
  const created = createClient(overrides);
  const state = await loadFinalVerificationState({
    ownerSupabase: created.client,
    inventorySupabase: created.client,
    formerOrganisationId: ORG_ID,
  });
  return { state, writes: created.writes, buckets: created.buckets };
}

describe("DL-08 Slice 4A storage empty-capture proof", () => {
  it("does not treat zero manifest rows as Storage verification without capture", () => {
    expect(
      explicitEmptyStorageCaptureProven({ capturedCount: 0, capturePerformed: false })
    ).toBe(false);
    expect(
      storageCaptureWasPerformed({
        stage: "awaiting_certificate",
        storageStatus: "not_started",
      })
    ).toBe(false);
    const missing = evaluateStorageFinalVerification({
      manifestLoadFailed: false,
      capturePerformed: false,
      capturedCount: 0,
      pendingOrUnverifiedCount: 0,
      capturedObjectsAbsent: true,
      prefixListed: true,
      prefixRemainderCount: 0,
    });
    expect(missing.passed).toBe(false);
    expect(missing.explicitEmptyCapture).toBe(false);
    expect(missing.codes).toContain("STORAGE_CAPTURE_NOT_PERFORMED");
  });

  it("accepts an authoritative empty capture and fails unverified rows or prefix remainder", () => {
    expect(
      storageCaptureWasPerformed({
        stage: "awaiting_certificate",
        storageStatus: "passed",
      })
    ).toBe(true);
    const empty = evaluateStorageFinalVerification({
      manifestLoadFailed: false,
      capturePerformed: true,
      capturedCount: 0,
      pendingOrUnverifiedCount: 0,
      capturedObjectsAbsent: true,
      prefixListed: true,
      prefixRemainderCount: 0,
    });
    expect(empty.explicitEmptyCapture).toBe(true);
    expect(empty.passed).toBe(true);

    const unverified = evaluateStorageFinalVerification({
      manifestLoadFailed: false,
      capturePerformed: true,
      capturedCount: 1,
      pendingOrUnverifiedCount: 1,
      capturedObjectsAbsent: true,
      prefixListed: true,
      prefixRemainderCount: 0,
    });
    expect(unverified.passed).toBe(false);
    expect(unverified.codes).toContain("STORAGE_NOT_VERIFIED_ABSENT");

    const remainder = evaluateStorageFinalVerification({
      manifestLoadFailed: false,
      capturePerformed: true,
      capturedCount: 0,
      pendingOrUnverifiedCount: 0,
      capturedObjectsAbsent: true,
      prefixListed: true,
      prefixRemainderCount: 1,
    });
    expect(remainder.passed).toBe(false);
    expect(remainder.codes).toContain("STORAGE_PREFIX_REMAINDER");
  });
});

describe("DL-08 Slice 4A independent final verification GET", () => {
  it("verifies a former organisation after the organisations row is gone", async () => {
    const { state, writes, buckets } = await load();
    expect(state.organisationRowAbsent).toBe(true);
    expect(state.organisationNameSnapshot).toBe("Northwind");
    expect(state.formerOrganisationId).toBe(ORG_ID);
    expect(state.deletionRunId).toBe(RUN_ID);
    expect(state.finalVerificationResult).toBe("passed");
    expect(state.commercialCopyVerificationStatus).toBe("passed");
    expect(state.verificationVersion).toBe(FINAL_VERIFICATION_VERSION);
    expect(state.certificateCreated).toBe(false);
    expect(state.certificateIssuable).toBe(true);
    expect(state.runCompleted).toBe(false);
    expect(state.authUsersDeleted).toBe(false);
    expect(state.authStatement).toBe(
      "this deletion process does not delete Auth users"
    );
    expect(state.backupStatus).toBe("unknown");
    expect(state.externalFollowUpStatus).toBe("unknown");
    expect(state.eligibleErasureClaim).toBe("APPLICATION DATA PURGED");
    expect(writes).toEqual({
      insert: 0,
      update: 0,
      delete: 0,
      upsert: 0,
      rpc: 0,
      remove: 0,
      download: 0,
    });
    expect(buckets.every(bucket => bucket === AUTHORITATIVE_STORAGE_BUCKET)).toBe(
      true
    );
    expect(() => assertOwnerPayloadIsSafe(state)).not.toThrow();
    expect(JSON.stringify(state)).not.toContain(CAPTURED_PATH);
    expect(JSON.stringify(state)).not.toMatch(
      /privateNotes|transcript|coaching notes|preparation/i
    );
  });

  it("covers every manifest residual surface as live reverification or bound Slice 3 evidence", async () => {
    const { state } = await load();
    const live = new Set(state.liveResiduals.map(item => item.table));
    const bound = new Set(state.boundSlice3Evidence.map(item => item.table));
    for (const surface of TENANT_PURGE_RESIDUAL_SURFACES) {
      const kind = tenantPurgeResidualAttribution(surface);
      expect(kind).not.toBeNull();
      if (kind === "organisation_id" || kind === "current_organisation_id" || kind === "organisation_pk") {
        expect(live.has(surface.table)).toBe(true);
        expect(
          state.liveResiduals.find(item => item.table === surface.table)?.evidence
        ).toBe("freshly_reverified");
        expect(residualSurfaceEvidenceKind(kind)).toBe("freshly_reverified");
      } else if (kind) {
        expect(bound.has(surface.table)).toBe(true);
        expect(
          state.boundSlice3Evidence.find(item => item.table === surface.table)
            ?.independentReverification
        ).toBe("not_available_parents_deleted");
        expect(residualSurfaceEvidenceKind(kind)).toBe("bound_slice3_execution");
      }
    }
    expect(live.has("profiles")).toBe(true);
    expect(live.has("organisations")).toBe(true);
    expect(
      tenantPurgeResidualTables("organisation_id").every(table => live.has(table))
    ).toBe(true);
    expect(state.liveResiduals.every(item => item.passed)).toBe(true);
    expect(state.liveCommercial.map(item => item.table).sort()).toEqual(
      [...COMMERCIAL_LIVE_TABLES].sort()
    );
    expect(state.liveCommercial.every(item => item.passed)).toBe(true);
  });

  it("fails profiles current_organisation_id links, organisation row presence, and live commercial rows", async () => {
    const profiles = await load({ profileLinks: 2 });
    expect(profiles.state.finalVerificationResult).toBe("failed");
    expect(profiles.state.blockingReasons.map(item => item.code)).toContain(
      "RESIDUAL_TENANT_ROWS"
    );
    expect(profiles.state.certificateIssuable).toBe(false);

    const orgRow = await load({ orgPresent: true });
    expect(orgRow.state.organisationRowAbsent).toBe(false);
    expect(orgRow.state.blockingReasons.map(item => item.code)).toContain(
      "ORGANISATION_ROW_REMAINS"
    );
    expect(orgRow.state.certificateIssuable).toBe(false);

    const commercial = await load({
      commercialCounts: { invoices: 1 },
    });
    expect(commercial.state.liveCommercial.find(item => item.table === "invoices")?.passed).toBe(
      false
    );
    expect(commercial.state.blockingReasons.map(item => item.code)).toContain(
      "LIVE_COMMERCIAL_REMAINS"
    );
  });

  it("verifies retained commercial counts against the DL-06 inventory and rejects coaching keys", async () => {
    const ok = await load();
    expect(ok.state.retainedCommercial.countsMatch).toBe(true);
    expect(ok.state.retainedCommercial.expectedTotal).toBe(4);
    expect(ok.state.retainedCommercial.actualTotal).toBe(4);
    expect(ok.state.retainedCommercial.coachingContentAbsent).toBe(true);

    const mismatch = await load({ retainedByType: { invoice: 1, subscription: 1, licence_snapshot: 1 } });
    expect(mismatch.state.retainedCommercial.countsMatch).toBe(false);
    expect(mismatch.state.blockingReasons.map(item => item.code)).toContain(
      "RETAINED_COMMERCIAL_MISMATCH"
    );

    const coaching = await load({
      retainedSnapshots: [
        {
          record_type: "invoice",
          snapshot: { id: "inv-1", privateNotes: "coaching reflection" },
        },
      ],
    });
    expect(coaching.state.retainedCommercial.coachingContentAbsent).toBe(false);
    expect(coaching.state.finalVerificationResult).toBe("failed");
    expect(JSON.stringify(coaching.state)).not.toContain("coaching reflection");
  });

  it("verifies retained support and audit minimisation predicates", async () => {
    const ok = await load();
    expect(ok.state.retainedSupportAudit.passed).toBe(true);
    expect(ok.state.retainedSupportAudit.supportPending).toBe(0);
    expect(ok.state.retainedSupportAudit.auditPending).toBe(0);
    expect(ok.state.retainedSupportAudit.supportNonMinimised).toBe(0);

    const pending = await load({ supportPending: 1 });
    expect(pending.state.retainedSupportAudit.passed).toBe(false);
    expect(pending.state.blockingReasons.map(item => item.code)).toContain(
      "RETAIN_MINIMISE_INCOMPLETE"
    );

    const dirty = await load({
      supportRows: [
        {
          organisation_id: null,
          former_organisation_id: ORG_ID,
          user_id: null,
          subject: "Confidential coaching notes",
          description: "session transcript",
          assigned_to: null,
          resolution_notes: null,
          created_by: null,
        },
      ],
    });
    expect(dirty.state.retainedSupportAudit.supportNonMinimised).toBe(1);
    expect(dirty.state.retainedSupportAudit.passed).toBe(false);
    expect(JSON.stringify(dirty.state)).not.toContain("Confidential coaching notes");
    expect(JSON.stringify(dirty.state)).not.toContain("session transcript");
  });

  it("fails missing Storage capture, unverified manifest rows, and prefix remainder", async () => {
    const missing = await load({
      storageStatus: "not_started",
      manifestRows: [],
    });
    expect(missing.state.storage.capturePerformed).toBe(false);
    expect(missing.state.storage.explicitEmptyCapture).toBe(false);
    expect(missing.state.storage.passed).toBe(false);
    expect(missing.state.blockingReasons.map(item => item.code)).toContain(
      "STORAGE_CAPTURE_NOT_PERFORMED"
    );

    const unverified = await load({
      manifestRows: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          bucket: AUTHORITATIVE_STORAGE_BUCKET,
          object_path: CAPTURED_PATH,
          deleted_at: "2026-08-27T00:00:00.000Z",
          verified_absent_at: null,
        },
      ],
    });
    expect(unverified.state.storage.pendingOrUnverifiedCount).toBe(1);
    expect(unverified.state.storage.passed).toBe(false);
    expect(unverified.state.blockingReasons.map(item => item.code)).toContain(
      "STORAGE_NOT_VERIFIED_ABSENT"
    );
    expect(JSON.stringify(unverified.state)).not.toContain(CAPTURED_PATH);

    const remainder = await load({
      prefixTop: [{ name: "orphan.bin", id: "obj", metadata: { size: 1 } }],
    });
    expect(remainder.state.storage.prefixRemainderCount).toBe(1);
    expect(remainder.state.storage.passed).toBe(false);
    expect(remainder.state.blockingReasons.map(item => item.code)).toContain(
      "STORAGE_PREFIX_REMAINDER"
    );
  });

  it("lists Storage objects only and never downloads or deletes them", async () => {
    const captured = await load({
      manifestRows: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          bucket: AUTHORITATIVE_STORAGE_BUCKET,
          object_path: CAPTURED_PATH,
          deleted_at: "2026-08-27T00:00:00.000Z",
          verified_absent_at: "2026-08-27T00:00:01.000Z",
        },
      ],
    });
    expect(captured.writes.download).toBe(0);
    expect(captured.writes.remove).toBe(0);
    expect(captured.buckets).not.toContain("documents-openai");
    expect(captured.state.storage.capturedCount).toBe(1);
    expect(captured.state.storage.verifiedAbsentCount).toBe(1);
    expect(captured.state.storage.explicitEmptyCapture).toBe(false);
  });

  it("rejects the wrong former organisation and isolates another tenant's residuals", async () => {
    const created = createClient();
    const wrong = await loadFinalVerificationState({
      ownerSupabase: created.client,
      inventorySupabase: created.client,
      formerOrganisationId: ORG_B,
    });
    expect(wrong.finalVerificationResult).toBe("not_ready");
    expect(wrong.blockingReasons.map(item => item.code)).toContain("RUN_NOT_FOUND");
    expect(wrong.deletionRunId).toBeNull();

    const isolated = await load({
      residualCounts: { coaching_moments: 0 },
      otherOrgResidual: 12,
    });
    expect(
      isolated.state.liveResiduals.every(item => item.remainingCount === 0)
    ).toBe(true);
    expect(isolated.state.finalVerificationResult).toBe("passed");
  });

  it("does not treat another deletion run's retained commercial rows as this run", async () => {
    const { state } = await load();
    expect(state.deletionRunId).toBe(RUN_ID);
    expect(state.retainedCommercial.actualTotal).toBe(4);
    const otherRunClient = createClient({
      retainedByType: { invoice: 99, subscription: 99, licence_snapshot: 99 },
    });
    const other = await loadFinalVerificationState({
      ownerSupabase: otherRunClient.client,
      inventorySupabase: otherRunClient.client,
      formerOrganisationId: ORG_B,
    });
    expect(other.retainedCommercial.actualTotal).toBe(0);
    expect(other.deletionRunId).toBeNull();
  });

  it("never overloads commercial verification_status and never creates a certificate or completes the run", async () => {
    const failed = await load({ profileLinks: 1 });
    expect(failed.state.commercialCopyVerificationStatus).toBe("passed");
    expect(failed.state.finalVerificationResult).toBe("failed");
    expect(failed.state.certificateCreated).toBe(false);
    expect(failed.state.runCompleted).toBe(false);
    expect(failed.writes.insert).toBe(0);
    expect(failed.writes.update).toBe(0);
  });
});

describe("DL-08 Slice 4A Owner Console, privacy, and contracts", () => {
  it("renders former-org lifecycle from the deletion run without restoring the organisations row", () => {
    const detail = read("app/api/owner/organisations/[id]/route.ts");
    expect(detail).toContain("formerOrganisationLifecycle");
    expect(detail).toContain("organisation_name_snapshot");
    expect(detail).toContain("former_organisation_id");
    expect(detail).not.toMatch(/\.insert\s*\(/);
    expect(detail).not.toContain("Issue deletion certificate");

    const page = read("app/owner/organisations/[id]/page.tsx");
    expect(page).toContain("FinalVerificationPanel");
    expect(page).toContain("Deletion certificate");
    expect(page).toContain("organisationNameSnapshot");
    expect(page).toContain("formerOrganisationLifecycle");
    expect(page).toContain("Issue deletion certificate");
    expect(page).toContain("certificateIssuable");
    expect(page).toContain("does not certify complete erasure");
    expect(page).not.toContain("Create deletion certificate");
    expect(page).toContain(
      "controls are not available after those stages complete"
    );
  });

  it("authorises GET, forbids POST, and keeps the payload privacy-safe", () => {
    const route = read(
      "app/api/owner/organisations/[id]/final-verification/route.ts"
    );
    const lib = read("lib/owner/organisation-final-verification.ts");
    expect(route).toContain("requirePlatformOwner");
    expect(route).toContain("assertOwnerPayloadIsSafe");
    expect(route).toContain("export async function GET");
    expect(route).not.toContain("export async function POST");
    expect(route).not.toContain("export async function PATCH");
    expect(finalVerificationSourceIsReadOnly(lib)).toBe(true);
    expect(finalVerificationSourceIsReadOnly(route)).toBe(true);
    expect(lib).not.toContain("documents-openai");
    expect(route).not.toContain("documents-openai");
    expect(lib).not.toMatch(/auth\.admin\.deleteUser\s*\(/);
    expect(lib).not.toMatch(/from\("auth\.users"\)/);
    expect(ORGANISATION_PURGE_MUST_NEVER_DELETE_AUTH_USERS).toBe(true);
    expect(FORBIDDEN_AUTH_USER_DELETION_APIS).toContain("auth.admin.deleteUser");
    expect(
      existsSync(
        join(root, "app/api/owner/organisations/[id]/deletion-certificate/route.ts")
      )
    ).toBe(true);
  });
});
