import { describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ORGANISATION_PERMISSIONS,
} from "@/lib/organisations/types";
import { hasPermission } from "@/lib/organisations/permissions";
import {
  confirmationNameMatches,
  normalisedInstructionReference,
  OWNER_INITIATE_ORGANISATION_CLOSURE_RPC,
  ORGANISATION_CLOSURE_INITIATION_RUN_STATUS,
  ORGANISATION_CLOSURE_INITIATION_STAGE,
  buildClosureInventorySnapshot,
  initiateOrganisationClosure,
} from "@/lib/owner/organisation-deletion-initiation";
import { loadOrganisationDeletionPreflight } from "@/lib/owner/organisation-deletion-preflight";

const root = process.cwd();
const MIGRATION =
  "supabase/migrations/20260827220000_organisation_deletion_initiation.sql";
const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const RUN_ID = "99999999-9999-4999-8999-999999999999";

function read(pathFromRoot: string): string {
  return readFileSync(join(root, pathFromRoot), "utf8");
}

function createInventoryClient(input?: {
  organisationType?: string;
  status?: string;
  name?: string;
  sampleAsOrg?: number;
  sampleAsSource?: number;
  undeletable?: boolean;
}): SupabaseClient {
  const organisation = {
    id: ORG_ID,
    name: input?.name ?? "Northwind",
    organisation_type: input?.organisationType ?? "business",
    status: input?.status ?? "active",
    licence_status: "active",
  };
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
            const asOrg = filters.some(
              ([, column]) => column === "organisation_id"
            );
            const count = asOrg
              ? (input?.sampleAsOrg ?? 0)
              : (input?.sampleAsSource ?? 0);
            return resolve({ data: [], count, error: null });
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
            throw new Error("storage delete is not allowed in DL-05");
          },
        };
      },
    },
  } as unknown as SupabaseClient;
}

