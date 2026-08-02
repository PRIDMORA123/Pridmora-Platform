import { describe, expect, it, vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  DISPOSABLE_USER_DELETE_BLOCKER,
  cleanupDisposableAuthUser,
  deleteAuthUserWithRetry,
  listDeletablePersonalOrganisations,
  verifyDisposableUserCleanup,
} from "../scripts/qa/lib/qa-disposable-user-cleanup.mjs";

const root = process.cwd();

function read(pathFromRoot: string): string {
  return readFileSync(join(root, pathFromRoot), "utf8");
}

describe("disposable auth user cleanup", () => {
  it("documents organisations.created_by as RESTRICT (the deleteUser blocker)", () => {
    const sql = read(
      "supabase/migrations/20260802140000_organisation_foundation.sql"
    );
    expect(sql).toMatch(
      /created_by uuid not null references auth\.users\(id\)/
    );
    expect(sql).not.toMatch(
      /created_by uuid not null references auth\.users\(id\) on delete/i
    );
    expect(DISPOSABLE_USER_DELETE_BLOCKER.table).toBe("organisations");
    expect(DISPOSABLE_USER_DELETE_BLOCKER.column).toBe("created_by");
  });

  it("ships personal-org creation on profile insert", () => {
    const sql = read(
      "supabase/migrations/20260802140000_organisation_foundation.sql"
    );
    expect(sql).toContain("ensure_personal_organisation");
    expect(sql).toContain("on_profile_ensure_organisation");
    expect(sql).toContain("handle_new_user_organisation");
  });

  it("ships the disposable cleanup helper used by QA auth delete", () => {
    expect(
      existsSync(
        join(root, "scripts/qa/lib/qa-disposable-user-cleanup.mjs")
      )
    ).toBe(true);
    const auth = read("scripts/qa/lib/qa-auth.mjs");
    expect(auth).toContain("cleanupDisposableAuthUser");
    expect(auth).toContain("verifyDisposableUserCleanup");
  });

  it("refuses to delete shared organisations owned by the user", async () => {
    const admin = {
      from(table: string) {
        expect(table).toBe("organisations");
        return {
          select() {
            return {
              eq() {
                return {
                  data: [
                    {
                      id: "org-shared",
                      organisation_type: "practice",
                      created_by: "user-1",
                      status: "active",
                    },
                  ],
                  error: null,
                };
              },
            };
          },
        };
      },
    };

    await expect(
      listDeletablePersonalOrganisations(admin, "user-1")
    ).rejects.toMatchObject({ code: "QA_CLEANUP_REFUSES_SHARED_ORG" });
  });

  it("retries transient Auth delete failures with bounded backoff", async () => {
    const deleteUser = vi
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: { name: "AuthRetryableFetchError", status: 500, message: "{}" },
      })
      .mockResolvedValueOnce({ data: { user: null }, error: null });

    const admin = { auth: { admin: { deleteUser } } };
    const result = await deleteAuthUserWithRetry(admin, "user-1", {
      attempts: 3,
      baseDelayMs: 1,
      maxDelayMs: 5,
    });

    expect(result.deleted).toBe(true);
    expect(result.attempts).toBe(2);
    expect(deleteUser).toHaveBeenCalledTimes(2);
  });

  it("verifyDisposableUserCleanup fails when orphans remain", async () => {
    const admin = {
      auth: {
        admin: {
          getUserById: async () => ({
            data: { user: { id: "user-1" } },
            error: null,
          }),
        },
      },
      from() {
        return {
          select() {
            return {
              eq() {
                return { count: 0, error: null };
              },
            };
          },
        };
      },
    };

    await expect(
      verifyDisposableUserCleanup(admin, "user-1")
    ).rejects.toMatchObject({ code: "QA_DISPOSABLE_USER_ORPHANS" });
  });

  it("cleanup deletes personal org before auth user", async () => {
    const calls: string[] = [];
    const userId = "user-1";
    const orgId = "org-personal";

    const admin = {
      from(table: string) {
        const api = {
          select(_cols?: string, _opts?: unknown) {
            return {
              eq(column: string, value: string) {
                if (table === "organisations" && column === "created_by") {
                  return {
                    data: [
                      {
                        id: orgId,
                        organisation_type: "personal",
                        created_by: userId,
                        status: "active",
                      },
                    ],
                    error: null,
                  };
                }
                if (
                  table === "organisation_memberships" &&
                  column === "organisation_id"
                ) {
                  return {
                    data: [
                      {
                        id: "mem-1",
                        user_id: userId,
                        role: "owner",
                        status: "active",
                      },
                    ],
                    error: null,
                  };
                }
                return {
                  data: [],
                  error: null,
                  count: 0,
                  then: undefined,
                  eq() {
                    return this;
                  },
                };
              },
              head: true,
            };
          },
          delete() {
            calls.push(`delete:${table}`);
            const chain: Record<string, unknown> = {
              eq() {
                return chain;
              },
              select() {
                return { data: [{ id: "x" }], error: null };
              },
            };
            return chain;
          },
          update() {
            calls.push(`update:${table}`);
            const chain: Record<string, unknown> = {
              eq() {
                return chain;
              },
              select() {
                return { data: [{ id: "x" }], error: null };
              },
            };
            return chain;
          },
        };
        return api;
      },
      auth: {
        admin: {
          deleteUser: async (id: string) => {
            calls.push(`auth.deleteUser:${id}`);
            expect(calls.some(c => c === "delete:organisations")).toBe(true);
            return { data: { user: null }, error: null };
          },
          getUserById: async () => ({ data: { user: null }, error: null }),
        },
      },
    };

    const result = await cleanupDisposableAuthUser(admin, userId, {
      log: () => {},
      retry: { attempts: 2, baseDelayMs: 1, maxDelayMs: 2 },
    });

    expect(result.personalOrganisationIds).toEqual([orgId]);
    expect(calls).toContain("delete:organisations");
    expect(calls[calls.length - 1]).toBe(`auth.deleteUser:${userId}`);
  });
});
