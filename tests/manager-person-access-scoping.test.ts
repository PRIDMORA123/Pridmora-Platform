import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";

const root = process.cwd();

function read(pathFromRoot: string): string {
  return readFileSync(join(root, pathFromRoot), "utf8");
}

const ASSIGNED_CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const FOREIGN_CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const ORG_ID = "33333333-3333-4333-8333-333333333333";

const requireOrganisationContext = vi.fn();
const requireAssignedClientAccess = vi.fn();

vi.mock("@/lib/organisations/current-organisation", () => ({
  requireOrganisationContext: (...args: unknown[]) =>
    requireOrganisationContext(...args),
  requireAssignedClientAccess: (...args: unknown[]) =>
    requireAssignedClientAccess(...args),
}));

describe("Manager person / AI access scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("team-intelligence uses current organisation and assignment scoping", () => {
    const route = read("app/api/team-intelligence/route.ts");
    expect(route).toContain("requireOrganisationContext");
    expect(route).toContain("listAssignedClientIds");
    expect(route).toContain('eq("organisation_id", organisationId)');
    expect(route).toContain("never return rows from another organisation");
    expect(route).not.toContain("Prefer the first active org membership");
    expect(route).not.toContain("organisationIds[0]");
  });

  it("draft-summary / coaching-questions / patterns use assigned-person gate before AI", () => {
    const routes = [
      "app/api/draft-summary/route.ts",
      "app/api/coaching-questions/route.ts",
      "app/api/patterns/generate/route.ts",
      "app/api/patterns/review/route.ts",
    ] as const;

    for (const path of routes) {
      const source = read(path);
      expect(source, path).toContain("requireAssignedPersonInOrganisation");
      expect(source, path).not.toContain("requireAuthenticatedUser");
    }

    const draft = read("app/api/draft-summary/route.ts");
    const questions = read("app/api/coaching-questions/route.ts");
    const patterns = read("app/api/patterns/generate/route.ts");

    expect(draft.indexOf("requireAssignedPersonInOrganisation")).toBeLessThan(
      draft.indexOf("new OpenAI")
    );
    expect(draft.indexOf("requireAssignedPersonInOrganisation")).toBeLessThan(
      draft.indexOf("await createPersonLevelResponse")
    );
    expect(
      questions.indexOf("requireAssignedPersonInOrganisation")
    ).toBeLessThan(questions.indexOf("new OpenAI"));
    expect(
      questions.indexOf("requireAssignedPersonInOrganisation")
    ).toBeLessThan(questions.indexOf("await createPersonLevelResponse"));
    expect(
      patterns.indexOf("requireAssignedPersonInOrganisation")
    ).toBeLessThan(patterns.indexOf("new OpenAI"));
    expect(patterns).toContain("aiEnabled");
  });

  it("callers send clientId so browser person id is validated server-side", () => {
    expect(read("components/session-view.tsx")).toContain(
      "clientId: client.id"
    );
    expect(read("components/session-workspace.tsx")).toContain(
      "clientId: client.id"
    );
    expect(read("lib/coach-workspace.ts")).toContain(
      "clientId: context.clientId"
    );
    expect(read("components/coach/coach-workspace-page.tsx")).toContain(
      "clientId={initialData.relationshipId}"
    );
  });

  it("Prepare / Development Update strong guards remain in place", () => {
    const prep = read("app/api/preparation/generate/route.ts");
    expect(prep).toContain("requireOrganisationContext");
    expect(prep).toContain("requireAssignedClientAccess");
    expect(prep).toContain("aiEnabled");

    const updatesList = read("app/api/development-updates/route.ts");
    expect(updatesList).toContain("requireOrganisationContext");
    expect(updatesList).toContain("filterClientIdsToOrganisation");

    const updatesGenerate = read(
      "app/api/development-updates/generate/route.ts"
    );
    expect(updatesGenerate).toContain("requireAssignedPersonInOrganisation");
    expect(updatesGenerate).toContain("assertRelationshipOwnership");
  });

  it("hardens remaining Manager person routes with assigned-person gate", () => {
    const routes = [
      "app/api/development-updates/generate/route.ts",
      "app/api/development-updates/[updateId]/apply/route.ts",
      "app/api/development-updates/[updateId]/discard/route.ts",
      "app/api/development-updates/[updateId]/route.ts",
      "app/api/development-updates/session/[sessionId]/route.ts",
      "app/api/coaching-intelligence/prepare/route.ts",
      "app/api/coaching-moments/route.ts",
      "app/api/identity-journey/route.ts",
      "app/api/coaching-report/route.ts",
      "app/api/coaching-report/pdf/route.ts",
      "app/api/development-evidence/[clientId]/route.ts",
      "app/api/development-evidence/[clientId]/upload/route.ts",
      "app/api/development-evidence/[clientId]/intelligence/route.ts",
      "app/api/development-evidence/item/[evidenceId]/route.ts",
      "app/api/development-evidence/item/[evidenceId]/analyse/route.ts",
      "app/api/development-evidence/item/[evidenceId]/review/route.ts",
      "app/api/development-reports/route.ts",
      "app/api/development-reports/[reportId]/route.ts",
      "app/api/development-reports/[reportId]/generate/route.ts",
      "app/api/development-reports/[reportId]/approve/route.ts",
      "app/api/intelligence/[clientId]/route.ts",
      "app/api/intelligence/questions/route.ts",
      "app/api/intelligence/items/[itemId]/route.ts",
      "app/api/intelligence/items/[itemId]/evidence/route.ts",
      "app/api/intelligence/session/[sessionId]/route.ts",
      "app/api/intelligence/session/[sessionId]/complete/route.ts",
      "app/api/development-profiles/[clientId]/route.ts",
      "app/api/actions/route.ts",
      "app/api/clients/[clientId]/archive/route.ts",
      "app/api/clients/[clientId]/restore/route.ts",
    ] as const;

    for (const path of routes) {
      const source = read(path);
      expect(source, path).toContain("requireAssignedPersonInOrganisation");
    }

    const globalIntel = read("app/api/intelligence/route.ts");
    expect(globalIntel).toContain("requireOrganisationContext");
    expect(globalIntel).toContain("listAssignedClientIds");

    const aiRoutes = [
      "app/api/development-updates/generate/route.ts",
      "app/api/coaching-intelligence/prepare/route.ts",
      "app/api/identity-journey/route.ts",
      "app/api/coaching-report/route.ts",
      "app/api/coaching-moments/route.ts",
      "app/api/development-evidence/item/[evidenceId]/analyse/route.ts",
      "app/api/development-reports/[reportId]/generate/route.ts",
    ] as const;
    for (const path of aiRoutes) {
      const source = read(path);
      const gateAt = source.indexOf("requireAssignedPersonInOrganisation");
      const openaiAt = source.indexOf("new OpenAI");
      expect(gateAt, path).toBeGreaterThan(-1);
      if (openaiAt >= 0) {
        expect(gateAt, path).toBeLessThan(openaiAt);
      }
    }
  });

  it("denies foreign update/evidence/report/intelligence IDs via parent person gate", () => {
    expect(read("app/api/development-updates/[updateId]/apply/route.ts")).toContain(
      "clientId: existing.clientId"
    );
    expect(
      read("app/api/development-evidence/item/[evidenceId]/analyse/route.ts")
    ).toContain("clientId: detail.evidence.clientId");
    expect(
      read("app/api/development-reports/[reportId]/generate/route.ts")
    ).toContain("clientId: existing.relationshipId");
    expect(read("app/api/intelligence/items/[itemId]/route.ts")).toContain(
      "clientId: item.clientId"
    );
    expect(
      read("app/api/intelligence/session/[sessionId]/complete/route.ts")
    ).toContain("clientId: reviewRow.client_id");
  });

  it("gates development profile, actions, and archive/restore before mutation", () => {
    const profile = read("app/api/development-profiles/[clientId]/route.ts");
    expect(profile).toContain("requireAssignedPersonInOrganisation");
    expect(profile).not.toContain("requireAuthenticatedUser");
    expect(profile.indexOf("requireAssignedPersonInOrganisation")).toBeLessThan(
      profile.indexOf("ensureProfileOrEmpty(")
    );

    const actions = read("app/api/actions/route.ts");
    expect(actions).toContain("requireAssignedPersonInOrganisation");
    expect(actions).toContain("resolveActionClientId");
    expect(actions).toContain("Never trust browser-supplied client ownership");
    expect(actions.indexOf("requireAssignedPersonInOrganisation")).toBeLessThan(
      actions.indexOf("upsertActionInDb(")
    );
    expect(actions.indexOf("requireAssignedPersonInOrganisation")).toBeLessThan(
      actions.indexOf("deleteActionInDb(")
    );

    for (const path of [
      "app/api/clients/[clientId]/archive/route.ts",
      "app/api/clients/[clientId]/restore/route.ts",
    ] as const) {
      const source = read(path);
      expect(source, path).toContain("requireAssignedPersonInOrganisation");
      expect(source, path).not.toContain("requireAuthenticatedUser");
      const gateAt = source.indexOf("requireAssignedPersonInOrganisation");
      const mutateAt = Math.max(
        source.indexOf("archiveClientInDb"),
        source.indexOf("restoreClientInDb")
      );
      expect(gateAt, path).toBeGreaterThan(-1);
      expect(mutateAt, path).toBeGreaterThan(-1);
      expect(gateAt, path).toBeLessThan(mutateAt);
    }
  });

  it("allows assigned person in own organisation", async () => {
    requireOrganisationContext.mockResolvedValue({
      ok: true,
      context: {
        user: { id: "manager-1" },
        coachId: "manager-1",
        supabase: {},
        organisation: {
          organisationId: ORG_ID,
          role: "practitioner",
          organisation: { aiEnabled: true },
        },
      },
    });
    requireAssignedClientAccess.mockResolvedValue({
      ok: true,
      assignment: { assignmentRole: "primary" },
      privateNotesOwnerId: "manager-1",
      clientOrganisationId: ORG_ID,
      clientCoachId: "manager-1",
    });

    const { requireAssignedPersonInOrganisation } = await import(
      "@/lib/organisations/person-access-gate"
    );
    const result = await requireAssignedPersonInOrganisation({
      clientId: ASSIGNED_CLIENT_ID,
      requireAiEnabled: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.clientId).toBe(ASSIGNED_CLIENT_ID);
    expect(requireAssignedClientAccess).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: ASSIGNED_CLIENT_ID })
    );
  });

  it("rejects unassigned person where assignment is required", async () => {
    requireOrganisationContext.mockResolvedValue({
      ok: true,
      context: {
        user: { id: "manager-1" },
        coachId: "manager-1",
        supabase: {},
        organisation: {
          organisationId: ORG_ID,
          role: "practitioner",
          organisation: { aiEnabled: true },
        },
      },
    });
    requireAssignedClientAccess.mockResolvedValue({
      ok: false,
      response: NextResponse.json(
        { error: "Resource not found." },
        { status: 404 }
      ),
    });

    const { requireAssignedPersonInOrganisation } = await import(
      "@/lib/organisations/person-access-gate"
    );
    const result = await requireAssignedPersonInOrganisation({
      clientId: ASSIGNED_CLIENT_ID,
      requireAiEnabled: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(404);
    const body = await result.response.json();
    expect(body.error).toBe("Resource not found.");
  });

  it("rejects person in another organisation without existence leak", async () => {
    requireOrganisationContext.mockResolvedValue({
      ok: true,
      context: {
        user: { id: "manager-1" },
        coachId: "manager-1",
        supabase: {},
        organisation: {
          organisationId: ORG_ID,
          role: "practitioner",
          organisation: { aiEnabled: true },
        },
      },
    });
    requireAssignedClientAccess.mockResolvedValue({
      ok: false,
      response: NextResponse.json(
        { error: "Resource not found." },
        { status: 404 }
      ),
    });

    const { requireAssignedPersonInOrganisation } = await import(
      "@/lib/organisations/person-access-gate"
    );
    const result = await requireAssignedPersonInOrganisation({
      clientId: FOREIGN_CLIENT_ID,
      requireAiEnabled: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(404);
    const body = await result.response.json();
    expect(body.error).toBe("Resource not found.");
    expect(body).not.toHaveProperty("exists");
  });

  it("rejects foreign organisationId bypass attempts", async () => {
    requireOrganisationContext.mockResolvedValue({
      ok: true,
      context: {
        user: { id: "manager-1" },
        coachId: "manager-1",
        supabase: {},
        organisation: {
          organisationId: ORG_ID,
          role: "practitioner",
          organisation: { aiEnabled: true },
        },
      },
    });
    requireAssignedClientAccess.mockResolvedValue({
      ok: true,
      assignment: { assignmentRole: "primary" },
      privateNotesOwnerId: "manager-1",
      clientOrganisationId: ORG_ID,
      clientCoachId: "manager-1",
    });

    const { requireAssignedPersonInOrganisation } = await import(
      "@/lib/organisations/person-access-gate"
    );
    const result = await requireAssignedPersonInOrganisation({
      clientId: ASSIGNED_CLIENT_ID,
      bodyOrganisationId: "44444444-4444-4444-8444-444444444444",
      requireAiEnabled: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(404);
  });

  it("does not invoke AI provider after failed authorisation on draft-summary", async () => {
    const create = vi.fn();
    vi.doMock("openai", () => ({
      default: class OpenAI {
        responses = { create };
        constructor() {
          /* no-op */
        }
      },
    }));

    vi.doMock("@/lib/organisations/person-access-gate", () => ({
      requireAssignedPersonInOrganisation: vi.fn().mockResolvedValue({
        ok: false,
        response: NextResponse.json(
          { error: "Resource not found." },
          { status: 404 }
        ),
      }),
    }));

    const { POST } = await import("@/app/api/draft-summary/route");
    const response = await POST(
      new Request("http://localhost/api/draft-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes: "Some session notes",
          clientId: FOREIGN_CLIENT_ID,
        }),
      })
    );

    expect(response.status).toBe(404);
    expect(create).not.toHaveBeenCalled();
  });

  it("does not invoke AI provider after failed authorisation on coaching-questions", async () => {
    const create = vi.fn();
    vi.doMock("openai", () => ({
      default: class OpenAI {
        responses = { create };
        constructor() {
          /* no-op */
        }
      },
    }));

    vi.doMock("@/lib/organisations/person-access-gate", () => ({
      requireAssignedPersonInOrganisation: vi.fn().mockResolvedValue({
        ok: false,
        response: NextResponse.json(
          { error: "Resource not found." },
          { status: 404 }
        ),
      }),
    }));

    const { POST } = await import("@/app/api/coaching-questions/route");
    const response = await POST(
      new Request("http://localhost/api/coaching-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes: "Some session notes",
          clientId: FOREIGN_CLIENT_ID,
        }),
      })
    );

    expect(response.status).toBe(404);
    expect(create).not.toHaveBeenCalled();
  });

  it("does not invoke AI provider after failed authorisation on patterns generate", async () => {
    const create = vi.fn();
    vi.doMock("openai", () => ({
      default: class OpenAI {
        responses = { create };
        constructor() {
          /* no-op */
        }
      },
    }));

    vi.doMock("@/lib/organisations/person-access-gate", () => ({
      requireAssignedPersonInOrganisation: vi.fn().mockResolvedValue({
        ok: false,
        response: NextResponse.json(
          { error: "Resource not found." },
          { status: 404 }
        ),
      }),
    }));

    const { POST } = await import("@/app/api/patterns/generate/route");
    const response = await POST(
      new Request("http://localhost/api/patterns/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: FOREIGN_CLIENT_ID }),
      })
    );

    expect(response.status).toBe(404);
    expect(create).not.toHaveBeenCalled();
  });

  it("does not invoke AI after denied access on development-updates generate and coaching-report", async () => {
    const create = vi.fn();
    vi.doMock("openai", () => ({
      default: class OpenAI {
        responses = { create };
        constructor() {
          /* no-op */
        }
      },
    }));

    vi.doMock("@/lib/organisations/person-access-gate", () => ({
      requireAssignedPersonInOrganisation: vi.fn().mockResolvedValue({
        ok: false,
        response: NextResponse.json(
          { error: "Resource not found." },
          { status: 404 }
        ),
      }),
    }));

    const { POST: generateUpdate } = await import(
      "@/app/api/development-updates/generate/route"
    );
    const updateResponse = await generateUpdate(
      new Request("http://localhost/api/development-updates/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: FOREIGN_CLIENT_ID,
          sessionId: ASSIGNED_CLIENT_ID,
        }),
      })
    );
    expect(updateResponse.status).toBe(404);

    const { POST: coachingReport } = await import(
      "@/app/api/coaching-report/route"
    );
    const reportResponse = await coachingReport(
      new Request("http://localhost/api/coaching-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: FOREIGN_CLIENT_ID,
          evidence: [{ sessionNumber: 1, summary: "x" }],
        }),
      })
    );
    expect(reportResponse.status).toBe(404);
    expect(create).not.toHaveBeenCalled();
  });

  it("does not mutate actions or archive after denied person access", async () => {
    const upsertActionInDb = vi.fn();
    const archiveClientInDb = vi.fn();
    const restoreClientInDb = vi.fn();

    vi.doMock("@/lib/organisations/person-access-gate", () => ({
      requireAssignedPersonInOrganisation: vi.fn().mockResolvedValue({
        ok: false,
        response: NextResponse.json(
          { error: "Resource not found." },
          { status: 404 }
        ),
      }),
    }));
    vi.doMock("@/lib/supabase/repository", () => ({
      upsertActionInDb,
      deleteActionInDb: vi.fn(),
      archiveClientInDb,
      restoreClientInDb,
      OwnershipError: class OwnershipError extends Error {},
      ClientArchivedError: class ClientArchivedError extends Error {},
    }));

    const { POST: createAction } = await import("@/app/api/actions/route");
    const createResponse = await createAction(
      new Request("http://localhost/api/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: { clientId: FOREIGN_CLIENT_ID, title: "Follow up" },
        }),
      })
    );
    expect(createResponse.status).toBe(404);
    expect(upsertActionInDb).not.toHaveBeenCalled();

    vi.resetModules();
    vi.doMock("@/lib/organisations/person-access-gate", () => ({
      requireAssignedPersonInOrganisation: vi.fn().mockResolvedValue({
        ok: false,
        response: NextResponse.json(
          { error: "Resource not found." },
          { status: 404 }
        ),
      }),
    }));
    vi.doMock("@/lib/supabase/repository", () => ({
      upsertActionInDb,
      deleteActionInDb: vi.fn(),
      archiveClientInDb,
      restoreClientInDb,
      OwnershipError: class OwnershipError extends Error {},
      ClientArchivedError: class ClientArchivedError extends Error {},
    }));

    const { POST: archive } = await import(
      "@/app/api/clients/[clientId]/archive/route"
    );
    const archiveResponse = await archive(
      new Request(`http://localhost/api/clients/${FOREIGN_CLIENT_ID}/archive`, {
        method: "POST",
      }),
      { params: Promise.resolve({ clientId: FOREIGN_CLIENT_ID }) }
    );
    expect(archiveResponse.status).toBe(404);
    expect(archiveClientInDb).not.toHaveBeenCalled();

    vi.resetModules();
    vi.doMock("@/lib/organisations/person-access-gate", () => ({
      requireAssignedPersonInOrganisation: vi.fn().mockResolvedValue({
        ok: false,
        response: NextResponse.json(
          { error: "Resource not found." },
          { status: 404 }
        ),
      }),
    }));
    vi.doMock("@/lib/supabase/repository", () => ({
      upsertActionInDb,
      deleteActionInDb: vi.fn(),
      archiveClientInDb,
      restoreClientInDb,
      OwnershipError: class OwnershipError extends Error {},
      ClientArchivedError: class ClientArchivedError extends Error {},
    }));

    const { POST: restore } = await import(
      "@/app/api/clients/[clientId]/restore/route"
    );
    const restoreResponse = await restore(
      new Request(`http://localhost/api/clients/${FOREIGN_CLIENT_ID}/restore`, {
        method: "POST",
      }),
      { params: Promise.resolve({ clientId: FOREIGN_CLIENT_ID }) }
    );
    expect(restoreResponse.status).toBe(404);
    expect(restoreClientInDb).not.toHaveBeenCalled();
  });

  it("shared gate encodes org + assignment rules used by Org Lead when assigned", () => {
    const gate = read("lib/organisations/person-access-gate.ts");
    expect(gate).toContain("requireOrganisationContext");
    expect(gate).toContain("requireAssignedClientAccess");
    expect(gate).toContain("requireAiEnabled");
    expect(gate).toContain("Resource not found.");
    // Does not invent a broader Org Lead bypass.
    expect(gate).not.toContain("canViewSafeOversight");
    expect(gate).not.toContain("canManageOrganisation");
  });
});
