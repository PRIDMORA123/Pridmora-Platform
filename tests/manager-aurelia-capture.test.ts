import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildManagerAureliaProposeCaptureInstructions,
  isManagerAureliaCaptureType,
  parseManagerAureliaProposeCaptureDraft,
  reflectionDraftHasNote,
  validateManagerAureliaCaptureTurns,
} from "@/lib/ai/manager-aurelia-propose-capture";

const root = process.cwd();

function read(pathFromRoot: string): string {
  return readFileSync(join(root, pathFromRoot), "utf8");
}

describe("Stage 2.2.4 Manager Aurelia deliberate capture helpers", () => {
  it("accepts only reflection and action capture types", () => {
    expect(isManagerAureliaCaptureType("reflection")).toBe(true);
    expect(isManagerAureliaCaptureType("action")).toBe(true);
    expect(isManagerAureliaCaptureType("focus")).toBe(false);
  });

  it("requires conversation turns before proposing capture", () => {
    expect(validateManagerAureliaCaptureTurns([]).ok).toBe(false);
    expect(
      validateManagerAureliaCaptureTurns([
        { role: "manager", content: "I keep checking everything." },
        { role: "aurelia", content: "What would help most?" },
      ]).ok
    ).toBe(true);
  });

  it("parses concise reflection and action drafts", () => {
    const reflection = parseManagerAureliaProposeCaptureDraft(
      JSON.stringify({
        title: "Letting go of checking",
        whatNoticed: "I check work because I am uncertain.",
        practiseNext: "Delegate one low-risk task with a clear checkpoint.",
      }),
      "reflection"
    );
    expect(reflection.ok).toBe(true);
    if (!reflection.ok) return;
    expect(reflection.draft).toMatchObject({
      title: "Letting go of checking",
      whatNoticed: "I check work because I am uncertain.",
    });

    const action = parseManagerAureliaProposeCaptureDraft(
      JSON.stringify({
        title: "Delegate one operational task",
        due: "2026-08-20",
      }),
      "action"
    );
    expect(action.ok).toBe(true);
    if (!action.ok) return;
    expect(action.draft).toEqual({
      title: "Delegate one operational task",
      due: "2026-08-20",
    });
  });

  it("requires a reflection note before confirm helpers pass", () => {
    expect(
      reflectionDraftHasNote({ whatNoticed: "", practiseNext: "" })
    ).toBe(false);
    expect(
      reflectionDraftHasNote({
        whatNoticed: "I noticed I avoid the conversation.",
        practiseNext: "",
      })
    ).toBe(true);
  });

  it("keeps propose-capture prompt free of focus capture and person-record claims", () => {
    const reflection = buildManagerAureliaProposeCaptureInstructions("reflection");
    const action = buildManagerAureliaProposeCaptureInstructions("action");
    expect(reflection).toContain("Return JSON only");
    expect(reflection).toContain("without naming colleagues");
    expect(reflection).not.toContain("development focus");
    expect(action).toContain("Do not include owner");
    expect(action).not.toContain("Update development focus");
  });
});

