import { describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ORGANISATION_PERMISSIONS } from "@/lib/organisations/types";
import { hasPermission } from "@/lib/organisations/permissions";
import { assertOwnerPayloadIsSafe } from "@/lib/owner/privacy";
import {
  COMMERCIAL_COPIED_RUN_STATUS,
  COMMERCIAL_COPIED_STAGE,
  OWNER_COPY_ORGANISATION_COMMERCIAL_RPC,
  PURGE_READINESS_RESULTS,
  copyOrganisationCommercialRecords,
  derivePurgeReadiness,
  loadCommercialRetentionState,
} from "@/lib/owner/organisation-commercial-retention";

const root = process.cwd();
const MIGRATION =
  "supabase/migrations/20260827230000_organisation_commercial_retention.sql";
const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const RUN_ID = "99999999-9999-4999-8999-999999999999";
const OTHER_RUN = "88888888-8888-4888-8888-888888888888";

function read(pathFromRoot: string): string {
  return readFileSync(join(root, pathFromRoot), "utf8");
}

function baseReadinessInput(
  overrides: Partial<Parameters<typeof derivePurgeReadiness>[0]> = {}
): Parameters<typeof derivePurgeReadiness>[0] {
  return {
    organisationFound: true,
    organisationStatus: "pending_closure",
    organisationType: "practice",
    isSampleInstallation: false,
    isSampleSource: false,
    isUndeletable: false,
    openRunCount: 1,
    runOrganisationId: ORG_ID,
    runFormerOrganisationId: ORG_ID,
    expectedOrganisationId: ORG_ID,
    runStatus: COMMERCIAL_COPIED_RUN_STATUS,
    freezeBlocksMemberAccess: true,
    commercialVerificationPassed: true,
    sourceRetainedMatches: true,
    preflightReviewReasons: [],
    ...overrides,
  };
}

