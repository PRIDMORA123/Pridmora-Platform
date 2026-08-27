import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertOwnerPayloadIsSafe } from "@/lib/owner/privacy";
import {
  classifyEvidenceStoragePath,
  loadOrganisationDeletionPreflight,
  parseUndeletableOrganisationIds,
  resolveDeletionEligibility,
} from "@/lib/owner/organisation-deletion-preflight";
import { UNDELETABLE_ORGANISATION_IDS_SETTING_KEY } from "@/lib/owner/organisation-deletion-foundation";

const root = process.cwd();
const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLIENT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER_ORG = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const USER_SOLE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const USER_SHARED = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

function read(pathFromRoot: string): string {
  return readFileSync(join(root, pathFromRoot), "utf8");
}

type TableConfig = {
  count?: number;
  rows?: Record<string, unknown>[];
  maybeSingle?: Record<string, unknown> | null;
  error?: { message: string };
};

function createPreflightClient(input: {
  organisation?: Record<string, unknown> | null;
  settingsIds?: string[];
  tables?: Record<string, TableConfig>;
  storageEntries?: Array<{ name: string; id?: string | null; metadata?: unknown }>;
  storageError?: { message: string };
  writes: { insert: number; update: number; delete: number; remove: number };
  queries?: Array<{ table: string; filters: Array<[string, string, unknown]>; head: boolean }>;
}): SupabaseClient {
  const tables: Record<string, TableConfig> = {
    organisations: {
      maybeSingle: input.organisation === undefined
        ? {
            id: ORG_ID,
            name: "Northwind",
            organisation_type: "business",
            status: "active",
            licence_status: "active",
          }
        : input.organisation,
    },
    platform_settings: {
      maybeSingle: {
        value: { ids: input.settingsIds ?? [] },
      },
    },
    ...input.tables,
  };

  return {
    from(table: string) {
      const filters: Array<[string, string, unknown]> = [];
      let head = false;
      const builder = {
        select(_columns?: string, opts?: { head?: boolean; count?: string }) {
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
        in(column: string, values: unknown) {
          filters.push(["in", column, values]);
          return builder;
        },
        range() {
          return builder;
        },
        insert() {
          input.writes.insert += 1;
          return { error: { message: "writes are not allowed in DL-04" } };
        },
        update() {
          input.writes.update += 1;
          return builder;
        },
        delete() {
          input.writes.delete += 1;
          return builder;
        },
        async maybeSingle() {
          input.queries?.push({ table, filters: [...filters], head });
          const config = tables[table] ?? {};
          return { data: config.maybeSingle ?? null, error: config.error ?? null };
        },
        then(
          resolve: (value: {
            data: Record<string, unknown>[] | null;
            count: number | null;
            error: { message: string } | null;
          }) => unknown
        ) {
          input.queries?.push({ table, filters: [...filters], head });
          const config = tables[table] ?? {};
          const orgScope = filters.find(
            ([op, column]) => op === "eq" && column === "organisation_id"
          );
          if (orgScope && String(orgScope[2]) !== ORG_ID) {
            return resolve({ data: [], count: 0, error: null });
          }
          if (config.error) {
            return resolve({ data: null, count: null, error: config.error });
          }
          if (table === "sample_organisation_installations") {
            const asOrg = filters.some(
              ([op, column]) => op === "eq" && column === "organisation_id"
            );
            const count = asOrg
              ? (tables.sample_as_org?.count ?? 0)
              : (tables.sample_as_source?.count ?? 0);
            return resolve({ data: [], count, error: null });
          }
          if (table === "organisation_memberships") {
            const userFilter = filters.find(
              ([op, column]) => op === "eq" && column === "user_id"
            );
            if (userFilter && head) {
              const userId = String(userFilter[2]);
              const count = userId === USER_SHARED ? 1 : 0;
              return resolve({ data: [], count, error: null });
            }
            if (!head) {
              return resolve({
                data: config.rows ?? [
                  { user_id: USER_SOLE, role: "owner", status: "active" },
                ],
                count: null,
                error: null,
              });
            }
          }
          if (!head && config.rows) {
            return resolve({ data: config.rows, count: config.rows.length, error: null });
          }
          return resolve({
            data: config.rows ?? [],
            count: config.count ?? 0,
            error: null,
          });
        },
      };
      return builder;
    },
    storage: {
      from() {
        return {
          async list() {
            if (input.storageError) {
              return { data: null, error: input.storageError };
            }
            return { data: input.storageEntries ?? [], error: null };
          },
          async remove() {
            input.writes.remove += 1;
            return { data: null, error: { message: "storage delete is not allowed" } };
          },
        };
      },
    },
  } as unknown as SupabaseClient;
}

describe("DL-04 eligibility rules", () => {
  it("blocks missing, personal, sample, and undeletable organisations", () => {
    expect(
      resolveDeletionEligibility({
        found: false,
        organisationType: null,
        isSampleInstallation: false,
        isUndeletable: false,
        inventoryIncomplete: false,
        reviewReasons: [],
      }).eligibility
    ).toBe("blocked");
    expect(
      resolveDeletionEligibility({
        found: true,
        organisationType: "personal",
        isSampleInstallation: false,
        isUndeletable: false,
        inventoryIncomplete: false,
        reviewReasons: [],
      }).reasons.map(reason => reason.code)
    ).toContain("PERSONAL_ORGANISATION");
    expect(
      resolveDeletionEligibility({
        found: true,
        organisationType: "business",
        isSampleInstallation: true,
        isUndeletable: false,
        inventoryIncomplete: false,
        reviewReasons: [],
      }).eligibility
    ).toBe("blocked");
    expect(
      resolveDeletionEligibility({
        found: true,
        organisationType: "business",
        isSampleInstallation: false,
        isUndeletable: true,
        inventoryIncomplete: false,
        reviewReasons: [],
      }).reasons.map(reason => reason.code)
    ).toContain("UNDELETABLE_ORGANISATION");
  });

  it("does not treat suspended or pending_closure as eligibility", () => {
    const result = resolveDeletionEligibility({
      found: true,
      organisationType: "business",
      isSampleInstallation: false,
      isUndeletable: false,
      inventoryIncomplete: false,
      reviewReasons: [],
    });
    expect(result.eligibility).toBe("eligible");
    expect(result.reasons).toEqual([]);
  });

  it("fails closed when inventory is incomplete or residuals need review", () => {
    expect(
      resolveDeletionEligibility({
        found: true,
        organisationType: "business",
        isSampleInstallation: false,
        isUndeletable: false,
        inventoryIncomplete: true,
        reviewReasons: [],
      }).eligibility
    ).toBe("requires_review");
    expect(
      resolveDeletionEligibility({
        found: true,
        organisationType: "business",
        isSampleInstallation: false,
        isUndeletable: false,
        inventoryIncomplete: false,
        reviewReasons: [
          {
            code: "STORAGE_PATH_NOT_AUTHORITATIVE",
            severity: "review",
            message: "Unproven storage path",
          },
        ],
      }).eligibility
    ).toBe("requires_review");
  });
});

describe("DL-04 storage path classification", () => {
  it("accepts authoritative org/client paths and rejects unparseable or foreign paths", () => {
    const clients = new Set([CLIENT_ID]);
    expect(
      classifyEvidenceStoragePath({
        storagePath: `${ORG_ID}/${CLIENT_ID}/abcd1234-file.pdf`,
        organisationId: ORG_ID,
        organisationClientIds: clients,
      })
    ).toBe("authoritative");
    expect(
      classifyEvidenceStoragePath({
        storagePath: "not-a-path",
        organisationId: ORG_ID,
        organisationClientIds: clients,
      })
    ).toBe("unparseable");
    expect(
      classifyEvidenceStoragePath({
        storagePath: `${OTHER_ORG}/${CLIENT_ID}/abcd1234-file.pdf`,
        organisationId: ORG_ID,
        organisationClientIds: clients,
      })
    ).toBe("foreign");
  });
});

describe("DL-04 undeletable setting parser", () => {
  it("reads uuid ids only", () => {
    expect(parseUndeletableOrganisationIds({ ids: [ORG_ID, "nope"] })).toEqual([
      ORG_ID,
    ]);
    expect(parseUndeletableOrganisationIds(null)).toEqual([]);
    expect(UNDELETABLE_ORGANISATION_IDS_SETTING_KEY).toBe(
      "undeletable_organisation_ids"
    );
  });
});

describe("DL-04 preflight loader", () => {
  it("blocks a personal organisation without writing deletion foundation rows", async () => {
    const writes = { insert: 0, update: 0, delete: 0, remove: 0 };
    const supabase = createPreflightClient({
      organisation: {
        id: ORG_ID,
        name: "Personal workspace",
        organisation_type: "personal",
        status: "active",
        licence_status: "active",
      },
      writes,
    });
    const result = await loadOrganisationDeletionPreflight({
      supabase,
      organisationId: ORG_ID,
    });
    expect(result.eligibility).toBe("blocked");
    expect(result.reasons.map(reason => reason.code)).toContain(
      "PERSONAL_ORGANISATION"
    );
    expect(result.deletionFoundation.wroteNothing).toBe(true);
    expect(result.sharedUsers.authUsersAreNotDeleted).toBe(true);
    expect(result.storage.deletedNothing).toBe(true);
    expect(writes).toEqual({ insert: 0, update: 0, delete: 0, remove: 0 });
  });

  it("blocks sample installations and undeletable IDs", async () => {
    const sampleWrites = { insert: 0, update: 0, delete: 0, remove: 0 };
    const sample = await loadOrganisationDeletionPreflight({
      supabase: createPreflightClient({
        tables: { sample_as_org: { count: 1 } },
        writes: sampleWrites,
      }),
      organisationId: ORG_ID,
    });
    expect(sample.eligibility).toBe("blocked");
    expect(sample.reasons.map(reason => reason.code)).toContain(
      "SAMPLE_INSTALLATION"
    );

    const undeletable = await loadOrganisationDeletionPreflight({
      supabase: createPreflightClient({
        settingsIds: [ORG_ID],
        writes: { insert: 0, update: 0, delete: 0, remove: 0 },
      }),
      organisationId: ORG_ID,
    });
    expect(undeletable.eligibility).toBe("blocked");
    expect(undeletable.reasons.map(reason => reason.code)).toContain(
      "UNDELETABLE_ORGANISATION"
    );
  });

  it("blocks organisation not found", async () => {
    const result = await loadOrganisationDeletionPreflight({
      supabase: createPreflightClient({
        organisation: null,
        writes: { insert: 0, update: 0, delete: 0, remove: 0 },
      }),
      organisationId: ORG_ID,
    });
    expect(result.eligibility).toBe("blocked");
    expect(result.organisation).toBeNull();
    expect(result.reasons[0]?.code).toBe("ORGANISATION_NOT_FOUND");
  });

  it("does not treat pending_closure or suspended licence as deletion eligibility", async () => {
    const result = await loadOrganisationDeletionPreflight({
      supabase: createPreflightClient({
        organisation: {
          id: ORG_ID,
          name: "Northwind",
          organisation_type: "business",
          status: "pending_closure",
          licence_status: "suspended",
        },
        writes: { insert: 0, update: 0, delete: 0, remove: 0 },
      }),
      organisationId: ORG_ID,
    });
    expect(result.eligibility).toBe("eligible");
    expect(result.reasons).toEqual([]);
    expect(result.organisation?.status).toBe("pending_closure");
    expect(
      result.knownLimitations.some(item => /pending_closure/i.test(item))
    ).toBe(true);
  });

  it("inventories a customer organisation by organisation_id and descendant clients", async () => {
    const writes = { insert: 0, update: 0, delete: 0, remove: 0 };
    const result = await loadOrganisationDeletionPreflight({
      supabase: createPreflightClient({
        tables: {
          clients: {
            count: 1,
            rows: [{ id: CLIENT_ID }],
          },
          sessions: {
            count: 2,
            rows: [
              { id: "11111111-1111-4111-8111-111111111111" },
              { id: "22222222-2222-4222-8222-222222222222" },
            ],
          },
          organisation_memberships: {
            rows: [
              { user_id: USER_SOLE, role: "owner", status: "active" },
              { user_id: USER_SHARED, role: "practitioner", status: "active" },
            ],
          },
          invoices: { count: 3 },
        },
        writes,
      }),
      organisationId: ORG_ID,
    });
    expect(result.organisation?.id).toBe(ORG_ID);
    expect(result.inventory.find(item => item.key === "clients")?.count).toBe(1);
    expect(result.inventory.find(item => item.key === "sessions")?.targeting).toBe(
      "organisation_id"
    );
    expect(result.commercial.find(item => item.key === "invoices")?.count).toBe(3);
    expect(result.commercial.find(item => item.key === "invoices")?.disposition).toBe(
      "retain"
    );
    expect(result.sharedUsers.soleTenantUserCount).toBe(1);
    expect(result.sharedUsers.sharedTenantUserCount).toBe(1);
    expect(result.sharedUsers.members.every(member => member.survivesTenantDeletion)).toBe(
      true
    );
    expect(result.eligibility).toBe("eligible");
    expect(JSON.stringify(result)).not.toMatch(/private_notes|extracted_text|approved_content|reflection_text/);
    expect(result.deletionFoundation).toEqual({
      openRunCount: 0,
      certificateCount: 0,
      retainedCommercialCount: 0,
      wroteNothing: true,
    });
    expect(result.organisation?.status).toBe("active");
    expect(result.residuals.some(item => item.attribution === "not_searched")).toBe(
      true
    );
    expect(result.residuals.some(item => item.attribution === "authoritative_record_id")).toBe(
      true
    );
    expect(writes).toEqual({ insert: 0, update: 0, delete: 0, remove: 0 });
    expect(() => assertOwnerPayloadIsSafe(result)).not.toThrow();
  });

  it("requires review when storage paths are not authoritative", async () => {
    const result = await loadOrganisationDeletionPreflight({
      supabase: createPreflightClient({
        tables: {
          development_evidence_documents: {
            rows: [{ id: CLIENT_ID, storage_path: "not-a-valid-path" }],
          },
        },
        writes: { insert: 0, update: 0, delete: 0, remove: 0 },
      }),
      organisationId: ORG_ID,
    });
    expect(result.eligibility).toBe("requires_review");
    expect(result.reasons.map(reason => reason.code)).toContain(
      "STORAGE_PATH_NOT_AUTHORITATIVE"
    );
    expect(result.storage.ownership).toBe("requires_review");
    expect(result.storage.deletedNothing).toBe(true);
  });

  it("requires review when session organisation_id and client descendants disagree", async () => {
    const result = await loadOrganisationDeletionPreflight({
      supabase: createPreflightClient({
        tables: {
          sessions: { count: 4 },
          clients: { count: 0, rows: [] },
        },
        writes: { insert: 0, update: 0, delete: 0, remove: 0 },
      }),
      organisationId: ORG_ID,
    });
    expect(result.reasons.map(reason => reason.code)).toContain(
      "SESSION_TENANT_MISMATCH"
    );
    expect(result.eligibility).toBe("requires_review");
  });

  it("requires review when listed descendant ids do not match counts", async () => {
    const result = await loadOrganisationDeletionPreflight({
      supabase: createPreflightClient({
        tables: {
          clients: { count: 2, rows: [{ id: CLIENT_ID }] },
        },
        writes: { insert: 0, update: 0, delete: 0, remove: 0 },
      }),
      organisationId: ORG_ID,
    });
    expect(result.reasons.map(reason => reason.code)).toContain(
      "CLIENT_ID_LIST_INCOMPLETE"
    );
    expect(result.eligibility).toBe("requires_review");
  });

  it("requires review for sample pack source organisations without blocking as an installation", async () => {
    const result = await loadOrganisationDeletionPreflight({
      supabase: createPreflightClient({
        tables: { sample_as_source: { count: 1 } },
        writes: { insert: 0, update: 0, delete: 0, remove: 0 },
      }),
      organisationId: ORG_ID,
    });
    expect(result.reasons.map(reason => reason.code)).toContain(
      "SAMPLE_SOURCE_ORGANISATION"
    );
    expect(result.reasons.map(reason => reason.code)).not.toContain(
      "SAMPLE_INSTALLATION"
    );
    expect(result.eligibility).toBe("requires_review");
  });

  it("does not count cross-tenant organisation_id rows and scopes descendant queries", async () => {
    const queries: Array<{
      table: string;
      filters: Array<[string, string, unknown]>;
      head: boolean;
    }> = [];
    const result = await loadOrganisationDeletionPreflight({
      supabase: createPreflightClient({
        tables: {
          clients: {
            count: 1,
            rows: [{ id: CLIENT_ID }],
          },
        },
        writes: { insert: 0, update: 0, delete: 0, remove: 0 },
        queries,
      }),
      organisationId: ORG_ID,
    });
    expect(result.inventory.find(item => item.key === "clients")?.count).toBe(1);
    const foreignOrgCounts = queries.filter(query =>
      query.filters.some(
        ([op, column, value]) =>
          op === "eq" && column === "organisation_id" && value === OTHER_ORG
      )
    );
    expect(foreignOrgCounts).toEqual([]);
    const clientQueries = queries.filter(query => query.table === "clients");
    expect(
      clientQueries.every(query =>
        query.filters.some(
          ([op, column, value]) =>
            op === "eq" && column === "organisation_id" && value === ORG_ID
        )
      )
    ).toBe(true);
  });

  it("fails closed when a required surface cannot be counted", async () => {
    const result = await loadOrganisationDeletionPreflight({
      supabase: createPreflightClient({
        tables: {
          sessions: { error: { message: "permission denied for table sessions" } },
        },
        writes: { insert: 0, update: 0, delete: 0, remove: 0 },
      }),
      organisationId: ORG_ID,
    });
    expect(result.eligibility).toBe("requires_review");
    expect(result.reasons.map(reason => reason.code)).toContain("INVENTORY_INCOMPLETE");
    expect(result.inventory.find(item => item.key === "sessions")?.counted).toBe(false);
  });
});

describe("DL-04 API and UI contracts", () => {
  it("exposes a Platform Owner GET preflight route with no mutating methods", () => {
    const path =
      "app/api/owner/organisations/[id]/deletion-preflight/route.ts";
    expect(existsSync(join(root, path))).toBe(true);
    const route = read(path);
    expect(route).toContain("requirePlatformOwner");
    expect(route).toContain("export async function GET");
    expect(route).not.toContain("export async function POST");
    expect(route).not.toContain("export async function PATCH");
    expect(route).not.toContain("export async function DELETE");
    expect(route).toContain("assertOwnerPayloadIsSafe");
    expect(route).toContain("getSupabaseServiceClient");
    expect(route).toContain("isSupabaseServiceRoleConfigured");
    expect(route).not.toContain("hasPermission");
    expect(route).not.toContain("requireOrganisationPermission");
    expect(route).not.toContain("requireOrganisationContext");
  });

  it("preflight module is read-only and does not select confidential payloads", () => {
    const source = read("lib/owner/organisation-deletion-preflight.ts");
    expect(source).not.toMatch(/\.insert\(/);
    expect(source).not.toMatch(/\.update\(/);
    expect(source).not.toMatch(/\.delete\(/);
    expect(source).not.toMatch(/\.remove\(/);
    expect(source).not.toMatch(/\.rpc\(/);
    expect(source).not.toContain("extracted_text");
    expect(source).not.toContain("private_notes");
    expect(source).not.toContain("approved_content");
    expect(source).not.toContain("structured_evidence");
    expect(source).not.toContain("real_name");
    expect(source).not.toContain("details::text");
    expect(source).not.toMatch(/\.like\(/);
    expect(source).not.toMatch(/select\(["']notes["']/);
    expect(source).toContain("details JSON is not searched");
    expect(source).toContain("record_id");
    expect(source).toContain("client_private_identities");
    expect(source).toMatch(/select\("\*", \{ count: "exact", head: true \}\)/);
  });

  it("Owner Console shows read-only preflight with no delete action", () => {
    const page = read("app/owner/organisations/[id]/page.tsx");
    expect(page).toContain("Data lifecycle");
    expect(page).toContain("deletion-preflight");
    expect(page).toContain("does not delete data");
    expect(page).not.toMatch(/Permanently delete/i);
    expect(page).not.toMatch(/start deletion/i);
    expect(page).not.toContain('type="password"');
    const start = page.indexOf('{tab === "Data lifecycle"');
    const end = page.indexOf('{tab === "Settings"');
    const lifecycle = page.slice(start, end);
    expect(lifecycle).toContain("Deletion preflight");
    expect(lifecycle).toContain("Blocking / review reasons");
    expect(lifecycle).toContain("ClosureInitiationPanel");
    expect(page).toContain("Authorise closure and freeze organisation");
    expect(lifecycle).not.toContain("Suspend organisation");
    expect(lifecycle).not.toContain("Delete organisation");
    expect(lifecycle).not.toContain("Start deletion");
    expect(page).not.toMatch(/Permanently delete/i);
    expect(page).not.toMatch(/complete deletion/i);
  });

  it("does not add customer-facing deletion or preflight routes", () => {
    expect(
      existsSync(join(root, "app/api/organisations/deletion-preflight/route.ts"))
    ).toBe(false);
    expect(
      existsSync(join(root, "app/api/owner/organisations/[id]/deletion/route.ts"))
    ).toBe(false);
  });
});