describe("Stage 2.2.4 capture API and UI contracts", () => {
  it("wires propose-capture without DB writes or portfolio injection", () => {
    const route = read(
      "app/api/my-development/aurelia/propose-capture/route.ts"
    );
    expect(route).toContain("requireOrganisationContext");
    expect(route).toContain('professionalRole !== "manager"');
    expect(route).toContain("aiEnabled");
    expect(route).toContain("rejectPersonIdentifiers");
    expect(route).toContain("rejectClientSuppliedDevelopmentContext");
    expect(route).toContain("createPersonLevelResponse");
    expect(route).not.toContain("openai.responses.create");
    expect(route).not.toContain("ensureSelfDevelopmentRelationship");
    expect(route).not.toContain("createMyDevelopmentReflection");
    expect(route).not.toContain("upsertActionInDb");
    expect(route).not.toContain(".from(");
    expect(route).not.toContain("console.log");
  });

  it("disables OpenAI Responses storage on Manager Aurelia propose-capture", () => {
    const wrapper = read("lib/ai/person-level-openai.ts");
    expect(wrapper).toContain("store: false");
    expect(wrapper).toContain("createPersonLevelResponse");
  });

  it("resolves self client server-side for action capture", () => {
    const route = read(
      "app/api/my-development/aurelia/capture-action/route.ts"
    );
    expect(route).toContain("ensureSelfDevelopmentRelationship");
    expect(route).toContain("upsertActionInDb");
    expect(route).toContain("clientId must be resolved server-side");
    expect(route).toContain('status: "Open"');
    expect(route).not.toContain("include_in_intelligence");
    expect(route).not.toContain("focus");
  });

  it("enables Take something forward with reflection/action only", () => {
    const view = read("components/aurelia/manager-aurelia-view.tsx");
    const capture = read("components/aurelia/manager-aurelia-capture.tsx");
    expect(view).toContain("ManagerAureliaCapturePanel");
    expect(view).toContain('data-testid="manager-aurelia-take-forward"');
    expect(view).not.toMatch(
      /data-testid="manager-aurelia-take-forward"[\s\S]*?disabled\n/
    );
    expect(capture).toContain("Capture a reflection");
    expect(capture).toContain("Create an action");
    expect(capture).toContain("Nothing to save");
    expect(capture).not.toContain("Update development focus");
    expect(capture).not.toContain("development focus");
    expect(capture).toContain(
      "Saving this reflection adds it to your My Development record"
    );
    expect(capture).toContain("without naming colleagues");
    expect(capture).toContain("/api/my-development/reflection");
    expect(capture).toContain("/api/my-development/aurelia/capture-action");
    expect(capture).toContain("/api/my-development/aurelia/propose-capture");
    expect(view).not.toContain("localStorage");
    expect(view).not.toContain("sessionStorage");
  });

  it("keeps person Prepare with Aurelia unchanged", () => {
    const prepare = read("lib/ai/preparation-brief-prompt.ts");
    const canvas = read(
      "components/relationship-workspace/relationship-canvas.tsx"
    );
    expect(prepare).not.toContain("propose-capture");
    expect(prepare).not.toContain("MANAGER_AURELIA_PROPOSE");
    expect(canvas).toContain("onPrepareConversation");
    expect(canvas).toContain("buildPersonNextConversationModel");
  });

  it("keeps reflection excluded from Aurelia context helper", () => {
    const context = read("lib/my-development/aurelia-context.ts");
    expect(context).not.toContain("personal_reflection");
    expect(context).not.toContain("listEvidenceForClient");
    expect(context).toContain('.eq("item_type", "action")');
    expect(context).toContain('.eq("item_type", "theme")');
  });
});

describe("Stage 2.2.4 propose-capture route behaviour", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("rejects unauthenticated access and does not call OpenAI", async () => {
    vi.doMock("@/lib/organisations/current-organisation", () => ({
      requireOrganisationContext: vi.fn(async () => ({
        ok: false,
        response: new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
        }),
      })),
    }));
    const create = vi.fn();
    vi.doMock("openai", () => ({
      default: class {
        responses = { create };
      },
    }));

    const { POST } = await import(
      "@/app/api/my-development/aurelia/propose-capture/route"
    );
    const response = await POST(
      new Request("http://localhost/api/my-development/aurelia/propose-capture", {
        method: "POST",
        body: JSON.stringify({
          captureType: "reflection",
          turns: [{ role: "manager", content: "Hello" }],
        }),
      })
    );
    expect(response.status).toBe(401);
    expect(create).not.toHaveBeenCalled();
  });

  it("returns an editable draft without writing to the database", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const create = vi.fn(async () => ({
      output_text: JSON.stringify({
        title: "Checking less",
        whatNoticed: "I intervene too early.",
        practiseNext: "Set one checkpoint instead of continuous review.",
      }),
    }));
    vi.doMock("@/lib/organisations/current-organisation", () => ({
      requireOrganisationContext: vi.fn(async () => ({
        ok: true,
        context: {
          user: { id: "u1" },
          organisation: {
            organisationId: "o1",
            professionalRole: "manager",
            organisation: { aiEnabled: true },
          },
        },
      })),
    }));
    vi.doMock("openai", () => ({
      default: class {
        responses = { create };
      },
    }));

    const { POST } = await import(
      "@/app/api/my-development/aurelia/propose-capture/route"
    );
    const response = await POST(
      new Request("http://localhost/api/my-development/aurelia/propose-capture", {
        method: "POST",
        body: JSON.stringify({
          captureType: "reflection",
          turns: [
            { role: "manager", content: "I keep checking everything." },
            { role: "aurelia", content: "What would one experiment look like?" },
          ],
        }),
      })
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.captureType).toBe("reflection");
    expect(data.draft.title).toBe("Checking less");
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ store: false })
    );
  });

  it("rejects client-supplied portfolio and person identifiers", async () => {
    const create = vi.fn();
    vi.doMock("@/lib/organisations/current-organisation", () => ({
      requireOrganisationContext: vi.fn(async () => ({
        ok: true,
        context: {
          user: { id: "u1" },
          organisation: {
            organisationId: "o1",
            professionalRole: "manager",
            organisation: { aiEnabled: true },
          },
        },
      })),
    }));
    vi.doMock("openai", () => ({
      default: class {
        responses = { create };
      },
    }));

    const { POST } = await import(
      "@/app/api/my-development/aurelia/propose-capture/route"
    );
    const response = await POST(
      new Request("http://localhost/api/my-development/aurelia/propose-capture", {
        method: "POST",
        body: JSON.stringify({
          captureType: "action",
          turns: [{ role: "manager", content: "I need a next step." }],
          clientId: "should-reject",
        }),
      })
    );
    expect(response.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });
});

