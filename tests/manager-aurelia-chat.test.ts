import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MANAGER_AURELIA_CONVERSATION_ADDENDUM,
  MANAGER_AURELIA_MAX_AURELIA_TURN_CHARS,
  MANAGER_AURELIA_MAX_MESSAGE_CHARS,
  MANAGER_AURELIA_MAX_OUTPUT_TOKENS,
  MANAGER_AURELIA_MAX_TOTAL_CHARS,
  MANAGER_AURELIA_MAX_TURNS,
  boundManagerAureliaReply,
  boundManagerAureliaTurns,
  buildManagerAureliaInput,
  rejectPersonIdentifiers,
  validateManagerAureliaMessage,
} from "@/lib/ai/manager-aurelia-conversation";
import { checkManagerAureliaRateLimit } from "@/lib/my-development/aurelia-rate-limit";

const root = process.cwd();

function read(pathFromRoot: string): string {
  return readFileSync(join(root, pathFromRoot), "utf8");
}

describe("Stage 2.2.2 / 2.2.2A Manager Aurelia chat helpers", () => {
  it("rejects empty and oversized Manager messages", () => {
    expect(validateManagerAureliaMessage("").ok).toBe(false);
    expect(validateManagerAureliaMessage("   ").ok).toBe(false);
    expect(validateManagerAureliaMessage("hello").ok).toBe(true);
    expect(
      validateManagerAureliaMessage("x".repeat(MANAGER_AURELIA_MAX_MESSAGE_CHARS + 1))
        .ok
    ).toBe(false);
  });

  it("bounds conversation turns and total size", () => {
    const many = Array.from({ length: MANAGER_AURELIA_MAX_TURNS + 5 }, (_, i) => ({
      role: i % 2 === 0 ? ("manager" as const) : ("aurelia" as const),
      content: `Turn ${i}`,
    }));
    const result = boundManagerAureliaTurns(many);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.turns.length).toBeLessThanOrEqual(MANAGER_AURELIA_MAX_TURNS);
    expect(result.turns[0]?.content).toContain("Turn 5");
  });

  it("windows total context characters while keeping recent turns", () => {
    const turns = Array.from({ length: 12 }, (_, i) => {
      const role = (i % 2 === 0 ? "manager" : "aurelia") as "manager" | "aurelia";
      const body =
        role === "manager"
          ? "m".repeat(MANAGER_AURELIA_MAX_MESSAGE_CHARS - 4)
          : "a".repeat(MANAGER_AURELIA_MAX_AURELIA_TURN_CHARS - 4);
      return { role, content: `${body}-${String(i).padStart(2, "0")}` };
    });
    const result = boundManagerAureliaTurns(turns);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const total = result.turns.reduce((sum, turn) => sum + turn.content.length, 0);
    expect(total).toBeLessThanOrEqual(MANAGER_AURELIA_MAX_TOTAL_CHARS);
    expect(result.turns.at(-1)?.content).toContain("-11");
  });

  it("rejects oversized Manager prior turns but accepts near-max Aurelia turns", () => {
    const managerTooLong = boundManagerAureliaTurns([
      { role: "manager", content: "m".repeat(MANAGER_AURELIA_MAX_MESSAGE_CHARS + 1) },
    ]);
    expect(managerTooLong.ok).toBe(false);

    const aureliaOk = boundManagerAureliaTurns([
      {
        role: "aurelia",
        content: "a".repeat(MANAGER_AURELIA_MAX_AURELIA_TURN_CHARS),
      },
    ]);
    expect(aureliaOk.ok).toBe(true);

    const aureliaTooLong = boundManagerAureliaTurns([
      {
        role: "aurelia",
        content: "a".repeat(MANAGER_AURELIA_MAX_AURELIA_TURN_CHARS + 1),
      },
    ]);
    expect(aureliaTooLong.ok).toBe(false);
  });

  it("bounds long model replies so they remain legal prior Aurelia turns", () => {
    const long =
      "First sentence about the situation. ".repeat(80) +
      "Final closing thought that should often survive truncation.";
    expect(long.length).toBeGreaterThan(MANAGER_AURELIA_MAX_AURELIA_TURN_CHARS);
    const bounded = boundManagerAureliaReply(long);
    expect(bounded.length).toBeGreaterThan(0);
    expect(bounded.length).toBeLessThanOrEqual(
      MANAGER_AURELIA_MAX_AURELIA_TURN_CHARS
    );
    expect(bounded.endsWith(".") || !bounded.includes(" ")).toBe(true);
    const asPrior = boundManagerAureliaTurns([
      { role: "manager", content: "Earlier point." },
      { role: "aurelia", content: bounded },
    ]);
    expect(asPrior.ok).toBe(true);
  });

  it("keeps reply and prior-turn Aurelia limits aligned", () => {
    expect(MANAGER_AURELIA_MAX_AURELIA_TURN_CHARS).toBeLessThanOrEqual(
      MANAGER_AURELIA_MAX_MESSAGE_CHARS
    );
    expect(MANAGER_AURELIA_MAX_OUTPUT_TOKENS).toBeLessThanOrEqual(400);
    expect(MANAGER_AURELIA_CONVERSATION_ADDENDUM).toContain("60–140 words");
    expect(MANAGER_AURELIA_CONVERSATION_ADDENDUM).toContain(
      "at most ONE useful clarifying question"
    );
    expect(MANAGER_AURELIA_CONVERSATION_ADDENDUM).toContain(
      "honour that immediately"
    );
    expect(MANAGER_AURELIA_CONVERSATION_ADDENDUM).toContain(
      "short adaptable opening"
    );
  });

  it("rejects person identifiers", () => {
    expect(rejectPersonIdentifiers({ message: "hi" }).ok).toBe(true);
    expect(rejectPersonIdentifiers({ clientId: "abc" }).ok).toBe(false);
    expect(rejectPersonIdentifiers({ managedPersonId: "x" }).ok).toBe(false);
    expect(rejectPersonIdentifiers({ employeeId: "x" }).ok).toBe(false);
  });

  it("builds person-free prompt input from turns", () => {
    const input = buildManagerAureliaInput(
      [
        { role: "manager", content: "I have a hard conversation tomorrow." },
        { role: "aurelia", content: "What matters most in that conversation?" },
      ],
      "They keep interrupting me."
    );
    expect(input).toContain("No person records");
    expect(input).toContain("No development focus or action context");
    expect(input).toContain("I have a hard conversation tomorrow.");
    expect(input).toContain("They keep interrupting me.");
    expect(input).not.toContain("clientId");
  });

  it("rate-limits repeated Manager Aurelia requests", () => {
    const userId = `user-${Math.random()}`;
    const organisationId = `org-${Math.random()}`;
    for (let i = 0; i < 30; i += 1) {
      expect(
        checkManagerAureliaRateLimit({ userId, organisationId }).ok
      ).toBe(true);
    }
    expect(checkManagerAureliaRateLimit({ userId, organisationId }).ok).toBe(
      false
    );
  });
});

