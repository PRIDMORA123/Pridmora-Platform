import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  countActivePractitioners,
  countAwaitingSessionNotes,
  isAwaitingSessionNotes,
  isConversationThisMonth,
  METRIC_DEFINITIONS,
} from "@/lib/organisations/metric-definitions";
import {
  formatAssignmentRoleLabel,
  formatMembershipStatusLabel,
  formatOrganisationDate,
  formatProfessionalRoleLabel,
  organisationInitials,
  retentionPolicyDisplayLabel,
} from "@/lib/organisations/format";
import { loadSafeOversightMetrics } from "@/lib/organisations/oversight";

const root = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

describe("organisation metric definitions", () => {
  it("counts assigned owners as active practitioners", () => {
    const count = countActivePractitioners(
      [
        { userId: "barry", role: "owner", status: "active" },
        { userId: "admin", role: "administrator", status: "active" },
      ],
      [
        {
          userId: "barry",
          assignmentRole: "primary",
          status: "active",
        },
      ]
    );
    expect(count).toBe(1);
  });

  it("counts practitioner-role members even without assignments", () => {
    expect(
      countActivePractitioners(
        [{ userId: "p1", role: "practitioner", status: "active" }],
        []
      )
    ).toBe(1);
  });

  it("does not count oversight members with assignments", () => {
    expect(
      countActivePractitioners(
        [{ userId: "o1", role: "oversight", status: "active" }],
        [{ userId: "o1", assignmentRole: "primary", status: "active" }]
      )
    ).toBe(0);
  });

  it("awaiting notes only includes ended sessions without notes", () => {
    expect(
      isAwaitingSessionNotes({
        status: "awaiting_completion",
        notesSavedAt: null,
      })
    ).toBe(true);
    expect(
      isAwaitingSessionNotes({
        status: "in_progress",
        notesSavedAt: null,
      })
    ).toBe(false);
    expect(
      isAwaitingSessionNotes({
        status: "planned",
        notesSavedAt: null,
      })
    ).toBe(false);
    expect(
      isAwaitingSessionNotes({
        status: "completed",
        notesSavedAt: null,
      })
    ).toBe(false);
    expect(
      isAwaitingSessionNotes({
        status: "awaiting_completion",
        notesSavedAt: "2026-08-01T12:00:00.000Z",
      })
    ).toBe(false);
    expect(
      isAwaitingSessionNotes({
        status: "awaiting_completion",
        notesSavedAt: null,
        archivedAt: "2026-08-01T12:00:00.000Z",
      })
    ).toBe(false);

    expect(
      countAwaitingSessionNotes([
        { status: "awaiting_completion", notesSavedAt: null },
        { status: "in_progress", notesSavedAt: null },
        { status: "completed", notesSavedAt: "2026-08-01T12:00:00.000Z" },
      ])
    ).toBe(1);
  });

  it("conversation monthly count excludes planned sessions", () => {
    const monthStart = "2026-08-01T00:00:00.000Z";
    expect(
      isConversationThisMonth(
        {
          status: "in_progress",
          notesSavedAt: null,
          updatedAt: "2026-08-02T10:00:00.000Z",
        },
        monthStart
      )
    ).toBe(true);
    expect(
      isConversationThisMonth(
        {
          status: "planned",
          notesSavedAt: null,
          updatedAt: "2026-08-02T10:00:00.000Z",
        },
        monthStart
      )
    ).toBe(false);
  });

  it("documents metric definitions", () => {
    expect(METRIC_DEFINITIONS.activePractitioners).toMatch(/assignment/i);
    expect(METRIC_DEFINITIONS.awaitingSessionNotes).toMatch(
      /awaiting_completion/
    );
  });
});

describe("organisation formatting", () => {
  it("formats UK-readable dates", () => {
    expect(formatOrganisationDate("2026-08-02T12:00:00.000Z")).toMatch(
      /2 Aug 2026/
    );
  });

  it("title-cases professional roles and statuses", () => {
    expect(formatProfessionalRoleLabel("coach")).toBe("Coach");
    expect(formatMembershipStatusLabel("active")).toBe("Active");
    expect(formatAssignmentRoleLabel("primary")).toBe("Primary");
    expect(formatAssignmentRoleLabel("co_practitioner")).toBe(
      "Co-practitioner"
    );
  });

  it("builds initials and retention labels", () => {
    expect(organisationInitials("Barry Pridmore")).toBe("BP");
    expect(retentionPolicyDisplayLabel("standard")).toEqual({
      label: "Standard retention policy",
      readOnly: true,
    });
  });
});

