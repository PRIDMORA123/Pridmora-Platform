import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertOwnerPayloadIsSafe } from "@/lib/owner/privacy";
import {
  APPLICATION_PURGE_CLAIM,
  FORBIDDEN_AUTH_USER_DELETION_APIS,
  FUTURE_FINALISATION_AUDIT_ACTIONS,
  MINIMISED_SUPPORT_CASE_SUBJECT,
  ORGANISATION_PURGE_MUST_NEVER_DELETE_AUTH_USERS,
  WRITE_MINIMISED_DELETION_LIFECYCLE_AUDIT_SQL,
  futureFinalisationAuditSourceIsContracted,
} from "@/lib/owner/organisation-purge-architecture";
import { RETAINED_COMMERCIAL_FORBIDDEN_SNAPSHOT_KEYS } from "@/lib/owner/organisation-deletion-foundation";
import {
  isDeletionCertificateIssuable,
  loadFinalVerificationState,
  finalVerificationSourceIsReadOnly,
} from "@/lib/owner/organisation-final-verification";
import {
  CERTIFICATE_COMPLETION_MIGRATION,
  CERTIFICATE_INVENTORY_SUMMARY_KEYS,
  OWNER_CERTIFICATE_AUTHORISATION,
  OWNER_ISSUE_ORGANISATION_DELETION_CERTIFICATE_RPC,
  certificateInventorySummaryIsOperational,
  deletionCertificateSqlIsSafe,
  issueOrganisationDeletionCertificate,
  ownerDeletionCertificateErrorMessage,
} from "@/lib/owner/organisation-deletion-certificate";

const root = process.cwd();
const MIGRATION = CERTIFICATE_COMPLETION_MIGRATION;
const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const RUN_ID = "99999999-9999-4999-8999-999999999999";
const OTHER_RUN = "88888888-8888-4888-8888-888888888888";

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

type RpcCall = { name: string; args: Record<string, unknown> };