function createOwnerClient(input: {
  organisation?: Record<string, unknown> | null;
  openRun?: Record<string, unknown> | null;
  rpc?: ReturnType<typeof vi.fn>;
}): SupabaseClient {
  const rpc =
    input.rpc ??
    vi.fn().mockResolvedValue({
      data: {
        ok: true,
        alreadyStarted: false,
        deletionRunId: RUN_ID,
        organisationId: ORG_ID,
        formerOrganisationId: ORG_ID,
        organisationStatus: "pending_closure",
        runStatus: "frozen",
        stage: "access_frozen",
        requestedAt: "2026-08-27T12:00:00.000Z",
        authorisedBy: "owner-user",
        instructionReference: "GDPR-1042",
        permanentDeletionOccurred: false,
      },
      error: null,
    });
  return {
    rpc,
    from(table: string) {
      const builder = {
        select() {
          return builder;
        },
        eq() {
          return builder;
        },
        neq() {
          return builder;
        },
        async maybeSingle() {
          if (table === "organisations") {
            return { data: input.organisation ?? null, error: null };
          }
          if (table === "organisation_deletion_runs") {
            return { data: input.openRun ?? null, error: null };
          }
          return { data: null, error: null };
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

describe("DL-05 confirmation and instruction helpers", () => {
  it("matches exact names after trim only", () => {
    expect(confirmationNameMatches("Northwind", "Northwind")).toBe(true);
    expect(confirmationNameMatches("Northwind", " Northwind ")).toBe(true);
    expect(confirmationNameMatches("Northwind", "northwind")).toBe(false);
    expect(confirmationNameMatches("Northwind", "North wind")).toBe(false);
  });

  it("rejects blank or oversized instruction references", () => {
    expect(normalisedInstructionReference("")).toBeNull();
    expect(normalisedInstructionReference("   ")).toBeNull();
    expect(normalisedInstructionReference("GDPR-1042")).toBe("GDPR-1042");
    expect(normalisedInstructionReference("x".repeat(201))).toBeNull();
  });
});

describe("DL-05 initiation RPC migration", () => {
  it("creates a Platform Owner security-definer freeze function without purge", () => {
    expect(existsSync(join(root, MIGRATION))).toBe(true);
    const sql = read(MIGRATION);
    expect(sql).toContain(
      "create or replace function public.owner_initiate_organisation_closure"
    );
    expect(sql).toContain("security definer");
    expect(sql).toContain("is_platform_owner");
    expect(sql).toContain("for update");
    expect(sql).toContain("status = 'pending_closure'");
    expect(sql).toContain("'frozen'");
    expect(sql).toContain("'access_frozen'");
    expect(sql).toContain("organisation.closure_initiated");
    expect(sql).toContain("'PERSONAL_ORGANISATION'");
    expect(sql).toContain("'SAMPLE_INSTALLATION'");
    expect(sql).toContain("'SAMPLE_SOURCE_ORGANISATION'");
    expect(sql).toContain("'UNDELETABLE_ORGANISATION'");
    expect(sql).toContain("'ARCHIVED_ORGANISATION'");
    expect(sql).toContain("'CONFIRMATION_MISMATCH'");
    expect(sql).toContain("'INSTRUCTION_REQUIRED'");
    expect(sql).toContain("alreadyStarted");
    expect(sql).toContain("organisation_deletion_runs_one_open_per_org_idx");
    expect(sql).not.toContain("p_eligible");
    expect(sql).not.toMatch(/delete\s+from\s+public\.organisations/i);
    expect(sql).not.toMatch(/delete\s+from\s+public\.clients/i);
    expect(sql).not.toMatch(/delete\s+from\s+public\.sessions/i);
    expect(sql).not.toMatch(/insert\s+into\s+public\.organisation_deletion_certificates/i);
    expect(sql).not.toMatch(
      /insert\s+into\s+public\.retained_organisation_commercial_records/i
    );
    expect(sql).not.toMatch(/storage\.objects/i);
    expect(sql).not.toMatch(/create\s+or\s+replace\s+function\s+public\.\w*purge/i);
    expect(sql).not.toMatch(
      /create\s+or\s+replace\s+function\s+public\.\w*delete_organisation/i
    );
    expect(sql).not.toContain("'commercial_copied'");
    expect(sql).not.toContain("'purging'");
    expect(sql).toContain("grant execute");
    expect(sql).toContain("to authenticated");
    expect(sql).toContain("from anon");
    expect(sql).not.toMatch(/\bcommit\b/i);
  });

  it("inserts the run before freezing status so a failed freeze rolls back", () => {
    const sql = read(MIGRATION);
    const insertRun = sql.indexOf("insert into public.organisation_deletion_runs");
    const freezeUpdate = sql.indexOf(
      "status = 'pending_closure',\n    updated_at = v_now"
    );
    expect(insertRun).toBeGreaterThan(-1);
    expect(freezeUpdate).toBeGreaterThan(insertRun);
    expect(sql).toContain("raise exception 'ORGANISATION_STATUS_UPDATE_FAILED'");
  });
});

describe("DL-05 API and UI contracts", () => {
  it("exposes Platform Owner GET/POST initiation without DELETE or purge", () => {
    const route = read(
      "app/api/owner/organisations/[id]/deletion-initiation/route.ts"
    );
    expect(route).toContain("requirePlatformOwner");
    expect(route).toContain("export async function GET");
    expect(route).toContain("export async function POST");
    expect(route).not.toContain("export async function DELETE");
    expect(route).not.toContain("export async function PATCH");
    expect(route).toContain("initiateOrganisationClosure");
    expect(route).toContain("assertOwnerPayloadIsSafe");
    expect(read("lib/owner/organisation-deletion-initiation.ts")).toContain(
      "loadOrganisationDeletionPreflight"
    );
    expect(route).not.toContain("hasPermission");
    expect(route).not.toContain("requireOrganisationPermission");
    expect(route).not.toContain("eligible=true");
    expect(existsSync(join(root, "app/api/owner/organisations/[id]/deletion/route.ts"))).toBe(
      false
    );
    expect(existsSync(join(root, "app/api/organisations/deletion-initiation/route.ts"))).toBe(
      false
    );
  });

  it("does not grant customer roles deletion or initiation authority", () => {
    expect(ORGANISATION_PERMISSIONS.join(" ")).not.toMatch(/delet/i);
    expect(ORGANISATION_PERMISSIONS.join(" ")).not.toMatch(/preflight/i);
    expect(ORGANISATION_PERMISSIONS.join(" ")).not.toMatch(/closure/i);
    expect(ORGANISATION_PERMISSIONS.join(" ")).not.toMatch(/purge/i);
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

  it("Owner Console initiation UI freezes without a purge continuation control", () => {
    const page = read("app/owner/organisations/[id]/page.tsx");
    expect(page).toContain("Authorise closure and freeze organisation");
    expect(page).toContain("Type the organisation name exactly");
    expect(page).toContain("Instruction / authority reference");
    expect(page).toContain("immediately freezes organisation access");
    expect(page).not.toContain("Delete organisation");
    expect(page).not.toMatch(/Permanently delete/i);
    expect(page).not.toMatch(/start deletion/i);
    expect(page).not.toMatch(/complete deletion/i);
    expect(page).not.toMatch(/Continue purge/i);
    expect(read("lib/owner/organisation-deletion-initiation.ts")).not.toMatch(
      /\.remove\(/
    );
    expect(read("lib/owner/organisation-deletion-initiation.ts")).not.toContain(
      "auth.admin.deleteUser"
    );
    const start = page.indexOf('{tab === "Data lifecycle"');
    const end = page.indexOf('{tab === "Settings"');
    const lifecycle = page.slice(start, end);
    expect(lifecycle).toContain("ClosureInitiationPanel");
    expect(lifecycle).not.toContain("Suspend organisation");
    expect(lifecycle).not.toContain('type="password"');
    expect(page).toContain('type="checkbox"');
  });
});

describe("DL-05 initiateOrganisationClosure", () => {
  const baseInput = {
    confirmationName: "Northwind",
    instructionReference: "GDPR-1042",
    freezeAcknowledged: true,
  };

  it("requires fresh eligible preflight and creates one frozen run", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        ok: true,
        alreadyStarted: false,
        deletionRunId: RUN_ID,
        organisationId: ORG_ID,
        formerOrganisationId: ORG_ID,
        organisationStatus: "pending_closure",
        runStatus: ORGANISATION_CLOSURE_INITIATION_RUN_STATUS,
        stage: ORGANISATION_CLOSURE_INITIATION_STAGE,
        requestedAt: "2026-08-27T12:00:00.000Z",
        authorisedBy: "owner-user",
        instructionReference: "GDPR-1042",
        permanentDeletionOccurred: false,
      },
      error: null,
    });
    const inventory = createInventoryClient();
    const result = await initiateOrganisationClosure({
      ownerSupabase: createOwnerClient({
        organisation: { id: ORG_ID, name: "Northwind", status: "active" },
        rpc,
      }),
      inventorySupabase: inventory,
      organisationId: ORG_ID,
      ...baseInput,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(OWNER_INITIATE_ORGANISATION_CLOSURE_RPC, {
      p_organisation_id: ORG_ID,
      p_confirmation_name: "Northwind",
      p_instruction_reference: "GDPR-1042",
      p_inventory: expect.objectContaining({
        eligibility: "eligible",
        permanentDeletionOccurred: false,
      }),
    });
    expect(result.organisationStatus).toBe("pending_closure");
    expect(result.runStatus).toBe("frozen");
    expect(result.permanentDeletionOccurred).toBe(false);
    expect(result.deletionRunId).toBe(RUN_ID);
  });

  it("does not call the RPC when fresh preflight is blocked or needs review", async () => {
    const rpc = vi.fn();
    const personal = await initiateOrganisationClosure({
      ownerSupabase: createOwnerClient({ rpc }),
      inventorySupabase: createInventoryClient({ organisationType: "personal" }),
      organisationId: ORG_ID,
      ...baseInput,
    });
    expect(personal.ok).toBe(false);
    if (personal.ok) return;
    expect(personal.code).toBe("PREFLIGHT_NOT_ELIGIBLE");
    expect(personal.eligibility).toBe("blocked");
    expect(rpc).not.toHaveBeenCalled();

    const review = await initiateOrganisationClosure({
      ownerSupabase: createOwnerClient({ rpc }),
      inventorySupabase: createInventoryClient({ sampleAsSource: 1 }),
      organisationId: ORG_ID,
      ...baseInput,
    });
    expect(review.ok).toBe(false);
    if (review.ok) return;
    expect(review.code).toBe("PREFLIGHT_NOT_ELIGIBLE");
    expect(review.eligibility).toBe("requires_review");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects sample installation, undeletable, mismatched name, and blank instruction without RPC", async () => {
    const rpc = vi.fn();
    const sample = await initiateOrganisationClosure({
      ownerSupabase: createOwnerClient({ rpc }),
      inventorySupabase: createInventoryClient({ sampleAsOrg: 1 }),
      organisationId: ORG_ID,
      ...baseInput,
    });
    expect(sample.ok).toBe(false);
    if (!sample.ok) expect(sample.eligibility).toBe("blocked");

    const undeletable = await initiateOrganisationClosure({
      ownerSupabase: createOwnerClient({ rpc }),
      inventorySupabase: createInventoryClient({ undeletable: true }),
      organisationId: ORG_ID,
      ...baseInput,
    });
    expect(undeletable.ok).toBe(false);

    const mismatch = await initiateOrganisationClosure({
      ownerSupabase: createOwnerClient({ rpc }),
      inventorySupabase: createInventoryClient(),
      organisationId: ORG_ID,
      confirmationName: "Wrong Co",
      instructionReference: "GDPR-1042",
      freezeAcknowledged: true,
    });
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) expect(mismatch.code).toBe("CONFIRMATION_MISMATCH");

    const blank = await initiateOrganisationClosure({
      ownerSupabase: createOwnerClient({ rpc }),
      inventorySupabase: createInventoryClient(),
      organisationId: ORG_ID,
      confirmationName: "Northwind",
      instructionReference: "  ",
      freezeAcknowledged: true,
    });
    expect(blank.ok).toBe(false);
    if (!blank.ok) expect(blank.code).toBe("INSTRUCTION_REQUIRED");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns the existing open run without creating another", async () => {
    const rpc = vi.fn();
    const result = await initiateOrganisationClosure({
      ownerSupabase: createOwnerClient({
        organisation: {
          id: ORG_ID,
          name: "Northwind",
          status: "pending_closure",
        },
        openRun: {
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
        },
        rpc,
      }),
      inventorySupabase: createInventoryClient(),
      organisationId: ORG_ID,
      ...baseInput,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.alreadyStarted).toBe(true);
    expect(result.deletionRunId).toBe(RUN_ID);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("stores count-only inventory without member user ids or coaching payload", async () => {
    const preflight = await loadOrganisationDeletionPreflight({
      supabase: createInventoryClient(),
      organisationId: ORG_ID,
    });
    const snapshot = buildClosureInventorySnapshot(preflight);
    expect(JSON.stringify(snapshot)).not.toMatch(/userId|private_notes|extracted_text/);
    expect(snapshot.permanentDeletionOccurred).toBe(false);
  });

  it("does not acknowledge freeze without the explicit flag", async () => {
    const rpc = vi.fn();
    const result = await initiateOrganisationClosure({
      ownerSupabase: createOwnerClient({ rpc }),
      inventorySupabase: createInventoryClient(),
      organisationId: ORG_ID,
      confirmationName: "Northwind",
      instructionReference: "GDPR-1042",
      freezeAcknowledged: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("ACKNOWLEDGEMENT_REQUIRED");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("fails closed for archived organisations even if preflight is otherwise eligible", async () => {
    const rpc = vi.fn();
    const result = await initiateOrganisationClosure({
      ownerSupabase: createOwnerClient({ rpc }),
      inventorySupabase: createInventoryClient({ status: "archived" }),
      organisationId: ORG_ID,
      confirmationName: "Northwind",
      instructionReference: "GDPR-1042",
      freezeAcknowledged: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("ARCHIVED_ORGANISATION");
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("DL-05 freeze helpers remain fail-closed", () => {
  it("does not replace pending_closure access helpers", () => {
    const sql = read(MIGRATION);
    expect(sql).not.toContain(
      "create or replace function public.has_organisation_permission"
    );
    expect(sql).not.toContain("user_can_access_client_content");
    expect(sql).not.toContain("accept_organisation_invitation");
    const freeze = read(
      "supabase/migrations/20260827200000_organisation_deletion_foundation.sql"
    );
    expect(freeze).toContain("pending_closure organisations fail closed");
    expect(freeze).toContain("coach_id = p_user_id");
  });
});