describe("Stage 2.2.2 Manager Aurelia API contract", () => {
  it("uses authenticated org context, Manager role, AI-enabled and OpenAI", () => {
    const route = read("app/api/my-development/aurelia/chat/route.ts");
    expect(route).toContain("requireOrganisationContext");
    expect(route).toContain('professionalRole !== "manager"');
    expect(route).toContain("aiEnabled");
    expect(route).toContain("rejectPersonIdentifiers");
    expect(route).toContain("rejectClientSuppliedDevelopmentContext");
    expect(route).toContain("loadManagerAureliaDevelopmentContext");
    expect(route).toContain("createPersonLevelResponse");
    expect(route).not.toContain("openai.responses.create");
    expect(route).toContain("buildManagerAureliaInstructions");
    expect(route).toContain("boundManagerAureliaReply");
    expect(route).toContain('errorCode: "MANAGER_AURELIA_AI_FAILED"');
    expect(route).not.toContain("console.log(body");
    expect(route).not.toContain("console.log(input");
    expect(route).not.toContain("console.log(reply");
    expect(route).not.toContain("requireAssignedPersonInOrganisation");
    expect(route).not.toContain("loadMyDevelopmentWorkspace");
    expect(route).not.toContain("ensureSelfDevelopmentRelationship");
    expect(route).not.toContain(".from(");
  });

  it("disables OpenAI Responses storage on Manager Aurelia chat", () => {
    const wrapper = read("lib/ai/person-level-openai.ts");
    expect(wrapper).toContain("store: false");
    expect(wrapper).toContain("createPersonLevelResponse");
  });

  it("keeps dedicated prompt layer separate from prepare prompts", () => {
    const prompt = read("lib/ai/manager-aurelia-conversation.ts");
    const prepare = read("lib/ai/preparation-brief-prompt.ts");
    expect(prompt).toContain("MANAGER_AURELIA_CONVERSATION_ADDENDUM");
    expect(prompt).toContain("IDENTITY_SYSTEM_PROMPT");
    expect(prompt).toContain("Evidence before certainty");
    expect(prompt).toContain("development partner dialogue");
    expect(prepare).not.toContain("MANAGER_AURELIA_CONVERSATION_ADDENDUM");
    expect(prepare).not.toContain("MANAGER_AURELIA_MAX_AURELIA_TURN_CHARS");
  });

  it("wires live multi-turn UI without browser or DB persistence", () => {
    const view = read("components/aurelia/manager-aurelia-view.tsx");
    expect(view).toContain('/api/my-development/aurelia/chat');
    expect(view).toContain("apiJson");
    expect(view).toContain('role: "manager"');
    expect(view).toContain('role: "aurelia"');
    expect(view).toContain("sendingRef");
    expect(view).toContain("New conversation");
    expect(view).not.toContain("localStorage");
    expect(view).not.toContain("sessionStorage");
    expect(view).not.toContain("indexedDB");
  });

  it("does not alter person Prepare with Aurelia wiring", () => {
    const canvas = read(
      "components/relationship-workspace/relationship-canvas.tsx"
    );
    const home = read("components/home-app.tsx");
    expect(canvas).toContain("onPrepareConversation");
    expect(canvas).toContain("buildPersonNextConversationModel");
    expect(home).toContain("PrepareSessionView");
    expect(home).toContain('navigate("manager-aurelia")');
  });
});

