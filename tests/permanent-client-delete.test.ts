import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

type DeleteCall = {
  table: string;
  filters: Record<string, string>;
};

function createTrackingSupabase(clientId: string, coachId: string) {
  const deletes: DeleteCall[] = [];
  let otherClientDeletes = 0;

  function from(table: string) {
    const filters: Record<string, string> = {};
    const api = {
      select(_cols: string) {
        return {
          eq(column: string, value: string) {
            filters[column] = value;
            return this;
          },
          maybeSingle: async () => {
            if (
              table === "clients" &&
              filters.id === clientId &&
              filters.coach_id === coachId
            ) {
              return {
                data: { id: clientId, archived_at: null, status: "Active" },
                error: null,
              };
            }
            return { data: null, error: null };
          },
        };
      },
      delete() {
        return {
          eq(column: string, value: string) {
            filters[column] = value;
            return this;
          },
          select(_cols?: string) {
            return {
              maybeSingle: async () => {
                if (filters.id && filters.id !== clientId) {
                  otherClientDeletes += 1;
                }
                deletes.push({ table, filters: { ...filters } });
                return {
                  data:
                    table === "clients" && filters.id === clientId
                      ? { id: clientId }
                      : null,
                  error: null,
                };
              },
            };
          },
          then(resolve: (value: { error: null }) => unknown) {
            if (filters.client_id && filters.client_id !== clientId) {
              otherClientDeletes += 1;
            }
            deletes.push({ table, filters: { ...filters } });
            return Promise.resolve(resolve({ error: null }));
          },
        };
      },
    };
    return api;
  }

  return {
    supabase: { from } as never,
    deletes,
    getOtherClientDeletes: () => otherClientDeletes,
  };
}

describe("permanent client delete dependent order (source contract)", () => {
  it("removes development_updates, profiles and assignments before sessions", () => {
    const source = read("lib/supabase/repository.ts");
    const fnStart = source.indexOf("async function deleteOwnedClientDependents");
    expect(fnStart).toBeGreaterThan(-1);
    const fnBody = source.slice(
      fnStart,
      source.indexOf("function withUuidIds", fnStart)
    );

    const updates = fnBody.indexOf('"development_updates"');
    const profiles = fnBody.indexOf('"development_profiles"');
    const assignments = fnBody.indexOf('"relationship_assignments"');
    const sessions = fnBody.indexOf('"sessions"');

    expect(updates).toBeGreaterThan(-1);
    expect(profiles).toBeGreaterThan(-1);
    expect(assignments).toBeGreaterThan(-1);
    expect(sessions).toBeGreaterThan(-1);
    expect(updates).toBeLessThan(sessions);
    expect(profiles).toBeLessThan(sessions);
    expect(assignments).toBeLessThan(sessions);
  });
});

describe("permanentlyDeleteClientInDb dependent cleanup", () => {
  const clientId = "9e15a4b5-c94c-4827-a848-f6eb8a7c8d39";
  const coachId = "01aa1f21-574d-4f17-97d9-1d2ad79f8188";
  const otherClientId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

  beforeEach(() => {
    vi.resetModules();
    vi.doMock("@/lib/supabase/env", () => ({
      getSupabaseUrl: () => "https://example.supabase.co",
      getSupabaseServiceRoleKey: () => undefined,
      isSupabaseServiceRoleConfigured: () => false,
    }));
  });

  it("deletes development_updates before sessions and succeeds with profiles/assignments present", async () => {
    const { supabase, deletes, getOtherClientDeletes } = createTrackingSupabase(
      clientId,
      coachId
    );

    const { permanentlyDeleteClientInDb } = await import(
      "@/lib/supabase/repository"
    );

    const ok = await permanentlyDeleteClientInDb(supabase, coachId, clientId);
    expect(ok).toBe(true);

    const tableOrder = deletes.map(call => call.table);
    expect(tableOrder.indexOf("development_updates")).toBeGreaterThan(-1);
    expect(tableOrder.indexOf("development_profiles")).toBeGreaterThan(-1);
    expect(tableOrder.indexOf("relationship_assignments")).toBeGreaterThan(-1);
    expect(tableOrder.indexOf("sessions")).toBeGreaterThan(-1);
    expect(tableOrder.indexOf("development_updates")).toBeLessThan(
      tableOrder.indexOf("sessions")
    );
    expect(tableOrder.indexOf("development_profiles")).toBeLessThan(
      tableOrder.indexOf("sessions")
    );
    expect(tableOrder.indexOf("relationship_assignments")).toBeLessThan(
      tableOrder.indexOf("sessions")
    );
    expect(tableOrder).toContain("clients");

    for (const call of deletes) {
      if (call.table === "clients") {
        expect(call.filters.id).toBe(clientId);
        expect(call.filters.coach_id).toBe(coachId);
      } else if (call.table === "relationship_assignments") {
        expect(call.filters.client_id).toBe(clientId);
        expect(call.filters.client_id).not.toBe(otherClientId);
      } else if (
        call.filters.client_id !== undefined ||
        call.filters.user_id !== undefined
      ) {
        expect(call.filters.client_id ?? clientId).toBe(clientId);
        expect(call.filters.client_id).not.toBe(otherClientId);
      }
    }

    expect(getOtherClientDeletes()).toBe(0);
  });

  it("scopes pre-session deletes to the selected client only", async () => {
    const { supabase, deletes } = createTrackingSupabase(clientId, coachId);
    const { permanentlyDeleteClientInDb } = await import(
      "@/lib/supabase/repository"
    );

    await permanentlyDeleteClientInDb(supabase, coachId, clientId);

    const preSession = deletes.filter(call =>
      [
        "development_updates",
        "development_profiles",
        "relationship_assignments",
      ].includes(call.table)
    );
    expect(preSession).toHaveLength(3);
    for (const call of preSession) {
      expect(call.filters.client_id).toBe(clientId);
    }

    const coachScoped = preSession.filter(call =>
      ["development_updates", "development_profiles"].includes(call.table)
    );
    for (const call of coachScoped) {
      expect(call.filters.coach_id).toBe(coachId);
    }
  });
});
