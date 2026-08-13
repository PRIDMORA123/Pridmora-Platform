import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MANAGER_AURELIA_CONTEXT_HARD_MAX_CHARS,
  MANAGER_AURELIA_CONTEXT_TITLE_CHARS,
  MANAGER_AURELIA_MAX_ACTIVE_ACTIONS,
  MANAGER_AURELIA_MAX_FOCUS_TITLES,
  formatManagerAureliaDevelopmentContext,
  loadManagerAureliaDevelopmentContext,
} from "@/lib/my-development/aurelia-context";
import {
  MANAGER_AURELIA_CONVERSATION_ADDENDUM,
  buildManagerAureliaInput,
  rejectClientSuppliedDevelopmentContext,
} from "@/lib/ai/manager-aurelia-conversation";

const root = process.cwd();

function read(pathFromRoot: string): string {
  return readFileSync(join(root, pathFromRoot), "utf8");
}

const findSelfDevelopmentClient = vi.fn();

vi.mock("@/lib/my-development/self-relationship", () => ({
  findSelfDevelopmentClient: (...args: unknown[]) =>
    findSelfDevelopmentClient(...args),
  ensureSelfDevelopmentRelationship: vi.fn(() => {
    throw new Error("ensureSelfDevelopmentRelationship must not be called");
  }),
}));