describe("Stage 2.2.2 Manager Aurelia route behaviour", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  function mockEmptyDevelopmentContext() {
    vi.doMock("@/lib/my-development/aurelia-context", async () => {
      const actual = await vi.importActual<
        typeof import("@/lib/my-development/aurelia-context")
      >("@/lib/my-development/aurelia-context");
      return {
        ...actual,
        loadManagerAureliaDevelopmentContext: vi.fn(async () => ({
          focusTitles: [],
          actions: [],
        })),
      };
    });
  }

  function managerAuthContext() {
    return {
      ok: true as const,
      context: {
        user: { id: `u-${Math.random()}` },
        supabase: {},
        organisation: {
          organisationId: `o-${Math.random()}`,
          professionalRole: "manager",
          organisation: { aiEnabled: true },
        },
      },
    };
  }

  it("rejects unauthenticated access", async () => {
    vi.doMock("@/lib/organisations/current-organisation", () => ({
      requireOrganisationContext: vi.fn(async () => ({
        ok: false,
        response: new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
        }),
      })),
    }));
    mockEmptyDevelopmentContext();
    vi.doMock("openai", () => ({
      default: class {
        responses = { create: vi.fn() };
      },
    }));

    const { POST } = await import("@/app/api/my-development/aurelia/chat/route");
    const response = await POST(
      new Request("http://localhost/api/my-development/aurelia/chat", {
        method: "POST",
        body: JSON.stringify({ turns: [], message: "Hello" }),
      })
    );
    expect(response.status).toBe(401);
  });

  it("rejects non-Manager professional roles", async () => {
    vi.doMock("@/lib/organisations/current-organisation", () => ({
      requireOrganisationContext: vi.fn(async () => ({
        ok: true,
        context: {
          user: { id: "u1" },
          supabase: {},
          organisation: {
            organisationId: "o1",
            professionalRole: "coach",
            organisation: { aiEnabled: true },
          },
        },
      })),
    }));
    mockEmptyDevelopmentContext();
    const create = vi.fn();
    vi.doMock("openai", () => ({
      default: class {
        responses = { create };
      },
    }));

    const { POST } = await import("@/app/api/my-development/aurelia/chat/route");
    const response = await POST(
      new Request("http://localhost/api/my-development/aurelia/chat", {
        method: "POST",
        body: JSON.stringify({ turns: [], message: "Hello" }),
      })
    );
    expect(response.status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects person identifiers and does not call OpenAI", async () => {
    vi.doMock("@/lib/organisations/current-organisation", () => ({
      requireOrganisationContext: vi.fn(async () => managerAuthContext()),
    }));
    mockEmptyDevelopmentContext();
    const create = vi.fn();
    vi.doMock("openai", () => ({
      default: class {
        responses = { create };
      },
    }));

    const { POST } = await import("@/app/api/my-development/aurelia/chat/route");
    const response = await POST(
      new Request("http://localhost/api/my-development/aurelia/chat", {
        method: "POST",
        body: JSON.stringify({
          turns: [],
          message: "Hello",
          clientId: "11111111-1111-4111-8111-111111111111",
        }),
      })
    );
    expect(response.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects client-supplied development context and identity fields", async () => {
    vi.doMock("@/lib/organisations/current-organisation", () => ({
      requireOrganisationContext: vi.fn(async () => managerAuthContext()),
    }));
    mockEmptyDevelopmentContext();
    const create = vi.fn();
    vi.doMock("openai", () => ({
      default: class {
        responses = { create };
      },
    }));

    const { POST } = await import("@/app/api/my-development/aurelia/chat/route");
    const response = await POST(
      new Request("http://localhost/api/my-development/aurelia/chat", {
        method: "POST",
        body: JSON.stringify({
          turns: [],
          message: "Hello",
          focusTitles: ["Delegation"],
        }),
      })
    );
    expect(response.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("returns Aurelia reply for a Manager and includes prior turns", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const create = vi.fn(async (args: { input: string }) => {
      expect(args.input).toContain("First message");
      expect(args.input).toContain("Second message");
      expect(args.input).toContain("MANAGER DEVELOPMENT CONTEXT");
      expect(args.input).toContain("Delegation");
      expect(args.input).not.toContain("clientId");
      return { output_text: "Here is a calm next step." };
    });
    vi.doMock("@/lib/organisations/current-organisation", () => ({
      requireOrganisationContext: vi.fn(async () => managerAuthContext()),
    }));
    vi.doMock("@/lib/my-development/aurelia-context", async () => {
      const actual = await vi.importActual<
        typeof import("@/lib/my-development/aurelia-context")
      >("@/lib/my-development/aurelia-context");
      return {
        ...actual,
        loadManagerAureliaDevelopmentContext: vi.fn(async () => ({
          focusTitles: ["Delegation"],
          actions: [{ title: "Delegate one task", status: "Open" }],
        })),
      };
    });
    vi.doMock("openai", () => ({
      default: class {
        responses = { create };
      },
    }));

    const { POST } = await import("@/app/api/my-development/aurelia/chat/route");
    const response = await POST(
      new Request("http://localhost/api/my-development/aurelia/chat", {
        method: "POST",
        body: JSON.stringify({
          turns: [
            { role: "manager", content: "First message" },
            { role: "aurelia", content: "What matters most?" },
          ],
          message: "Second message",
        }),
      })
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.reply).toBe("Here is a calm next step.");
    expect(data.developmentContext).toBeUndefined();
    expect(data.focusTitles).toBeUndefined();
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ store: false })
    );
  });

  it("bounds oversized model output so the next turn cannot 400 on Aurelia length", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const oversized =
      "This is a long management briefing sentence. ".repeat(80);
    expect(oversized.length).toBeGreaterThan(
      MANAGER_AURELIA_MAX_AURELIA_TURN_CHARS
    );
    const create = vi.fn(async () => ({ output_text: oversized }));
    vi.doMock("@/lib/organisations/current-organisation", () => ({
      requireOrganisationContext: vi.fn(async () => managerAuthContext()),
    }));
    mockEmptyDevelopmentContext();
    vi.doMock("openai", () => ({
      default: class {
        responses = { create };
      },
    }));

    const { POST } = await import("@/app/api/my-development/aurelia/chat/route");
    const first = await POST(
      new Request("http://localhost/api/my-development/aurelia/chat", {
        method: "POST",
        body: JSON.stringify({
          turns: [],
          message: "Help me think about my team.",
        }),
      })
    );
    expect(first.status).toBe(200);
    const firstData = await first.json();
    expect(firstData.reply.length).toBeLessThanOrEqual(
      MANAGER_AURELIA_MAX_AURELIA_TURN_CHARS
    );

    create.mockResolvedValueOnce({
      output_text: "Here is a short practical next step.",
    });
    const second = await POST(
      new Request("http://localhost/api/my-development/aurelia/chat", {
        method: "POST",
        body: JSON.stringify({
          turns: [
            { role: "manager", content: "Help me think about my team." },
            { role: "aurelia", content: firstData.reply },
          ],
          message: "What should I do first?",
        }),
      })
    );
    expect(second.status).toBe(200);
    const secondData = await second.json();
    expect(secondData.reply).toBe("Here is a short practical next step.");
  });

  it("continues multi-turn after a near-maximum Aurelia reply", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const nearMax = `${"Short sentence. ".repeat(120)}End.`.slice(
      0,
      MANAGER_AURELIA_MAX_AURELIA_TURN_CHARS
    );
    expect(nearMax.length).toBe(MANAGER_AURELIA_MAX_AURELIA_TURN_CHARS);
    const create = vi.fn(async () => ({
      output_text: "Continue with one practical option.",
    }));
    vi.doMock("@/lib/organisations/current-organisation", () => ({
      requireOrganisationContext: vi.fn(async () => managerAuthContext()),
    }));
    mockEmptyDevelopmentContext();
    vi.doMock("openai", () => ({
      default: class {
        responses = { create };
      },
    }));

    const { POST } = await import("@/app/api/my-development/aurelia/chat/route");
    const response = await POST(
      new Request("http://localhost/api/my-development/aurelia/chat", {
        method: "POST",
        body: JSON.stringify({
          turns: [
            { role: "manager", content: "I feel overwhelmed." },
            { role: "aurelia", content: nearMax },
          ],
          message: "What should I do first?",
        }),
      })
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.reply).toBe("Continue with one practical option.");
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("still rejects Manager input above the allowed limit", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const create = vi.fn();
    vi.doMock("@/lib/organisations/current-organisation", () => ({
      requireOrganisationContext: vi.fn(async () => managerAuthContext()),
    }));
    mockEmptyDevelopmentContext();
    vi.doMock("openai", () => ({
      default: class {
        responses = { create };
      },
    }));

    const { POST } = await import("@/app/api/my-development/aurelia/chat/route");
    const response = await POST(
      new Request("http://localhost/api/my-development/aurelia/chat", {
        method: "POST",
        body: JSON.stringify({
          turns: [],
          message: "x".repeat(MANAGER_AURELIA_MAX_MESSAGE_CHARS + 1),
        }),
      })
    );
    expect(response.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("handles AI failure without logging conversation content", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.doMock("@/lib/organisations/current-organisation", () => ({
      requireOrganisationContext: vi.fn(async () => managerAuthContext()),
    }));
    mockEmptyDevelopmentContext();
    vi.doMock("openai", () => ({
      default: class {
        responses = {
          create: vi.fn(async () => {
            throw new Error("upstream failed");
          }),
        };
      },
    }));

    const { POST } = await import("@/app/api/my-development/aurelia/chat/route");
    const secret = "SECRET_CONVERSATION_CONTENT_SHOULD_NOT_LOG";
    const response = await POST(
      new Request("http://localhost/api/my-development/aurelia/chat", {
        method: "POST",
        body: JSON.stringify({ turns: [], message: secret }),
      })
    );
    expect(response.status).toBe(500);
    const logged = JSON.stringify(errorSpy.mock.calls);
    expect(logged).not.toContain(secret);
    expect(logged).toContain("MANAGER_AURELIA_AI_FAILED");
    errorSpy.mockRestore();
  });
});