describe("Stage 2.2.4 capture-action route behaviour", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("ensures self-development and saves an Open action without browser clientId", async () => {
    const ensure = vi.fn(async () => ({ id: "self-1" }));
    const upsert = vi.fn(async () => ({
      id: "action-1",
      title: "Delegate one task",
      status: "Open",
      clientId: "self-1",
    }));
    vi.doMock("@/lib/organisations/current-organisation", () => ({
      requireOrganisationContext: vi.fn(async () => ({
        ok: true,
        context: {
          user: { id: "u1", email: "m@example.com" },
          supabase: {},
          organisation: {
            organisationId: "o1",
            professionalRole: "manager",
            organisation: { aiEnabled: true },
          },
        },
      })),
    }));
    vi.doMock("@/lib/auth/session", () => ({
      ensureCoachProfile: vi.fn(async () => undefined),
      notFoundOrForbidden: () =>
        new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
    }));
    vi.doMock("@/lib/my-development/workspace", () => ({
      resolveMyDevelopmentActor: vi.fn(async () => ({ fullName: "Manager" })),
    }));
    vi.doMock("@/lib/my-development/self-relationship", () => ({
      ensureSelfDevelopmentRelationship: ensure,
    }));
    vi.doMock("@/lib/supabase/repository", () => ({
      upsertActionInDb: upsert,
      OwnershipError: class OwnershipError extends Error {},
      ClientArchivedError: class ClientArchivedError extends Error {},
    }));

    const { POST } = await import(
      "@/app/api/my-development/aurelia/capture-action/route"
    );
    const response = await POST(
      new Request("http://localhost/api/my-development/aurelia/capture-action", {
        method: "POST",
        body: JSON.stringify({ title: "Delegate one task" }),
      })
    );
    expect(response.status).toBe(201);
    expect(ensure).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith(
      {},
      "u1",
      expect.objectContaining({
        clientId: "self-1",
        title: "Delegate one task",
        status: "Open",
      })
    );
  });

  it("rejects browser-supplied clientId", async () => {
    const ensure = vi.fn();
    vi.doMock("@/lib/organisations/current-organisation", () => ({
      requireOrganisationContext: vi.fn(async () => ({
        ok: true,
        context: {
          user: { id: "u1" },
          organisation: {
            organisationId: "o1",
            professionalRole: "manager",
            organisation: { aiEnabled: true },
          },
        },
      })),
    }));
    vi.doMock("@/lib/my-development/self-relationship", () => ({
      ensureSelfDevelopmentRelationship: ensure,
    }));

    const { POST } = await import(
      "@/app/api/my-development/aurelia/capture-action/route"
    );
    const response = await POST(
      new Request("http://localhost/api/my-development/aurelia/capture-action", {
        method: "POST",
        body: JSON.stringify({
          title: "Delegate one task",
          clientId: "invented",
        }),
      })
    );
    expect(response.status).toBe(400);
    expect(ensure).not.toHaveBeenCalled();
  });
});