function createInventoryClient(input?: {
  organisationType?: string;
  status?: string;
  name?: string;
  sampleAsOrg?: number;
  sampleAsSource?: number;
  undeletable?: boolean;
  commercial?: Partial<
    Record<
      | "organisation_subscriptions"
      | "organisation_payment_methods"
      | "invoices"
      | "purchase_orders"
      | "organisation_contracts"
      | "organisation_trials",
      number
    >
  >;
  writes?: { remove: number };
}): SupabaseClient {
  const organisation = {
    id: ORG_ID,
    name: input?.name ?? "Northwind",
    organisation_type: input?.organisationType ?? "business",
    status: input?.status ?? "pending_closure",
    licence_status: "active",
  };
  const writes = input?.writes ?? { remove: 0 };
  return {
    from(table: string) {
      const filters: Array<[string, string, unknown]> = [];
      let head = false;
      const builder = {
        select(_columns?: string, opts?: { head?: boolean }) {
          head = Boolean(opts?.head);
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
        range() {
          return builder;
        },
        async maybeSingle() {
          if (table === "organisations") {
            return { data: organisation, error: null };
          }
          if (table === "platform_settings") {
            return {
              data: {
                value: { ids: input?.undeletable ? [ORG_ID] : [] },
              },
              error: null,
            };
          }
          return { data: null, error: null };
        },
        then(
          resolve: (value: {
            data: unknown[];
            count: number | null;
            error: null;
          }) => unknown
        ) {
          if (table === "sample_organisation_installations") {
            const asOrg = filters.some(([, column]) => column === "organisation_id");
            const count = asOrg
              ? (input?.sampleAsOrg ?? 0)
              : (input?.sampleAsSource ?? 0);
            return resolve({ data: [], count, error: null });
          }
          const commercialCount = input?.commercial?.[
            table as keyof NonNullable<typeof input.commercial>
          ];
          if (typeof commercialCount === "number") {
            return resolve({ data: [], count: commercialCount, error: null });
          }
          if (table === "organisation_memberships" && !head) {
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
          async list() {
            return { data: [], error: null };
          },
          async remove() {
            writes.remove += 1;
            throw new Error("storage delete is not allowed in DL-06");
          },
        };
      },
    },
  } as unknown as SupabaseClient;
}

function createOwnerClient(input: {
  organisation?: Record<string, unknown> | null;
  openRun?: Record<string, unknown> | null;
  retained?: Record<string, number>;
  rpc?: ReturnType<typeof vi.fn>;
}): SupabaseClient {
  const state: {
    organisation: Record<string, unknown> | null;
    openRun: Record<string, unknown> | null;
    retained: Record<string, number>;
  } = {
    organisation:
      input.organisation === undefined
        ? { id: ORG_ID, name: "Northwind", status: "pending_closure" }
        : input.organisation,
    openRun:
      input.openRun === undefined
        ? {
            id: RUN_ID,
            organisation_id: ORG_ID,
            former_organisation_id: ORG_ID,
            organisation_name_snapshot: "Northwind",
            status: "frozen",
            stage: "access_frozen",
            instruction_reference: "GDPR-1042",
            authorized_by: "owner-user",
            requested_at: "2026-08-27T12:00:00.000Z",
            started_at: "2026-08-27T12:00:00.000Z",
          }
        : input.openRun,
    retained: { licence_snapshot: 0, ...input.retained },
  };
  const rpc =
    input.rpc ??
    vi.fn().mockImplementation(async () => {
      state.openRun = {
        ...(state.openRun as Record<string, unknown>),
        status: COMMERCIAL_COPIED_RUN_STATUS,
        stage: COMMERCIAL_COPIED_STAGE,
      };
      state.retained = {
        subscription: 0,
        payment_method_masked: 0,
        invoice: 0,
        purchase_order: 0,
        contract: 0,
        trial: 0,
        ...state.retained,
        licence_snapshot: 1,
      };
      return {
        data: {
          ok: true,
          alreadyCopied: false,
          deletionRunId: RUN_ID,
          organisationId: ORG_ID,
          formerOrganisationId: ORG_ID,
          organisationStatus: "pending_closure",
          runStatus: COMMERCIAL_COPIED_RUN_STATUS,
          stage: COMMERCIAL_COPIED_STAGE,
          verificationStatus: "passed",
          sources: [
            {
              table: "organisation_subscriptions",
              recordType: "subscription",
              sourceCount: 0,
              retainedCount: 0,
            },
            {
              table: "organisations",
              recordType: "licence_snapshot",
              sourceCount: 1,
              retainedCount: 1,
            },
          ],
          retainedTotal: 1,
          permanentDeletionOccurred: false,
        },
        error: null,
      };
    });
  return {
    rpc,
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
        async maybeSingle() {
          if (table === "organisations") {
            return { data: state.organisation, error: null };
          }
          if (table === "organisation_deletion_runs") {
            return { data: state.openRun, error: null };
          }
          return { data: null, error: null };
        },
        then(
          resolve: (value: {
            data: unknown[];
            count: number | null;
            error: null;
          }) => unknown
        ) {
          if (table === "retained_organisation_commercial_records") {
            const typeFilter = filters.find(([, column]) => column === "record_type");
            const recordType = typeFilter ? String(typeFilter[2]) : "";
            return resolve({
              data: [],
              count: state.retained[recordType] ?? 0,
              error: null,
            });
          }
          return resolve({ data: [], count: 0, error: null });
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

describe("DL-06 commercial retention migration", () => {
  it("copies allowlisted commercial metadata without purge or certificates", () => {
    expect(existsSync(join(root, MIGRATION))).toBe(true);
    const sql = read(MIGRATION);
    expect(sql).toContain(
      "create or replace function public.owner_copy_organisation_commercial_records"
    );
    expect(sql).toContain("security definer");
    expect(sql).toContain("is_platform_owner");
    expect(sql).toContain("auth.uid()");
    expect(sql).toContain("for update");
    expect(sql).toContain("retained_organisation_commercial_run_source_key");
    expect(sql).toContain("on conflict on constraint retained_organisation_commercial_run_source_key do nothing");
    expect(sql).toContain("raise exception 'COMMERCIAL_COPY_INCOMPLETE'");
    expect(sql).toContain("status = 'commercial_copied'");
    expect(sql).toContain("stage = 'commercial_copied'");
    expect(sql).toContain("organisation.commercial_retention_copied");
    expect(sql).toContain("'PERSONAL_ORGANISATION'");
    expect(sql).toContain("'SAMPLE_INSTALLATION'");
    expect(sql).toContain("'SAMPLE_SOURCE_ORGANISATION'");
    expect(sql).toContain("'UNDELETABLE_ORGANISATION'");
    expect(sql).toContain("'STATUS_NOT_ALLOWED'");
    expect(sql).toContain("'INCONSISTENT_RUN'");
    expect(sql).toContain("purgeReadinessResult");
    expect(sql).toContain("'requires_review'");
    expect(sql).toContain("permanentDeletionOccurred");
    expect(sql).not.toContain("p_eligible");
    expect(sql).not.toContain("p_purge_ready");
    expect(sql).not.toContain("commercialCopyComplete");
    expect(sql).not.toMatch(/delete\s+from\s+public\.organisations/i);
    expect(sql).not.toMatch(/delete\s+from\s+public\.clients/i);
    expect(sql).not.toMatch(/delete\s+from\s+public\.sessions/i);
    expect(sql).not.toMatch(/delete\s+from\s+public\.organisation_memberships/i);
    expect(sql).not.toMatch(/delete\s+from\s+public\.organisation_invitations/i);
    expect(sql).not.toMatch(/delete\s+from\s+public\.support_cases/i);
    expect(sql).not.toMatch(/insert\s+into\s+public\.organisation_deletion_certificates/i);
    expect(sql).not.toMatch(/storage\.objects/i);
    expect(sql).not.toContain("auth.admin");
    expect(sql).not.toMatch(/delete\s+from\s+auth\.users/i);
    expect(sql).not.toMatch(/create\s+or\s+replace\s+function\s+public\.\w*purge/i);
    expect(sql).not.toMatch(
      /create\s+or\s+replace\s+function\s+public\.\w*delete_organisation/i
    );
    expect(sql).not.toContain("create or replace function public.has_organisation_permission");
    expect(sql).not.toContain("user_can_access_client_content");
    expect(sql).toContain("grant execute");
    expect(sql).toContain("to authenticated");
    expect(sql).toContain("from anon");
    expect(sql).not.toMatch(/\bcommit\b/i);
  });

  it("retains only allowlisted commercial fields and excludes notes, secrets, and documents", () => {
    const sql = read(MIGRATION);
    expect(sql).toContain("'planId', s.plan_id");
    expect(sql).toContain("'invoiceNumber', s.invoice_number");
    expect(sql).toContain("'poNumber', s.po_number");
    expect(sql).toContain("'lastFour'");
    expect(sql).toContain("'legalName', v_org.legal_name");
    expect(sql).toContain("'planName', v_org.licence_plan_name");
    expect(sql).toContain("'seatsPurchased', v_org.practitioner_seats_purchased");
    expect(sql).toContain("'licenceStatus', v_org.licence_status");
    expect(sql).toContain("'licenceStartsAt', v_org.licence_starts_at");
    expect(sql).toContain("'licenceEndsAt', v_org.licence_ends_at");
    const licenceSnapStart = sql.indexOf("'planName', v_org.licence_plan_name");
    const licenceSnapEnd = sql.indexOf(
      "on conflict on constraint retained_organisation_commercial_run_source_key do nothing;",
      licenceSnapStart
    );
    const licenceSnapshot = sql.slice(licenceSnapStart, licenceSnapEnd);
    expect(licenceSnapshot).toContain("'legalName', v_org.legal_name");
    expect(licenceSnapshot).not.toContain("'sourceId'");
    expect(licenceSnapshot).not.toContain("'organisationType'");
    expect(licenceSnapshot).not.toContain("'organisationStatus'");
    expect(licenceSnapshot).not.toContain("'tradingName'");
    expect(licenceSnapshot).not.toContain("v_org.organisation_type");
    expect(licenceSnapshot).not.toContain("v_org.trading_name");
    expect(sql).toContain("'licence_snapshot',\n    v_org.id,");
    expect(sql).toContain("former_organisation_id,");
    expect(sql).toContain("former_organisation_name,");
    expect(sql).toContain("'sourceId', s.id");
    expect(sql).not.toContain("s.metadata");
    expect(sql).not.toContain("s.notes");
    expect(sql).not.toContain("s.description");
    expect(sql).not.toContain("s.document_reference");
    expect(sql).not.toContain("s.external_provider");
    expect(sql).not.toContain("s.external_customer_id");
    expect(sql).not.toContain("s.external_subscription_id");
    expect(sql).not.toContain("s.provider_customer_id");
    expect(sql).not.toContain("s.provider_payment_method_id");
    expect(sql).not.toContain("s.billing_name");
    expect(sql).not.toContain("s.account_owner");
    expect(sql).not.toContain("s.external_invoice_id");
    expect(sql).not.toContain("private_notes");
    expect(sql).not.toContain("extracted_text");
    expect(sql).not.toContain("conversation_text");
    expect(sql).not.toContain("approved_content");
  });
});

describe("DL-06 API and UI contracts", () => {
  it("is Platform Owner only and denies unauthenticated and customer roles", () => {
    const route = read(
      "app/api/owner/organisations/[id]/commercial-retention/route.ts"
    );
    expect(route).toContain("requirePlatformOwner");
    expect(route.match(/requirePlatformOwner/g)?.length).toBeGreaterThanOrEqual(2);
    expect(route).toContain("export async function GET");
    expect(route).toContain("export async function POST");
    expect(route).not.toContain("export async function DELETE");
    expect(route).not.toContain("export async function PATCH");
    expect(route).toContain("assertOwnerPayloadIsSafe");
    expect(route).toContain("commercialCopyAcknowledged");
    expect(route).not.toContain("hasPermission");
    expect(route).not.toContain("requireOrganisationPermission");
    expect(route).not.toContain("eligible=true");
    expect(route).not.toContain("commercialCopyComplete");
    expect(route).not.toContain("purgeReady");
    expect(
      existsSync(join(root, "app/api/organisations/commercial-retention/route.ts"))
    ).toBe(false);
    expect(
      existsSync(join(root, "app/api/owner/organisations/[id]/deletion/route.ts"))
    ).toBe(false);
    expect(ORGANISATION_PERMISSIONS.join(" ")).not.toMatch(/delet/i);
    expect(ORGANISATION_PERMISSIONS.join(" ")).not.toMatch(/purge/i);
    expect(ORGANISATION_PERMISSIONS.join(" ")).not.toMatch(/retention/i);
    for (const role of [
      "owner",
      "administrator",
      "oversight",
      "practitioner",
      "viewer",
    ] as const) {
      expect(hasPermission(role, "organisation.manage")).toBe(
        role === "owner" || role === "administrator"
      );
    }
  });

  it("Owner Console shows commercial retention without a purge or delete action", () => {
    const page = read("app/owner/organisations/[id]/page.tsx");
    const start = page.indexOf('{tab === "Data lifecycle"');
    const end = page.indexOf('{tab === "Settings"');
    const lifecycle = page.slice(start, end);
    expect(lifecycle).toContain("CommercialRetentionPanel");
    expect(page).toContain("Prepare retained commercial record");
    expect(page).toContain("Future purge readiness");
    expect(lifecycle).not.toContain("Delete organisation");
    expect(lifecycle).not.toContain("Permanently delete");
    expect(lifecycle).not.toContain("Erase now");
    expect(lifecycle).not.toContain("Complete deletion");
    expect(lifecycle).not.toMatch(/Continue purge/i);
    expect(lifecycle).not.toContain("Suspend organisation");
    expect(page).not.toMatch(/Permanently delete/i);
    expect(page).not.toContain("Delete organisation");
    expect(read("lib/owner/organisation-commercial-retention.ts")).not.toMatch(
      /\.remove\(/
    );
    expect(read("lib/owner/organisation-commercial-retention.ts")).not.toContain(
      "auth.admin.deleteUser"
    );
    expect(PURGE_READINESS_RESULTS).toEqual(["not_ready", "requires_review", "blocked"]);
  });
});

describe("DL-06 purge readiness derivation", () => {
  it("never returns ready and requires review after a verified copy", () => {
    expect(PURGE_READINESS_RESULTS).not.toContain("ready");
    const ready = derivePurgeReadiness(baseReadinessInput());
    expect(ready.result).toBe("requires_review");
    expect(ready.commercialCopyVerified).toBe(true);
    expect(ready.permanentDeletionOccurred).toBe(false);
    expect(ready.acknowledgedLimitations.join(" ")).toContain(
      "details JSON is not searched"
    );
    expect(ready.acknowledgedLimitations.join(" ")).toContain(
      "Backup and external-processor"
    );
    expect(ready.reasons.map(reason => reason.code)).toEqual(
      expect.arrayContaining([
        "MIGRATION_REVIEW_DETAILS_NOT_SEARCHED",
        "BACKUP_EXTERNAL_RETENTION_UNCONFIRMED",
      ])
    );
  });

  it("is not_ready before commercial copy and blocked for DL-05/DL-04 protections", () => {
    expect(
      derivePurgeReadiness(
        baseReadinessInput({
          commercialVerificationPassed: false,
          runStatus: "frozen",
        })
      ).result
    ).toBe("not_ready");
    expect(
      derivePurgeReadiness(baseReadinessInput({ organisationStatus: "active" }))
        .result
    ).toBe("blocked");
    expect(
      derivePurgeReadiness(baseReadinessInput({ organisationType: "personal" }))
        .reasons.map(reason => reason.code)
    ).toContain("PERSONAL_ORGANISATION");
    expect(
      derivePurgeReadiness(baseReadinessInput({ isSampleInstallation: true }))
        .reasons.map(reason => reason.code)
    ).toContain("SAMPLE_INSTALLATION");
    expect(
      derivePurgeReadiness(baseReadinessInput({ isSampleSource: true })).reasons.map(
        reason => reason.code
      )
    ).toContain("SAMPLE_SOURCE_ORGANISATION");
    expect(
      derivePurgeReadiness(baseReadinessInput({ isUndeletable: true })).reasons.map(
        reason => reason.code
      )
    ).toContain("UNDELETABLE_ORGANISATION");
    expect(
      derivePurgeReadiness(baseReadinessInput({ openRunCount: 0 })).result
    ).toBe("blocked");
    expect(
      derivePurgeReadiness(
        baseReadinessInput({ runFormerOrganisationId: OTHER_RUN })
      ).reasons.map(reason => reason.code)
    ).toContain("INCONSISTENT_RUN");
    expect(
      derivePurgeReadiness(baseReadinessInput({ runStatus: "purging" })).reasons.map(
        reason => reason.code
      )
    ).toContain("UNEXPECTED_RUN_STATE");
    expect(
      derivePurgeReadiness(
        baseReadinessInput({
          sourceRetainedMatches: false,
          commercialVerificationPassed: false,
        })
      ).reasons.map(reason => reason.code)
    ).toContain("COMMERCIAL_COUNT_MISMATCH");
    expect(
      derivePurgeReadiness(
        baseReadinessInput({ freezeBlocksMemberAccess: false })
      ).reasons.map(reason => reason.code)
    ).toContain("FREEZE_NOT_EFFECTIVE");
  });
});

describe("DL-06 copyOrganisationCommercialRecords", () => {
  const ack = { commercialCopyAcknowledged: true as const };

  it("requires acknowledgement and does not accept client readiness flags", async () => {
    const rpc = vi.fn();
    const result = await copyOrganisationCommercialRecords({
      ownerSupabase: createOwnerClient({ rpc }),
      inventorySupabase: createInventoryClient(),
      organisationId: ORG_ID,
      deletionRunId: RUN_ID,
      commercialCopyAcknowledged: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("ACKNOWLEDGEMENT_REQUIRED");
    expect(rpc).not.toHaveBeenCalled();
    expect(read("lib/owner/organisation-commercial-retention.ts")).not.toContain(
      "eligible=true"
    );
    expect(read("app/api/owner/organisations/[id]/commercial-retention/route.ts")).not.toContain(
      "purgeReady"
    );
  });

  it("blocks active organisations and requires pending_closure plus a valid DL-05 run", async () => {
    const rpc = vi.fn();
    const active = await copyOrganisationCommercialRecords({
      ownerSupabase: createOwnerClient({
        organisation: { id: ORG_ID, name: "Northwind", status: "active" },
        rpc,
      }),
      inventorySupabase: createInventoryClient({ status: "active" }),
      organisationId: ORG_ID,
      deletionRunId: RUN_ID,
      ...ack,
    });
    expect(active.ok).toBe(false);
    if (!active.ok) expect(active.code).toBe("STATUS_NOT_ALLOWED");

    const missingRun = await copyOrganisationCommercialRecords({
      ownerSupabase: createOwnerClient({ openRun: null, rpc }),
      inventorySupabase: createInventoryClient(),
      organisationId: ORG_ID,
      deletionRunId: RUN_ID,
      ...ack,
    });
    expect(missingRun.ok).toBe(false);
    if (!missingRun.ok) expect(missingRun.code).toBe("RUN_NOT_FOUND");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("blocks personal, sample, sample-source, and undeletable organisations", async () => {
    const rpc = vi.fn();
    const personal = await copyOrganisationCommercialRecords({
      ownerSupabase: createOwnerClient({ rpc }),
      inventorySupabase: createInventoryClient({ organisationType: "personal" }),
      organisationId: ORG_ID,
      deletionRunId: RUN_ID,
      ...ack,
    });
    expect(personal.ok).toBe(false);
    if (!personal.ok) expect(personal.code).toBe("PERSONAL_ORGANISATION");

    const sample = await copyOrganisationCommercialRecords({
      ownerSupabase: createOwnerClient({ rpc }),
      inventorySupabase: createInventoryClient({ sampleAsOrg: 1 }),
      organisationId: ORG_ID,
      deletionRunId: RUN_ID,
      ...ack,
    });
    expect(sample.ok).toBe(false);
    if (!sample.ok) expect(sample.code).toBe("SAMPLE_INSTALLATION");

    const source = await copyOrganisationCommercialRecords({
      ownerSupabase: createOwnerClient({ rpc }),
      inventorySupabase: createInventoryClient({ sampleAsSource: 1 }),
      organisationId: ORG_ID,
      deletionRunId: RUN_ID,
      ...ack,
    });
    expect(source.ok).toBe(false);
    if (!source.ok) expect(source.code).toBe("SAMPLE_SOURCE_ORGANISATION");

    const undeletable = await copyOrganisationCommercialRecords({
      ownerSupabase: createOwnerClient({ rpc }),
      inventorySupabase: createInventoryClient({ undeletable: true }),
      organisationId: ORG_ID,
      deletionRunId: RUN_ID,
      ...ack,
    });
    expect(undeletable.ok).toBe(false);
    if (!undeletable.ok) expect(undeletable.code).toBe("UNDELETABLE_ORGANISATION");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("fails closed for inconsistent or unexpected run state", async () => {
    const rpc = vi.fn();
    const mismatch = await copyOrganisationCommercialRecords({
      ownerSupabase: createOwnerClient({
        openRun: {
          id: OTHER_RUN,
          organisation_id: ORG_ID,
          former_organisation_id: ORG_ID,
          organisation_name_snapshot: "Northwind",
          status: "frozen",
          stage: "access_frozen",
          requested_at: "2026-08-27T12:00:00.000Z",
        },
        rpc,
      }),
      inventorySupabase: createInventoryClient(),
      organisationId: ORG_ID,
      deletionRunId: RUN_ID,
      ...ack,
    });
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) expect(mismatch.code).toBe("INCONSISTENT_RUN");

    const unexpected = await copyOrganisationCommercialRecords({
      ownerSupabase: createOwnerClient({
        openRun: {
          id: RUN_ID,
          organisation_id: ORG_ID,
          former_organisation_id: ORG_ID,
          organisation_name_snapshot: "Northwind",
          status: "purging",
          stage: "purging",
          requested_at: "2026-08-27T12:00:00.000Z",
        },
        rpc,
      }),
      inventorySupabase: createInventoryClient(),
      organisationId: ORG_ID,
      deletionRunId: RUN_ID,
      ...ack,
    });
    expect(unexpected.ok).toBe(false);
    if (!unexpected.ok) expect(unexpected.code).toBe("RUN_STATE_NOT_ALLOWED");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("copies zero commercial records with a licence snapshot and stays pending_closure", async () => {
    const owner = createOwnerClient({});
    const result = await copyOrganisationCommercialRecords({
      ownerSupabase: owner,
      inventorySupabase: createInventoryClient(),
      organisationId: ORG_ID,
      deletionRunId: RUN_ID,
      ...ack,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.organisationStatus).toBe("pending_closure");
    expect(result.runStatus).toBe(COMMERCIAL_COPIED_RUN_STATUS);
    expect(result.stage).toBe(COMMERCIAL_COPIED_STAGE);
    expect(result.verificationStatus).toBe("passed");
    expect(result.permanentDeletionOccurred).toBe(false);
    expect(result.purgeReadiness.result).toBe("requires_review");
    expect(result.retainedTotal).toBe(1);
    expect(() => assertOwnerPayloadIsSafe(result)).not.toThrow();
    expect(JSON.stringify(result)).not.toMatch(
      /privateNotes|extracted_text|conversation_text|"snapshot"/
    );
  });

  it("copies source commercial counts and is idempotent on retry", async () => {
    const owner = createOwnerClient({
      retained: {
        subscription: 2,
        payment_method_masked: 1,
        invoice: 3,
        purchase_order: 1,
        contract: 1,
        trial: 1,
        licence_snapshot: 0,
      },
    });
    const first = await copyOrganisationCommercialRecords({
      ownerSupabase: owner,
      inventorySupabase: createInventoryClient({
        commercial: {
          organisation_subscriptions: 2,
          organisation_payment_methods: 1,
          invoices: 3,
          purchase_orders: 1,
          organisation_contracts: 1,
          organisation_trials: 1,
        },
      }),
      organisationId: ORG_ID,
      deletionRunId: RUN_ID,
      ...ack,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = await copyOrganisationCommercialRecords({
      ownerSupabase: owner,
      inventorySupabase: createInventoryClient({
        commercial: {
          organisation_subscriptions: 2,
          organisation_payment_methods: 1,
          invoices: 3,
          purchase_orders: 1,
          organisation_contracts: 1,
          organisation_trials: 1,
        },
      }),
      organisationId: ORG_ID,
      deletionRunId: RUN_ID,
      ...ack,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.runStatus).toBe(COMMERCIAL_COPIED_RUN_STATUS);
    expect((owner.rpc as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(2);
    expect((owner.rpc as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      OWNER_COPY_ORGANISATION_COMMERCIAL_RPC,
      {
        p_organisation_id: ORG_ID,
        p_deletion_run_id: RUN_ID,
      }
    );
  });

  it("does not treat a partial copy as successful", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "COMMERCIAL_COPY_INCOMPLETE" },
    });
    const result = await copyOrganisationCommercialRecords({
      ownerSupabase: createOwnerClient({ rpc }),
      inventorySupabase: createInventoryClient(),
      organisationId: ORG_ID,
      deletionRunId: RUN_ID,
      ...ack,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("COMMERCIAL_COPY_INCOMPLETE");
  });

  it("does not call storage remove or spoof purge readiness from the client", async () => {
    const writes = { remove: 0 };
    const result = await copyOrganisationCommercialRecords({
      ownerSupabase: createOwnerClient({}),
      inventorySupabase: createInventoryClient({ writes }),
      organisationId: ORG_ID,
      deletionRunId: RUN_ID,
      ...ack,
    });
    expect(result.ok).toBe(true);
    expect(writes.remove).toBe(0);
    expect((createOwnerClient({}).rpc as ReturnType<typeof vi.fn>)).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eligible: true,
        purgeReady: true,
        commercialCopyComplete: true,
      })
    );
  });
});

describe("DL-06 loadCommercialRetentionState", () => {
  it("compares source and retained counts and keeps the organisation frozen", async () => {
    const state = await loadCommercialRetentionState({
      ownerSupabase: createOwnerClient({
        openRun: {
          id: RUN_ID,
          organisation_id: ORG_ID,
          former_organisation_id: ORG_ID,
          organisation_name_snapshot: "Northwind",
          status: COMMERCIAL_COPIED_RUN_STATUS,
          stage: COMMERCIAL_COPIED_STAGE,
          requested_at: "2026-08-27T12:00:00.000Z",
        },
        retained: {
          subscription: 1,
          payment_method_masked: 0,
          invoice: 0,
          purchase_order: 0,
          contract: 0,
          trial: 0,
          licence_snapshot: 1,
        },
      }),
      inventorySupabase: createInventoryClient({
        commercial: { organisation_subscriptions: 1 },
      }),
      organisationId: ORG_ID,
    });
    expect(state.organisationStatus).toBe("pending_closure");
    expect(state.alreadyCopied).toBe(true);
    expect(state.copyAvailable).toBe(false);
    expect(state.verificationStatus).toBe("passed");
    expect(state.sources.find(item => item.recordType === "subscription")).toEqual(
      expect.objectContaining({ sourceCount: 1, retainedCount: 1 })
    );
    expect(state.purgeReadiness.result).toBe("requires_review");
    expect(state.permanentDeletionOccurred).toBe(false);
    expect(() => assertOwnerPayloadIsSafe(state)).not.toThrow();
  });

  it("does not mark copy available on an active organisation", async () => {
    const state = await loadCommercialRetentionState({
      ownerSupabase: createOwnerClient({
        organisation: { id: ORG_ID, name: "Northwind", status: "active" },
        openRun: null,
      }),
      inventorySupabase: createInventoryClient({ status: "active" }),
      organisationId: ORG_ID,
    });
    expect(state.copyAvailable).toBe(false);
    expect(state.alreadyCopied).toBe(false);
    expect(state.purgeReadiness.result).toBe("blocked");
  });
});

describe("DL-06 freeze, privacy, and non-destruction contracts", () => {
  it("does not weaken DL-03 freeze helpers or customer permissions", () => {
    const sql = read(MIGRATION);
    expect(sql).not.toContain(
      "create or replace function public.has_organisation_permission"
    );
    expect(sql).not.toContain("organisation_status_allows_member_access");
    const freeze = read(
      "supabase/migrations/20260827200000_organisation_deletion_foundation.sql"
    );
    expect(freeze).toContain("pending_closure organisations fail closed");
    expect(hasPermission("owner", "organisation.manage")).toBe(true);
    expect(hasPermission("viewer", "organisation.manage")).toBe(false);
    expect(hasPermission("practitioner", "coaching_content.view")).toBe(true);
  });

  it("does not introduce a generic organisation DELETE or purge RPC", () => {
    expect(
      existsSync(join(root, "app/api/owner/organisations/[id]/deletion/route.ts"))
    ).toBe(false);
    expect(
      existsSync(join(root, "app/api/owner/organisations/[id]/purge/route.ts"))
    ).toBe(false);
    const lib = read("lib/owner/organisation-commercial-retention.ts");
    expect(lib).not.toMatch(/delete from/i);
    expect(lib).not.toContain("organisation_deletion_certificates");
  });
});