function createClient(input?: {
  orgPresent?: boolean;
  noRun?: boolean;
  runFormerOrganisationId?: string;
  runId?: string;
  runStatus?: string;
  stage?: string;
  storageStatus?: string;
  verificationStatus?: string;
  certificateCount?: number;
  profileLinks?: number;
  rpcPayload?: Record<string, unknown> | null;
  rpcError?: string;
}): {
  client: SupabaseClient;
  writes: { insert: number; update: number; delete: number; rpc: number; remove: number };
  rpcCalls: RpcCall[];
} {
  const writes = { insert: 0, update: 0, delete: 0, rpc: 0, remove: 0 };
  const rpcCalls: RpcCall[] = [];
  const run = input?.noRun
    ? null
    : {
        id: input?.runId ?? RUN_ID,
        organisation_id: null,
        former_organisation_id: input?.runFormerOrganisationId ?? ORG_ID,
        organisation_name_snapshot: "Northwind",
        status: input?.runStatus ?? "verifying",
        stage: input?.stage ?? "awaiting_certificate",
        storage_status: input?.storageStatus ?? "passed",
        verification_status: input?.verificationStatus ?? "passed",
        inventory: DEFAULT_INVENTORY,
        last_error: null,
      };

  const client = {
    rpc(name: string, args: Record<string, unknown>) {
      writes.rpc += 1;
      rpcCalls.push({ name, args });
      if (input?.rpcError) {
        return Promise.resolve({ data: null, error: { message: input.rpcError } });
      }
      if (input?.rpcPayload && input.rpcPayload.ok === false) {
        return Promise.resolve({ data: input.rpcPayload, error: null });
      }
      return Promise.resolve({
        data: input?.rpcPayload ?? {
          ok: true,
          alreadyCompleted: false,
          certificateCreated: true,
          runCompleted: true,
          deletionRunId: RUN_ID,
          formerOrganisationId: ORG_ID,
          runStatus: "completed",
          stage: "awaiting_certificate",
          completedAt: "2026-08-27T22:00:00.000Z",
          commercialCopyVerificationStatus: "passed",
          storageCleanupStatus: "passed",
          commercialRetainedCount: 4,
          eligibleErasureClaim: APPLICATION_PURGE_CLAIM,
          backupStatus: "unknown",
          externalFollowUpStatus: "unknown",
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
          return { select() { return Promise.resolve({ data: null, error: { message: "insert forbidden" } }); } };
        },
        update() {
          writes.update += 1;
          return { eq() { return Promise.resolve({ error: { message: "update forbidden" } }); } };
        },
        delete() {
          writes.delete += 1;
          return { eq() { return Promise.resolve({ error: { message: "delete forbidden" } }); } };
        },
        async maybeSingle() {
          if (table === "organisations") {
            return { data: input?.orgPresent ? { id: ORG_ID } : null, error: null };
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
          resolve: (value: { data: unknown; count: number | null; error: null }) => unknown
        ) {
          if (table === "organisation_deletion_certificates") {
            return resolve({
              data: [],
              count: input?.certificateCount ?? 0,
              error: null,
            });
          }
          if (table === "profiles") {
            return resolve({ data: [], count: input?.profileLinks ?? 0, error: null });
          }
          if (table === "retained_organisation_commercial_records") {
            const recordType = filters.find(item => item[1] === "record_type")?.[2];
            if (recordType === "invoice") {
              return resolve({ data: [], count: 2, error: null });
            }
            if (recordType === "subscription" || recordType === "licence_snapshot") {
              return resolve({ data: [], count: 1, error: null });
            }
            return resolve({
              data: [{ record_type: "invoice", snapshot: { amount: 1 } }],
              count: 4,
              error: null,
            });
          }
          if (table === "support_cases") {
            const former = filters.find(item => item[1] === "former_organisation_id")?.[2];
            if (former === ORG_ID) {
              return resolve({
                data: [{
                  organisation_id: null,
                  former_organisation_id: ORG_ID,
                  user_id: null,
                  subject: MINIMISED_SUPPORT_CASE_SUBJECT,
                  description: "",
                  assigned_to: null,
                  resolution_notes: null,
                  created_by: null,
                }],
                count: 1,
                error: null,
              });
            }
            return resolve({ data: [], count: 0, error: null });
          }
          if (table === "platform_audit_events") {
            const former = filters.find(item => item[1] === "former_organisation_id")?.[2];
            if (former === ORG_ID) {
              return resolve({
                data: [{
                  organisation_id: null,
                  former_organisation_id: ORG_ID,
                  entity_type: "organisation_deletion_run",
                  entity_id: RUN_ID,
                  metadata: { deletionRunId: RUN_ID },
                }],
                count: 1,
                error: null,
              });
            }
            return resolve({ data: [], count: 0, error: null });
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
          download() {
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

  return { client: client as unknown as SupabaseClient, writes, rpcCalls };
}

async function issue(overrides?: Parameters<typeof createClient>[0] & {
  formerOrganisationId?: string;
  deletionRunId?: string;
  acknowledged?: boolean;
}) {
  const created = createClient(overrides);
  const result = await issueOrganisationDeletionCertificate({
    ownerSupabase: created.client,
    inventorySupabase: created.client,
    formerOrganisationId: overrides?.formerOrganisationId ?? ORG_ID,
    deletionRunId: overrides?.deletionRunId ?? RUN_ID,
    issueCertificateAcknowledged: overrides?.acknowledged ?? true,
  });
  return { result, writes: created.writes, rpcCalls: created.rpcCalls };
}

describe("DL-08 deletion certificate SQL contracts", () => {
  it("ships one completion RPC on the existing certificate table", () => {
    expect(existsSync(join(root, MIGRATION))).toBe(true);
    const sql = read(MIGRATION);
    expect(sql).toContain(OWNER_ISSUE_ORGANISATION_DELETION_CERTIFICATE_RPC);
    expect(sql).toContain("insert into public.organisation_deletion_certificates");
    expect(sql).not.toMatch(/create table if not exists public\.organisation_deletion_certificates/i);
    expect(sql).toContain("auth.uid()");
    expect(sql).toContain("is_platform_owner(v_user)");
    expect(sql).toContain("for update");
    expect(sql).toContain("status = 'verifying'");
    expect(sql).toContain("awaiting_certificate");
    expect(sql).toContain("status = 'completed'");
    expect(sql).toContain("completed_at = v_now");
    expect(sql).not.toContain("verification_status =");
    expect(deletionCertificateSqlIsSafe(sql)).toBe(true);
    expect(futureFinalisationAuditSourceIsContracted(sql)).toBe(true);
    expect(FUTURE_FINALISATION_AUDIT_ACTIONS).toEqual(["organisation.purge_completed"]);
    expect(sql).toContain(WRITE_MINIMISED_DELETION_LIFECYCLE_AUDIT_SQL);
    expect(sql).toContain("'organisation.purge_completed'");
    expect(sql).not.toMatch(
      /insert\s+into\s+public\.platform_audit_events[\s\S]{0,400}'organisation\.purge_completed'/
    );
    expect(sql).toContain("alreadyCompleted");
    expect(sql).toContain("INCONSISTENT_CERTIFICATE_STATE");
    expect(ORGANISATION_PURGE_MUST_NEVER_DELETE_AUTH_USERS).toBe(true);
    expect(FORBIDDEN_AUTH_USER_DELETION_APIS.every(api => !sql.includes(api))).toBe(true);
    expect(sql).not.toMatch(/from\s+auth\.users/i);
    expect(sql).not.toContain("COMPLETE ERASURE CONFIRMED");
    expect(sql).toContain("'unknown'");
    expect(sql).toContain("APPLICATION DATA PURGED");
    for (const key of RETAINED_COMMERCIAL_FORBIDDEN_SNAPSHOT_KEYS) {
      expect(sql).not.toContain(key);
    }
  });

  it("keeps inventory_summary operational and omits authUsersDeleted from audit metadata", () => {
    const sql = read(MIGRATION);
    const helperCall = sql.slice(
      sql.indexOf("perform public.write_minimised_deletion_lifecycle_audit")
    );
    const metadataBlock = helperCall.slice(0, helperCall.indexOf(");") + 2);
    expect(metadataBlock).not.toContain("authUsersDeleted");
    expect(
      certificateInventorySummaryIsOperational({
        formerOrganisationId: ORG_ID,
        deletionRunId: RUN_ID,
        runStatus: "completed",
        stage: "awaiting_certificate",
        storageCleanupStatus: "passed",
        backupStatus: "unknown",
        externalFollowUpStatus: "unknown",
        commercialRetainedCount: 1,
        eligibleErasureClaim: APPLICATION_PURGE_CLAIM,
      })
    ).toBe(true);
    expect(
      certificateInventorySummaryIsOperational({
        formerOrganisationId: ORG_ID,
        privateNotes: "secret",
      })
    ).toBe(false);
    expect(CERTIFICATE_INVENTORY_SUMMARY_KEYS).not.toContain("authUsersDeleted");
  });
});

describe("DL-08 deletion certificate issuance gates", () => {
  it("rejects missing acknowledgement without calling the RPC", async () => {
    const { result, writes } = await issue({ acknowledged: false });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("ACKNOWLEDGEMENT_REQUIRED");
      expect(result.certificateCreated).toBe(false);
      expect(result.runCompleted).toBe(false);
      expect(result.authUsersDeleted).toBe(false);
    }
    expect(writes.rpc).toBe(0);
    expect(ownerDeletionCertificateErrorMessage("ACKNOWLEDGEMENT_REQUIRED")).toMatch(
      /application-data purge completion/i
    );
  });

  it("rejects a missing or mismatched deletion run", async () => {
    const missing = await issue({ noRun: true });
    expect(missing.result.ok).toBe(false);
    if (!missing.result.ok) expect(missing.result.code).toBe("RUN_NOT_FOUND");
    expect(missing.writes.rpc).toBe(0);

    const wrongOrg = await issue({ formerOrganisationId: ORG_B });
    expect(wrongOrg.result.ok).toBe(false);
    if (!wrongOrg.result.ok) expect(wrongOrg.result.code).toBe("RUN_NOT_FOUND");

    const wrongRun = await issue({ deletionRunId: OTHER_RUN });
    expect(wrongRun.result.ok).toBe(false);
    if (!wrongRun.result.ok) expect(wrongRun.result.code).toBe("INCONSISTENT_RUN");
    expect(wrongRun.writes.rpc).toBe(0);
  });

  it("requires verifying / awaiting_certificate and a passing fresh Slice 4A result", async () => {
    const state = await issue({ runStatus: "purged", stage: "db_purged" });
    expect(state.result.ok).toBe(false);
    if (!state.result.ok) expect(state.result.code).toBe("RUN_STATE_NOT_ALLOWED");
    expect(state.writes.rpc).toBe(0);

    const orgPresent = await issue({ orgPresent: true });
    expect(orgPresent.result.ok).toBe(false);
    if (!orgPresent.result.ok) expect(orgPresent.result.code).toBe("ORGANISATION_ROW_REMAINS");
    expect(orgPresent.writes.rpc).toBe(0);

    const blocked = await issue({ profileLinks: 2 });
    expect(blocked.result.ok).toBe(false);
    if (!blocked.result.ok) expect(blocked.result.code).toBe("VERIFICATION_NOT_PASSED");
    expect(blocked.writes.rpc).toBe(0);
  });

  it("issues the certificate from freshly verified Storage and retained-commercial totals", async () => {
    const { result, writes, rpcCalls } = await issue();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.certificateCreated).toBe(true);
      expect(result.runCompleted).toBe(true);
      expect(result.runStatus).toBe("completed");
      expect(result.eligibleErasureClaim).toBe(APPLICATION_PURGE_CLAIM);
      expect(result.authUsersDeleted).toBe(false);
      expect(result.backupStatus).toBe("unknown");
      expect(result.externalFollowUpStatus).toBe("unknown");
      expect(result.commercialCopyVerificationStatus).toBe("passed");
      expect(result.storageCleanupStatus).toBe("passed");
      expect(result.commercialRetainedCount).toBe(4);
      expect(result.organisationRowAbsent).toBe(true);
    }
    expect(writes.rpc).toBe(1);
    expect(writes.insert).toBe(0);
    expect(writes.delete).toBe(0);
    expect(writes.remove).toBe(0);
    expect(rpcCalls[0]?.name).toBe(OWNER_ISSUE_ORGANISATION_DELETION_CERTIFICATE_RPC);
    expect(rpcCalls[0]?.args).toEqual({
      p_former_organisation_id: ORG_ID,
      p_deletion_run_id: RUN_ID,
      p_storage_cleanup_status: "passed",
      p_commercial_retained_count: 4,
    });
    expect(() => assertOwnerPayloadIsSafe(result)).not.toThrow();
    expect(JSON.stringify(result)).not.toMatch(/privateNotes|transcript|coaching|preparation/i);
  });

  it("treats an already completed certificate as success/no-op and fails inconsistent state", async () => {
    const retry = await issue({
      runStatus: "completed",
      certificateCount: 1,
      rpcPayload: {
        ok: true,
        alreadyCompleted: true,
        certificateCreated: false,
        runCompleted: true,
        deletionRunId: RUN_ID,
        runStatus: "completed",
        stage: "awaiting_certificate",
        completedAt: "2026-08-27T22:00:00.000Z",
        commercialCopyVerificationStatus: "passed",
        storageCleanupStatus: "passed",
        commercialRetainedCount: 4,
      },
    });
    expect(retry.result.ok).toBe(true);
    if (retry.result.ok) {
      expect(retry.result.alreadyCompleted).toBe(true);
      expect(retry.result.certificateCreated).toBe(false);
      expect(retry.result.runCompleted).toBe(true);
    }
    expect(retry.writes.rpc).toBe(1);

    const inconsistent = await issue({
      runStatus: "verifying",
      certificateCount: 1,
    });
    expect(inconsistent.result.ok).toBe(false);
    if (!inconsistent.result.ok) {
      expect(inconsistent.result.code).toBe("INCONSISTENT_CERTIFICATE_STATE");
    }
    expect(inconsistent.writes.rpc).toBe(0);

    const completedWithoutCert = await issue({
      runStatus: "completed",
      certificateCount: 0,
    });
    expect(completedWithoutCert.result.ok).toBe(false);
    if (!completedWithoutCert.result.ok) {
      expect(completedWithoutCert.result.code).toBe("INCONSISTENT_CERTIFICATE_STATE");
    }
  });
});

describe("DL-08 deletion certificate Owner API, UI, and issuance flags", () => {
  it("authorises POST only, requires acknowledgement, and never accepts verification booleans", () => {
    const route = read(
      "app/api/owner/organisations/[id]/deletion-certificate/route.ts"
    );
    expect(route).toContain("requirePlatformOwner");
    expect(route).toContain("assertOwnerPayloadIsSafe");
    expect(route).toContain("export async function POST");
    expect(route).not.toContain("export async function GET");
    expect(route).not.toContain("export async function PATCH");
    expect(route).toContain("issueCertificateAcknowledged");
    expect(route).toContain("issueOrganisationDeletionCertificate");
    const lib = read("lib/owner/organisation-deletion-certificate.ts");
    expect(lib).toContain("loadFinalVerificationState");
    expect(lib).toContain("p_storage_cleanup_status");
    expect(lib).toContain("p_commercial_retained_count");
    expect(route).not.toContain("purgeReady");
    expect(route).not.toContain("certificateIssuable:");
    expect(route).not.toContain("finalVerificationResult:");
    expect(route).not.toMatch(/auth\.admin\.deleteUser/);
    expect(route).not.toContain('from("auth.users")');
    expect(OWNER_CERTIFICATE_AUTHORISATION.freshFinalVerificationRequired).toBe(true);
  });

  it("derives certificateIssuable only for a freshly passing pre-completion state", async () => {
    expect(
      isDeletionCertificateIssuable({
        finalVerificationResult: "passed",
        blockingReasons: [],
        runStatus: "verifying",
        stage: "awaiting_certificate",
        organisationRowAbsent: true,
        certificateExists: false,
        runCompleted: false,
      })
    ).toBe(true);
    expect(
      isDeletionCertificateIssuable({
        finalVerificationResult: "failed",
        blockingReasons: [{ code: "RESIDUAL_TENANT_ROWS" }],
        runStatus: "verifying",
        stage: "awaiting_certificate",
        organisationRowAbsent: true,
        certificateExists: false,
        runCompleted: false,
      })
    ).toBe(false);
    expect(
      isDeletionCertificateIssuable({
        finalVerificationResult: "passed",
        blockingReasons: [],
        runStatus: "completed",
        stage: "awaiting_certificate",
        organisationRowAbsent: true,
        certificateExists: true,
        runCompleted: true,
      })
    ).toBe(false);

    const created = createClient();
    const passing = await loadFinalVerificationState({
      ownerSupabase: created.client,
      inventorySupabase: created.client,
      formerOrganisationId: ORG_ID,
    });
    expect(passing.certificateIssuable).toBe(true);
    expect(passing.certificateCreated).toBe(false);
    expect(passing.runCompleted).toBe(false);

    const completedClient = createClient({
      runStatus: "completed",
      certificateCount: 1,
    });
    const completed = await loadFinalVerificationState({
      ownerSupabase: completedClient.client,
      inventorySupabase: completedClient.client,
      formerOrganisationId: ORG_ID,
    });
    expect(completed.certificateExists).toBe(true);
    expect(completed.runCompleted).toBe(true);
    expect(completed.certificateIssuable).toBe(false);
    expect(completed.eligibleErasureClaim).toBe(APPLICATION_PURGE_CLAIM);
  });

  it("keeps Slice 4A GET read-only and hides Issue after completion in the Owner Console", () => {
    const getRoute = read(
      "app/api/owner/organisations/[id]/final-verification/route.ts"
    );
    const getLib = read("lib/owner/organisation-final-verification.ts");
    expect(finalVerificationSourceIsReadOnly(getRoute)).toBe(true);
    expect(finalVerificationSourceIsReadOnly(getLib)).toBe(true);
    expect(getRoute).not.toContain("export async function POST");

    const page = read("app/owner/organisations/[id]/page.tsx");
    expect(page).toContain("Issue deletion certificate");
    expect(page).toContain("certificateIssuable");
    expect(page).toContain("does not certify complete erasure");
    expect(page).toContain("Auth users are not deleted");
    expect(page).toContain("Backup");
    expect(page).toContain("unknown");
    expect(page).toContain("completed || props.succeeded");
    expect(page).not.toContain("Create deletion certificate");
    expect(page).not.toContain("COMPLETE ERASURE CONFIRMED");
    expect(page).toContain("/deletion-certificate");
  });
});
