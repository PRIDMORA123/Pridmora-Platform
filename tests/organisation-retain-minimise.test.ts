import { describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertOwnerPayloadIsSafe } from "@/lib/owner/privacy";
import {
  MINIMISED_SUPPORT_CASE_SUBJECT,
  ORGANISATION_PURGE_MUST_NEVER_DELETE_AUTH_USERS,
  PLATFORM_AUDIT_ENTITY_ID_RETAIN_TYPES,
  PLATFORM_AUDIT_FIELD_TREATMENT,
  PLATFORM_AUDIT_METADATA_ALLOWLIST,
  PLATFORM_AUDIT_SCHEMA_COLUMNS,
  SUPPORT_CASE_FIELD_TREATMENT,
  SUPPORT_CASE_SCHEMA_COLUMNS,
} from "@/lib/owner/organisation-purge-architecture";
import {
  isSupportCaseMinimised,
  loadRetainMinimiseState,
  MINIMISED_SUPPORT_DESCRIPTION,
  minimiseOrganisationRetainRecords,
  minimisePlatformAuditEvent,
  minimisePlatformAuditEntityId,
  minimisePlatformAuditMetadata,
  minimiseSupportCase,
  OWNER_MINIMISE_ORGANISATION_RETAIN_RPC,
  platformAuditFieldTreatmentsMatchSchema,
  supportCaseFieldTreatmentsMatchSchema,
} from "@/lib/owner/organisation-retain-minimise";

const root = process.cwd();
const MIGRATION =
  "supabase/migrations/20260827240000_organisation_retain_minimise.sql";
const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const RUN_ID = "99999999-9999-4999-8999-999999999999";
const CASE_ID = "11111111-1111-4111-8111-111111111111";
const EVENT_ID = "22222222-2222-4222-8222-222222222222";

function read(pathFromRoot: string): string {
  return readFileSync(join(root, pathFromRoot), "utf8");
}

const LIVE_SUPPORT_CASE = {
  id: CASE_ID,
  organisation_id: ORG_ID,
  former_organisation_id: null,
  user_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  category: "billing",
  subject: "Cannot download invoice for Jane's coaching notes",
  description: "The manager described a confidential coaching session.",
  status: "open",
  priority: "high",
  assigned_to: "Alex Support",
  resolution_notes: "Called the customer; they mentioned reflections.",
  created_by: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  created_at: "2026-08-01T10:00:00.000Z",
  updated_at: "2026-08-02T10:00:00.000Z",
};