describe("organisation usage aggregation for Organisation Lead", () => {
  it("overview route aggregates with service role after safe-oversight permission", () => {
    const route = read("app/api/organisations/overview/route.ts");
    expect(route).toContain('organisation.view_safe_oversight');
    expect(route).toContain("requireOrganisationPermission");
    expect(route).toContain("getSupabaseServiceClient");
    expect(route).toContain("isSupabaseServiceRoleConfigured");
    expect(route).toContain("loadSafeOversightMetrics");
    expect(route).toContain("aggregationClient");
    // Must not aggregate Usage via the Lead's RLS-scoped session client.
    expect(route).not.toMatch(
      /loadSafeOversightMetrics\(\s*auth\.context\.supabase/
    );
  });

  it("loadSafeOversightMetrics counts applied updates via client tenancy, not only organisation_id", async () => {
    let clientListCalls = 0;

    const supabase = {
      from(table: string) {
        const state: {
          filters: Record<string, unknown>;
        } = { filters: {} };

        const builder: {
          select: (...args: unknown[]) => typeof builder;
          eq: (column: string, value: unknown) => typeof builder;
          gte: (column: string, value: unknown) => typeof builder;
          in: (column: string, values: string[]) => typeof builder;
          is: (column: string, value: unknown) => typeof builder;
          then: (
            resolve: (value: unknown) => void,
            reject?: (reason: unknown) => void
          ) => void;
        } = {
          select() {
            return builder;
          },
          eq(column: string, value: unknown) {
            state.filters[column] = value;
            return builder;
          },
          gte(column: string, value: unknown) {
            state.filters[`${column}__gte`] = value;
            return builder;
          },
          in(column: string, values: string[]) {
            state.filters[`${column}__in`] = values;
            return builder;
          },
          is(column: string, value: unknown) {
            state.filters[`${column}__is`] = value;
            return builder;
          },
          then(resolve) {
            if (table === "clients") {
              if (state.filters.archived_at__is === null) {
                resolve({ data: null, count: 2, error: null });
                return;
              }
              clientListCalls += 1;
              resolve({
                data: [{ id: "client-a" }, { id: "client-b" }],
                error: null,
              });
              return;
            }

            if (table === "organisation_memberships") {
              resolve({
                data: [
                  {
                    user_id: "manager-1",
                    role: "practitioner",
                    status: "active",
                  },
                ],
                count: 1,
                error: null,
              });
              return;
            }

            if (table === "relationship_assignments") {
              resolve({ data: [], count: 0, error: null });
              return;
            }

            if (table === "development_updates") {
              expect(state.filters.status).toBe("applied");
              expect(state.filters.client_id__in).toEqual([
                "client-a",
                "client-b",
              ]);
              resolve({ data: null, count: 3, error: null });
              return;
            }

            if (table === "development_reports") {
              expect(state.filters.client_id__in).toEqual([
                "client-a",
                "client-b",
              ]);
              resolve({ data: null, count: 0, error: null });
              return;
            }

            if (table === "sessions") {
              if (state.filters.summary_status === "draft") {
                resolve({ data: null, count: 0, error: null });
                return;
              }
              if (state.filters.prep_ai_brief_generated_at__gte) {
                resolve({ data: null, count: 2, error: null });
                return;
              }
              if (state.filters.status === "awaiting_completion") {
                resolve({ data: null, count: 0, error: null });
                return;
              }
              resolve({ data: null, count: 4, error: null });
              return;
            }

            resolve({ data: null, count: 0, error: null });
          },
        };

        return builder;
      },
    };

    const metrics = await loadSafeOversightMetrics(
      supabase as never,
      "org-1",
      "Customer #1 Rehearsal",
      "business"
    );

    expect(clientListCalls).toBe(1);
    expect(metrics.preparationUsageThisMonth).toBe(2);
    expect(metrics.summariesAwaitingReview).toBe(0);
    expect(metrics.conversationsThisMonth).toBe(4);
    expect(metrics.developmentUpdatesCompleted).toBe(3);
    expect(metrics.reportsCount).toBe(0);
    expect(metrics.activeRelationships).toBe(2);
  });

  it("Westbridge-style overview counts 10 Managers × 5 People as 50, excluding self-development", async () => {
    const people = Array.from({ length: 50 }, (_, index) => ({
      id: `person-${index + 1}`,
      role: "Team leader",
      is_self_development: false,
      archived_at: null,
    }));
    const selfDevelopment = Array.from({ length: 10 }, (_, index) => ({
      id: `self-${index + 1}`,
      role: "Self development",
      is_self_development: true,
      archived_at: null,
    }));
    const peopleIds = people.map(row => row.id);

    const supabase = {
      from(table: string) {
        const state: { filters: Record<string, unknown> } = { filters: {} };
        const builder = {
          select() {
            return builder;
          },
          eq(column: string, value: unknown) {
            state.filters[column] = value;
            return builder;
          },
          gte() {
            return builder;
          },
          in(column: string, values: string[]) {
            state.filters[`${column}__in`] = values;
            return builder;
          },
          is() {
            return builder;
          },
          then(resolve: (value: unknown) => void) {
            if (table === "clients") {
              resolve({
                data: [...people, ...selfDevelopment],
                error: null,
              });
              return;
            }
            if (table === "development_updates") {
              expect(state.filters.client_id__in).toEqual(peopleIds);
              resolve({ data: null, count: 0, error: null });
              return;
            }
            if (table === "development_reports") {
              expect(state.filters.client_id__in).toEqual(peopleIds);
              resolve({ data: null, count: 0, error: null });
              return;
            }
            if (table === "organisation_memberships") {
              resolve({ data: [], count: 10, error: null });
              return;
            }
            if (table === "relationship_assignments") {
              resolve({ data: [], count: 0, error: null });
              return;
            }
            resolve({ data: null, count: 0, error: null });
          },
        };
        return builder;
      },
    };

    const metrics = await loadSafeOversightMetrics(
      supabase as never,
      "org-westbridge",
      "Westbridge Services Group",
      "business"
    );

    expect(metrics.activeRelationships).toBe(50);
    expect(metrics.activeRelationships).not.toBe(60);
  });

  it("does not silently treat query failures as zero", async () => {
    const supabase = {
      from(table: string) {
        const builder = {
          select() {
            return builder;
          },
          eq() {
            return builder;
          },
          gte() {
            return builder;
          },
          in() {
            return builder;
          },
          is() {
            return builder;
          },
          then(resolve: (value: unknown) => void) {
            if (table === "clients") {
              resolve({ data: [{ id: "client-a" }], error: null });
              return;
            }
            resolve({
              data: null,
              count: null,
              error: { message: "rls denied" },
            });
          },
        };
        return builder;
      },
    };

    await expect(
      loadSafeOversightMetrics(
        supabase as never,
        "org-1",
        "Customer #1 Rehearsal"
      )
    ).rejects.toThrow(/Unable to load/);
  });
});