describe("Stage 2.2.3 Manager Aurelia development context", () => {
  beforeEach(() => {
    findSelfDevelopmentClient.mockReset();
  });

  it("formats compact context without IDs, notes, owner, or portfolio dump", () => {
    const block = formatManagerAureliaDevelopmentContext({
      focusTitles: ["Delegation", "Clearer feedback"],
      actions: [
        { title: "Delegate one operational task", status: "Open" },
        {
          title: "Hold clearer weekly priorities",
          status: "In progress",
          due: "2026-08-20",
        },
      ],
    });
    expect(block).toContain("MANAGER DEVELOPMENT CONTEXT");
    expect(block).toContain("Delegation");
    expect(block).toContain("Delegate one operational task — Open");
    expect(block).toContain("due 2026-08-20");
    expect(block).not.toContain("clientId");
    expect(block).not.toContain("notes");
    expect(block).not.toContain("owner");
    expect(block.length).toBeLessThanOrEqual(
      MANAGER_AURELIA_CONTEXT_HARD_MAX_CHARS
    );
  });

  it("caps focus titles and truncates to 80 characters", () => {
    const long = "D".repeat(MANAGER_AURELIA_CONTEXT_TITLE_CHARS + 40);
    const block = formatManagerAureliaDevelopmentContext({
      focusTitles: ["One", "Two", "Three", "Four", long],
      actions: [],
    });
    expect(block.match(/^- /gm)?.length).toBe(MANAGER_AURELIA_MAX_FOCUS_TITLES);
    expect(block).not.toContain("Four");
    expect(block).not.toContain(long);
  });

  it("hard-bounds oversized context blocks", () => {
    const titles = Array.from({ length: 3 }, (_, i) =>
      `${"Focus word ".repeat(20)}${i}`
    );
    const actions = Array.from({ length: 3 }, (_, i) => ({
      title: `${"Action word ".repeat(20)}${i}`,
      status: "Open" as const,
      due: "2026-09-01",
    }));
    const block = formatManagerAureliaDevelopmentContext({
      focusTitles: titles,
      actions,
    });
    expect(block.length).toBeLessThanOrEqual(
      MANAGER_AURELIA_CONTEXT_HARD_MAX_CHARS
    );
  });

  it("returns empty context without creating a self-development record", async () => {
    findSelfDevelopmentClient.mockResolvedValueOnce(null);
    const from = vi.fn();
    const supabase = { from } as never;
    const context = await loadManagerAureliaDevelopmentContext({
      supabase,
      organisationId: "org-1",
      userId: "user-1",
    });
    expect(context).toEqual({ focusTitles: [], actions: [] });
    expect(from).not.toHaveBeenCalled();
    expect(findSelfDevelopmentClient).toHaveBeenCalledWith(
      supabase,
      "org-1",
      "user-1"
    );
  });

  it("loads only focus themes and incomplete actions with approved fields", async () => {
    findSelfDevelopmentClient.mockResolvedValueOnce({
      id: "self-1",
      currentFocus: "Personal development record",
    });

    const themeOrder: { ascending: boolean }[] = [];
    const actionOrder: { ascending: boolean }[] = [];

    const supabase = {
      from: (table: string) => {
        expect(table).toBe("client_items");
        return {
          select: (cols: string) => {
            const isTheme = cols === "title";
            if (isTheme) {
              expect(cols).toBe("title");
            } else {
              expect(cols).toBe("title, status, event_date");
              expect(cols).not.toContain("detail");
              expect(cols).not.toContain("owner");
              expect(cols).not.toContain("id");
            }
            return {
              eq: () => ({
                eq: () => ({
                  eq: (_key: string, value: string) => ({
                    order: (
                      _col: string,
                      opts: { ascending: boolean }
                    ) => {
                      if (value === "theme") {
                        themeOrder.push(opts);
                        return Promise.resolve({
                          data: [
                            { title: "Delegation" },
                            { title: "Feedback" },
                            { title: "Presence" },
                            { title: "Extra focus" },
                            { title: "x".repeat(100) },
                          ],
                          error: null,
                        });
                      }
                      actionOrder.push(opts);
                      return Promise.resolve({
                        data: [
                          {
                            title: "Speak to Sarah about delegation",
                            status: "Open",
                            event_date: "2026-08-21",
                            detail: "SECRET_NOTES",
                            owner: "Sarah",
                            id: "action-secret",
                          },
                          {
                            title: "Done already",
                            status: "Complete",
                            event_date: null,
                          },
                          {
                            title: "Hold weekly priorities",
                            status: "In progress",
                            event_date: null,
                          },
                          {
                            title: "Third open",
                            status: "Open",
                            event_date: null,
                          },
                          {
                            title: "Fourth open",
                            status: "Open",
                            event_date: null,
                          },
                        ],
                        error: null,
                      });
                    },
                  }),
                }),
              }),
            };
          },
        };
      },
    };

    const context = await loadManagerAureliaDevelopmentContext({
      supabase: supabase as never,
      organisationId: "org-1",
      userId: "user-1",
    });

    expect(themeOrder[0]?.ascending).toBe(true);
    expect(actionOrder[0]?.ascending).toBe(false);
    expect(context.focusTitles).toEqual([
      "Delegation",
      "Feedback",
      "Presence",
    ]);
    expect(context.focusTitles).toHaveLength(MANAGER_AURELIA_MAX_FOCUS_TITLES);
    expect(context.actions).toHaveLength(MANAGER_AURELIA_MAX_ACTIVE_ACTIONS);
    expect(context.actions.map(a => a.title)).toEqual([
      "Speak to Sarah about delegation",
      "Hold weekly priorities",
      "Third open",
    ]);
    expect(
      context.actions.every(
        a => a.status === "Open" || a.status === "In progress"
      )
    ).toBe(true);
    expect(context.actions.map(a => a.title)).not.toContain("Done already");
    expect(JSON.stringify(context)).not.toContain("SECRET_NOTES");
    expect(JSON.stringify(context)).not.toContain("action-secret");
    expect(JSON.stringify(context)).not.toContain('"owner"');
    expect(JSON.stringify(context)).not.toContain("self-1");
  });

  it("seeds a non-placeholder current_focus when no theme rows exist", async () => {
    findSelfDevelopmentClient.mockResolvedValueOnce({
      id: "self-1",
      currentFocus: "Build confidence in delegation",
    });
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: (_k: string, value: string) => ({
                order: () =>
                  Promise.resolve({
                    data: value === "theme" ? [] : [],
                    error: null,
                  }),
              }),
            }),
          }),
        }),
      }),
    };
    const context = await loadManagerAureliaDevelopmentContext({
      supabase: supabase as never,
      organisationId: "org-1",
      userId: "user-1",
    });
    expect(context.focusTitles).toEqual(["Build confidence in delegation"]);
  });

  it("rejects client-supplied portfolio and identity fields", () => {
    expect(rejectClientSuppliedDevelopmentContext({ message: "hi" }).ok).toBe(
      true
    );
    expect(
      rejectClientSuppliedDevelopmentContext({
        developmentContext: { focusTitles: ["x"] },
      }).ok
    ).toBe(false);
    expect(
      rejectClientSuppliedDevelopmentContext({ organisationId: "o1" }).ok
    ).toBe(false);
    expect(
      rejectClientSuppliedDevelopmentContext({ selfClientId: "c1" }).ok
    ).toBe(false);
    expect(rejectClientSuppliedDevelopmentContext({ actions: [] }).ok).toBe(
      false
    );
  });

  it("includes context in model input only when present and keeps person-free framing", () => {
    const withContext = buildManagerAureliaInput(
      [],
      "I keep checking everything.",
      {
        focusTitles: ["Delegation"],
        actions: [{ title: "Delegate one task", status: "Open" }],
      }
    );
    expect(withContext).toContain("MANAGER DEVELOPMENT CONTEXT");
    expect(withContext).toContain("Delegation");
    expect(withContext).toContain("No person records are available");
    expect(withContext).not.toContain("clientId");

    const empty = buildManagerAureliaInput([], "Hello", {
      focusTitles: [],
      actions: [],
    });
    expect(empty).toContain("No development focus or action context");
    expect(empty).not.toContain("MANAGER DEVELOPMENT CONTEXT");
  });

  it("encodes available-not-mandatory context behaviour in the addendum", () => {
    expect(MANAGER_AURELIA_CONVERSATION_ADDENDUM).toContain(
      "AVAILABLE, NOT MANDATORY"
    );
    expect(MANAGER_AURELIA_CONVERSATION_ADDENDUM).toContain(
      "Do not inventory the portfolio"
    );
    expect(MANAGER_AURELIA_CONVERSATION_ADDENDUM).toContain(
      "Current conversation takes precedence"
    );
    expect(MANAGER_AURELIA_CONVERSATION_ADDENDUM).toContain(
      "Never invent a focus or action"
    );
    expect(MANAGER_AURELIA_CONVERSATION_ADDENDUM).toContain(
      "do not grant person-record access"
    );
    expect(MANAGER_AURELIA_CONVERSATION_ADDENDUM).toContain("60–140 words");
  });

  it("keeps helper read-only and out of workspace/create/evidence paths", () => {
    const helper = read("lib/my-development/aurelia-context.ts");
    const route = read("app/api/my-development/aurelia/chat/route.ts");
    expect(helper).toContain("findSelfDevelopmentClient");
    expect(helper).not.toContain("ensureSelfDevelopmentRelationship");
    expect(helper).not.toContain("loadMyDevelopmentWorkspace");
    expect(helper).not.toContain("listEvidenceForClient");
    expect(helper).not.toContain("development_profiles");
    expect(helper).not.toContain("listMyDevelopmentReflection");
    expect(helper).not.toContain("buildReflectionPatternInsights");
    expect(route).toContain("loadManagerAureliaDevelopmentContext");
    expect(route).toContain("rejectClientSuppliedDevelopmentContext");
    expect(route).not.toContain("ensureSelfDevelopmentRelationship");
    expect(route).not.toContain("loadMyDevelopmentWorkspace");
    expect(route).not.toContain("/api/my-development/workspace");
    expect(route).toContain("return NextResponse.json({ reply })");
    expect(route).not.toContain("console.log(");
    // Response must not include portfolio payload keys.
    expect(route).not.toMatch(/NextResponse\.json\(\{[^}]*developmentContext/);
  });

  it("discloses context use without exposing portfolio contents", () => {
    const view = read("components/aurelia/manager-aurelia-view.tsx");
    expect(view).toContain(
      "can use your current development focus and actions"
    );
    expect(view).not.toContain("MANAGER DEVELOPMENT CONTEXT");
    expect(view).not.toContain("focusTitles");
  });

  it("does not alter person Prepare with Aurelia wiring", () => {
    const prepare = read("lib/ai/preparation-brief-prompt.ts");
    const canvas = read(
      "components/relationship-workspace/relationship-canvas.tsx"
    );
    expect(prepare).not.toContain("MANAGER_AURELIA_CONVERSATION_ADDENDUM");
    expect(prepare).not.toContain("loadManagerAureliaDevelopmentContext");
    expect(canvas).toContain("Prepare with {BRAND.intelligenceName}");
  });
});