function createInventoryClient(input?: {
  status?: string;
  organisationType?: string;
  supportPending?: number;
  supportMinimised?: number;
  auditPending?: number;
  auditMinimised?: number;
}): SupabaseClient {
  const organisation = {
    id: ORG_ID,
    name: "Northwind",
    organisation_type: input?.organisationType ?? "business",
    status: input?.status ?? "pending_closure",
    licence_status: "active",
  };
  return {
    from(table: string) {
      const filters: Array<[string, string, unknown]> = [];
      const builder = {
        select(_columns?: string, opts?: { head?: boolean }) {
          void _columns;
          void opts;
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
        range() {
          return builder;
        },
        async maybeSingle() {
          if (table === "organisations") {
            return { data: organisation, error: null };
          }
          if (table === "platform_settings") {
            return { data: { value: { ids: [] } }, error: null };
          }
          if (table === "organisation_deletion_runs") {
            return {
              data: {
                id: RUN_ID,
                organisation_id: ORG_ID,
                former_organisation_id: ORG_ID,
                organisation_name_snapshot: "Northwind",
                status: "commercial_copied",
                stage: "commercial_copied",
                instruction_reference: "GDPR-1042",
                authorized_by: "owner-user",
                requested_at: "2026-08-27T12:00:00.000Z",
                started_at: "2026-08-27T12:00:00.000Z",
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
          if (table === "support_cases") {
            const former = filters.some(([, column]) => column === "former_organisation_id");
            return resolve({
              data: [],
              count: former
                ? (input?.supportMinimised ?? 1)
                : (input?.supportPending ?? 1),
              error: null,
            });
          }
          if (table === "platform_audit_events") {
            const former = filters.some(([, column]) => column === "former_organisation_id");
            return resolve({
              data: [],
              count: former
                ? (input?.auditMinimised ?? 2)
                : (input?.auditPending ?? 3),
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

describe("DL-08 Slice 2 schema diagnosis", () => {
  it("maps every support_cases and platform_audit_events column from migrations", () => {
    expect(supportCaseFieldTreatmentsMatchSchema()).toBe(true);
    expect(platformAuditFieldTreatmentsMatchSchema()).toBe(true);
    const createSql = read("supabase/migrations/20260808120000_owner_console.sql");
    for (const column of SUPPORT_CASE_SCHEMA_COLUMNS) {
      if (column === "former_organisation_id") continue;
      expect(createSql).toContain(column);
    }
    for (const column of PLATFORM_AUDIT_SCHEMA_COLUMNS) {
      if (column === "former_organisation_id") continue;
      expect(createSql).toContain(column);
    }
    const sliceSql = read(MIGRATION);
    expect(sliceSql).toContain("former_organisation_id");
    expect(sliceSql).toContain("add column if not exists former_organisation_id");
  });
});

describe("DL-08 Slice 2 support_cases retain_minimise", () => {
  it("retains operational fields and clears free text and personal identifiers", () => {
    const minimised = minimiseSupportCase(LIVE_SUPPORT_CASE);
    expect(minimised.id).toBe(CASE_ID);
    expect(minimised.organisation_id).toBeNull();
    expect(minimised.former_organisation_id).toBe(ORG_ID);
    expect(minimised.user_id).toBeNull();
    expect(minimised.category).toBe("billing");
    expect(minimised.subject).toBe(MINIMISED_SUPPORT_CASE_SUBJECT);
    expect(minimised.subject).not.toMatch(/Jane|coaching/i);
    expect(minimised.description).toBe(MINIMISED_SUPPORT_DESCRIPTION);
    expect(minimised.status).toBe("open");
    expect(minimised.priority).toBe("high");
    expect(minimised.assigned_to).toBeNull();
    expect(minimised.resolution_notes).toBeNull();
    expect(minimised.created_by).toBeNull();
    expect(minimised.created_at).toBe(LIVE_SUPPORT_CASE.created_at);
    expect(isSupportCaseMinimised(minimised)).toBe(true);
    expect(JSON.stringify(minimised)).not.toMatch(
      /confidential coaching|reflections|Jane/i
    );
  });

  it("fails closed on an unmapped support column", () => {
    expect(() =>
      minimiseSupportCase({
        ...LIVE_SUPPORT_CASE,
        ticket_body: "secret transcript",
      })
    ).toThrow(/UNKNOWN_COLUMN/);
  });

  it("uses the DL-07 field treatments for each support column", () => {
    expect(SUPPORT_CASE_FIELD_TREATMENT.id).toBe("RETAIN");
    expect(SUPPORT_CASE_FIELD_TREATMENT.organisation_id).toBe("NULL");
    expect(SUPPORT_CASE_FIELD_TREATMENT.former_organisation_id).toBe("RETAIN");
    expect(SUPPORT_CASE_FIELD_TREATMENT.user_id).toBe("NULL");
    expect(SUPPORT_CASE_FIELD_TREATMENT.category).toBe("RETAIN");
    expect(SUPPORT_CASE_FIELD_TREATMENT.subject).toBe("MINIMISE");
    expect(SUPPORT_CASE_FIELD_TREATMENT.description).toBe("NULL");
    expect(SUPPORT_CASE_FIELD_TREATMENT.status).toBe("RETAIN");
    expect(SUPPORT_CASE_FIELD_TREATMENT.priority).toBe("RETAIN");
    expect(SUPPORT_CASE_FIELD_TREATMENT.assigned_to).toBe("NULL");
    expect(SUPPORT_CASE_FIELD_TREATMENT.resolution_notes).toBe("NULL");
    expect(SUPPORT_CASE_FIELD_TREATMENT.created_by).toBe("NULL");
    expect(SUPPORT_CASE_FIELD_TREATMENT.created_at).toBe("RETAIN");
    expect(SUPPORT_CASE_FIELD_TREATMENT.updated_at).toBe("RETAIN");
  });
});

describe("DL-08 Slice 2 platform_audit_events retain_minimise", () => {
  it("keeps operational metadata and drops free text, names, emails, and nested junk", () => {
    const minimised = minimisePlatformAuditEvent({
      id: EVENT_ID,
      actor_user_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      action: "organisation.closure_initiated",
      entity_type: "organisation_deletion_run",
      entity_id: RUN_ID,
      organisation_id: ORG_ID,
      former_organisation_id: null,
      metadata: {
        deletionRunId: RUN_ID,
        organisationNameSnapshot: "Northwind Coaching",
        instructionReference: "GDPR-1042",
        email: "manager@example.com",
        private_notes: "coaching reflection",
        sourceCounts: { invoices: 3, subscriptions: 1 },
        retainedCounts: { invoices: 3 },
        nestedDump: { transcript: "hello" },
        notes: "should go",
        tooLong: "x".repeat(201),
      },
      created_at: "2026-08-27T12:00:00.000Z",
    });
    expect(minimised.organisation_id).toBeNull();
    expect(minimised.former_organisation_id).toBe(ORG_ID);
    expect(minimised.entity_id).toBe(RUN_ID);
    expect(minimised.actor_user_id).toBe("dddddddd-dddd-4ddd-8ddd-dddddddddddd");
    expect(minimised.action).toBe("organisation.closure_initiated");
    expect(minimised.metadata.deletionRunId).toBe(RUN_ID);
    expect(minimised.metadata.instructionReference).toBe("GDPR-1042");
    expect(minimised.metadata.sourceCounts).toEqual({
      invoices: 3,
      subscriptions: 1,
    });
    expect(minimised.metadata.organisationNameSnapshot).toBeUndefined();
    expect(minimised.metadata.email).toBeUndefined();
    expect(minimised.metadata.private_notes).toBeUndefined();
    expect(minimised.metadata.nestedDump).toBeUndefined();
    expect(minimised.metadata.notes).toBeUndefined();
    expect(minimised.metadata.tooLong).toBeUndefined();
    expect(JSON.stringify(minimised.metadata)).not.toMatch(
      /Northwind Coaching|manager@example.com|transcript|reflection/i
    );
  });

  it("drops non-allowlisted keys including spoofed coaching content", () => {
    const metadata = minimisePlatformAuditMetadata({
      summary_text: "AI summary of the session",
      conversation_text: "full transcript",
      token: "secret",
      userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      category: "billing",
      fields: ["status", { sneaky: true }, "priority"],
    });
    expect(metadata.category).toBe("billing");
    expect(metadata.fields).toEqual(["status", "priority"]);
    expect(metadata.summary_text).toBeUndefined();
    expect(metadata.conversation_text).toBeUndefined();
    expect(metadata.token).toBeUndefined();
    expect(metadata.userId).toBeUndefined();
    expect(PLATFORM_AUDIT_METADATA_ALLOWLIST).not.toContain("userId");
    expect(PLATFORM_AUDIT_FIELD_TREATMENT.metadata).toBe("MINIMISE");
    expect(PLATFORM_AUDIT_METADATA_ALLOWLIST).not.toContain("email");
    expect(PLATFORM_AUDIT_METADATA_ALLOWLIST).not.toContain(
      "organisationNameSnapshot"
    );
  });

  it("fails closed on an unmapped audit column", () => {
    expect(() =>
      minimisePlatformAuditEvent({
        id: EVENT_ID,
        actor_user_id: null,
        action: "x",
        entity_type: "organisation",
        entity_id: ORG_ID,
        organisation_id: ORG_ID,
        former_organisation_id: null,
        metadata: {},
        created_at: "2026-08-27T12:00:00.000Z",
        payload_html: "<p>ticket body</p>",
      })
    ).toThrow(/UNKNOWN_COLUMN/);
  });

  it("retains entity_id only for the fail-closed entity_type allowlist", () => {
    expect(PLATFORM_AUDIT_FIELD_TREATMENT.entity_id).toBe("MINIMISE");
    expect(PLATFORM_AUDIT_FIELD_TREATMENT.actor_user_id).toBe("RETAIN");
    expect([...PLATFORM_AUDIT_ENTITY_ID_RETAIN_TYPES]).toEqual([
      "organisation_deletion_run",
      "support_case",
      "organisation_subscription",
      "invoice",
      "organisation_payment_method",
      "purchase_order",
      "organisation_contract",
      "organisation_trial",
    ]);

    function event(entityType: string, entityId: string | null = EVENT_ID) {
      return minimisePlatformAuditEvent({
        id: EVENT_ID,
        actor_user_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        action: "test.action",
        entity_type: entityType,
        entity_id: entityId,
        organisation_id: ORG_ID,
        former_organisation_id: null,
        metadata: { userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
        created_at: "2026-08-27T12:00:00.000Z",
      });
    }

    expect(event("organisation_deletion_run", RUN_ID).entity_id).toBe(RUN_ID);
    expect(event("support_case", CASE_ID).entity_id).toBe(CASE_ID);
    expect(event("organisation_subscription").entity_id).toBe(EVENT_ID);
    expect(event("invoice").entity_id).toBe(EVENT_ID);
    expect(event("organisation_payment_method").entity_id).toBe(EVENT_ID);
    expect(event("purchase_order").entity_id).toBe(EVENT_ID);
    expect(event("organisation_contract").entity_id).toBe(EVENT_ID);
    expect(event("organisation_trial").entity_id).toBe(EVENT_ID);

    expect(event("organisation", ORG_ID).entity_id).toBeNull();
    expect(event("organisation_membership").entity_id).toBeNull();
    expect(event("organisation_invitation").entity_id).toBeNull();
    expect(event("platform_settings", null).entity_id).toBeNull();
    expect(event("unknown_future_type").entity_id).toBeNull();
    expect(event("clients").entity_id).toBeNull();
    expect(event("sessions").entity_id).toBeNull();
    expect(minimisePlatformAuditEntityId("client", EVENT_ID)).toBeNull();
    expect(minimisePlatformAuditEntityId("session", EVENT_ID)).toBeNull();

    const retained = event("organisation_deletion_run", RUN_ID);
    expect(retained.actor_user_id).toBe("dddddddd-dddd-4ddd-8ddd-dddddddddddd");
    expect(retained.former_organisation_id).toBe(ORG_ID);
    expect(retained.metadata.userId).toBeUndefined();
  });
});

describe("DL-08 Slice 2 SQL and API contracts", () => {
  it("creates a Platform Owner minimise RPC without purge, Storage, or Auth delete", () => {
    expect(existsSync(join(root, MIGRATION))).toBe(true);
    const sql = read(MIGRATION);
    expect(sql).toContain("owner_minimise_organisation_retain_records");
    expect(sql).toContain("is_platform_owner");
    expect(sql).toContain("pending_closure");
    expect(sql).toContain("Minimised support case");
    expect(sql).toContain("minimise_platform_audit_metadata");
    expect(sql).toContain("minimise_platform_audit_entity_id");
    expect(sql).toContain("runStatusUnchanged");
    const entityIdFn = sql.slice(
      sql.indexOf("create or replace function public.minimise_platform_audit_entity_id"),
      sql.indexOf("comment on function public.minimise_platform_audit_entity_id")
    );
    const inList = entityIdFn.match(/p_entity_type in \(\s*([\s\S]*?)\s*\)/i);
    expect(inList).not.toBeNull();
    const sqlEntityIdAllowlist = [...inList![1].matchAll(/'([^']+)'/g)].map(
      match => match[1]
    );
    expect(sqlEntityIdAllowlist).toEqual([
      ...PLATFORM_AUDIT_ENTITY_ID_RETAIN_TYPES,
    ]);
    expect(entityIdFn).toMatch(/else\s+null/i);
    expect(sql).not.toMatch(/delete\s+from\s+public\.support_cases/i);
    expect(sql).not.toMatch(/delete\s+from\s+public\.platform_audit_events/i);
    expect(sql).not.toMatch(/delete\s+from\s+public\.organisations/i);
    expect(sql).not.toMatch(/delete\s+from\s+public\.clients/i);
    expect(sql).not.toMatch(/delete\s+from\s+public\.sessions/i);
    expect(sql).not.toContain("auth.admin.deleteUser");
    expect(sql).not.toContain("storage.remove");
    expect(sql).not.toContain("organisation_deletion_certificates");
    expect(sql).not.toMatch(/status\s*=\s*'purging'/);
    expect(sql).not.toMatch(/v_run\.status\s*=\s*'commercial_copied'/);
  });

  it("exposes a Platform Owner route with no DELETE method and safe payloads", () => {
    const route = read(
      "app/api/owner/organisations/[id]/retain-minimise/route.ts"
    );
    expect(route).toContain("requirePlatformOwner");
    expect(route).toContain("export async function GET");
    expect(route).toContain("export async function POST");
    expect(route).not.toContain("export async function DELETE");
    expect(route).toContain("assertOwnerPayloadIsSafe");
    expect(route).not.toContain("hasPermission");
    expect(OWNER_MINIMISE_ORGANISATION_RETAIN_RPC).toBe(
      "owner_minimise_organisation_retain_records"
    );
  });

  it("Owner Console shows retain_minimise without a purge action", () => {
    const page = read("app/owner/organisations/[id]/page.tsx");
    expect(page).toContain("RetainMinimisePanel");
    expect(page).toContain("Minimise retained support and audit records");
    expect(page).toContain("Support and audit retain / minimise");
    expect(page).toContain("Loading retain_minimise status…");
    expect(page).toContain(
      "retain_minimise is only available while the organisation is"
    );
    expect(page).toContain("retain_minimise is not available for this run state.");
    const panel = page.slice(page.indexOf("function RetainMinimisePanel"));
    expect(panel).not.toContain("if (!frozen) return null");
    expect(page).not.toContain("Delete organisation");
    expect(page).not.toMatch(/Permanently delete/i);
    expect(ORGANISATION_PURGE_MUST_NEVER_DELETE_AUTH_USERS).toBe(true);
  });
});

describe("DL-08 Slice 2 load and execute state", () => {
  it("reports pending versus minimised counts without exposing bodies", async () => {
    const state = await loadRetainMinimiseState({
      ownerSupabase: createInventoryClient(),
      inventorySupabase: createInventoryClient({
        supportPending: 1,
        supportMinimised: 0,
        auditPending: 4,
        auditMinimised: 0,
      }),
      organisationId: ORG_ID,
    });
    expect(state.minimiseAvailable).toBe(true);
    expect(state.alreadyMinimised).toBe(false);
    expect(state.pendingTotal).toBe(5);
    expect(state.permanentDeletionOccurred).toBe(false);
    expect(state.tenantRowsDeleted).toBe(false);
    expect(state.runStatusUnchanged).toBe(true);
    expect(JSON.stringify(state)).not.toMatch(
      /description|resolution_notes|private_notes|transcript/i
    );
    expect(() => assertOwnerPayloadIsSafe(state)).not.toThrow();
  });

  it("requires acknowledgement and does not invent a ready purge flag", async () => {
    const denied = await minimiseOrganisationRetainRecords({
      ownerSupabase: createInventoryClient(),
      inventorySupabase: createInventoryClient(),
      organisationId: ORG_ID,
      deletionRunId: RUN_ID,
      minimiseAcknowledged: false,
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.code).toBe("ACKNOWLEDGEMENT_REQUIRED");
    }

    const rpc = vi.fn().mockResolvedValue({
      data: {
        ok: true,
        alreadyMinimised: true,
        deletionRunId: RUN_ID,
        organisationStatus: "pending_closure",
        runStatus: "commercial_copied",
        stage: "commercial_copied",
      },
      error: null,
    });
    const owner = {
      ...createInventoryClient(),
      rpc,
    } as unknown as SupabaseClient;
    const result = await minimiseOrganisationRetainRecords({
      ownerSupabase: owner,
      inventorySupabase: createInventoryClient({
        supportPending: 0,
        supportMinimised: 1,
        auditPending: 0,
        auditMinimised: 4,
      }),
      organisationId: ORG_ID,
      deletionRunId: RUN_ID,
      minimiseAcknowledged: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.runStatus).toBe("commercial_copied");
      expect(result.runStatusUnchanged).toBe(true);
      expect(result.permanentDeletionOccurred).toBe(false);
      expect(JSON.stringify(result)).not.toContain("purgeReady");
      expect(JSON.stringify(result)).not.toMatch(/"result"\s*:\s*"ready"/);
    }
    expect(rpc).toHaveBeenCalledWith(OWNER_MINIMISE_ORGANISATION_RETAIN_RPC, {
      p_organisation_id: ORG_ID,
      p_deletion_run_id: RUN_ID,
    });
  });
});
