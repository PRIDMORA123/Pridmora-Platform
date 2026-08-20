import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertClientIsAssignableOrganisationPerson,
  assignRelationship,
  buildLeadAssignmentAdministrationPayload,
  countActiveAssignedPeopleByUser,
  endAssignment,
  SELF_DEVELOPMENT_ASSIGNMENT_BLOCKED_CODE,
  SelfDevelopmentAssignmentBlockedError,
  transferPrimaryAssignment,
} from "@/lib/organisations/assignments";
import { isSelfDevelopmentClientRow } from "@/lib/my-development/self-development-identity";

const root = process.cwd();

function read(pathFromRoot: string): string {
  return readFileSync(join(root, pathFromRoot), "utf8");
}

const ORG_ID = "org-1";
const SELF_ID = "self-uuid-1";
const PERSON_ID = "person-uuid-1";
const MGR_A = "manager-a";
const MGR_B = "manager-b";
const SELF_ASSIGNMENT_ID = "assignment-self-1";
const PERSON_ASSIGNMENT_ID = "assignment-person-1";

const requireOrganisationContext = vi.fn();

vi.mock("@/lib/organisations/repository", () => ({
  writeOrganisationAudit: vi.fn(async () => undefined),
}));

vi.mock("@/lib/organisations/current-organisation", async importOriginal => {
  const actual =
    await importOriginal<typeof import("@/lib/organisations/current-organisation")>();
  return {
    ...actual,
    requireOrganisationContext: (...args: unknown[]) =>
      requireOrganisationContext(...args),
  };
});

vi.mock("@/lib/organisations/licence", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/organisations/licence")>();
  return {
    ...actual,
    loadPractitionerSeatUsage: vi.fn(async () => ({
      licence: {
        planName: "Pilot",
        seatsPurchased: 20,
        status: "active",
        startsAt: null,
        endsAt: null,
      },
      summary: { seatsPurchased: 20, seatsInUse: 2, seatsAvailable: 18 },
      memberships: [
        { userId: MGR_A, role: "practitioner", status: "active" },
        { userId: MGR_B, role: "practitioner", status: "active" },
      ],
      assignments: [],
    })),
  };
});

function westbridgeStyleAssignmentRows() {
  const clients: Array<{
    id: string;
    name: string;
    status: string;
    role: string;
    is_self_development: boolean;
  }> = [];
  const assignments: Array<{
    id: string;
    client_id: string;
    user_id: string;
    assignment_role: string;
    status: string;
    assigned_at: string;
    ended_at: null;
  }> = [];
  const members: Array<{
    user_id: string;
    role: string;
    professional_role: string;
  }> = [];

  for (let managerIndex = 0; managerIndex < 10; managerIndex += 1) {
    const userId = `manager-${managerIndex + 1}`;
    members.push({
      user_id: userId,
      role: "practitioner",
      professional_role: "manager",
    });
    for (let personIndex = 0; personIndex < 5; personIndex += 1) {
      const id = `${userId}-person-${personIndex + 1}`;
      clients.push({
        id,
        name: `Person ${personIndex + 1}`,
        status: "active",
        role: "Team leader",
        is_self_development: false,
      });
      assignments.push({
        id: `a-${id}`,
        client_id: id,
        user_id: userId,
        assignment_role: "primary",
        status: "active",
        assigned_at: "2026-08-01T00:00:00.000Z",
        ended_at: null,
      });
    }
    const selfId = `${userId}-self`;
    clients.push({
      id: selfId,
      name: "My development",
      status: "active",
      role: "Self development",
      is_self_development: true,
    });
    assignments.push({
      id: `a-${selfId}`,
      client_id: selfId,
      user_id: userId,
      assignment_role: "primary",
      status: "active",
      assigned_at: "2026-08-01T00:00:00.000Z",
      ended_at: null,
    });
  }

  return { clients, assignments, members };
}

type Mutation = { op: string; table: string; payload?: unknown };

function createAssignmentSupabase(input: {
  client?: Record<string, unknown> | null;
  membership?: Record<string, unknown> | null;
  currentPrimary?: Record<string, unknown> | null;
  existingAssignment?: Record<string, unknown> | null;
}) {
  const mutations: Mutation[] = [];

  const supabase = {
    from(table: string) {
      let op: "select" | "update" | "insert" = "select";
      let updatePayload: unknown;

      const builder = {
        select() {
          return builder;
        },
        eq() {
          return builder;
        },
        maybeSingle: async () => {
          if (op === "update") {
            mutations.push({ op: "update", table, payload: updatePayload });
            return {
              data:
                input.existingAssignment ??
                input.currentPrimary ?? {
                  id: PERSON_ASSIGNMENT_ID,
                  client_id: PERSON_ID,
                  user_id: MGR_A,
                  assignment_role: "primary",
                },
              error: null,
            };
          }
          if (table === "clients") {
            return { data: input.client ?? null, error: null };
          }
          if (table === "organisation_memberships") {
            return { data: input.membership ?? { id: "mem-1", status: "active", role: "practitioner" }, error: null };
          }
          if (table === "relationship_assignments") {
            return {
              data: input.existingAssignment ?? input.currentPrimary ?? null,
              error: null,
            };
          }
          return { data: null, error: null };
        },
        update(payload: unknown) {
          op = "update";
          updatePayload = payload;
          return builder;
        },
        insert(payload: unknown) {
          mutations.push({ op: "insert", table, payload });
          return Promise.resolve({ error: null });
        },
        then(resolve: (value: { error: null; data: null }) => void) {
          if (op === "update") {
            mutations.push({ op: "update", table, payload: updatePayload });
          }
          resolve({ error: null, data: null });
        },
      };

      return builder;
    },
  };

  return { supabase, mutations };
}

describe("Lead assignment administration excludes My Development", () => {
  it("reuses canonical self-development identity rather than a competing rule", () => {
    const assignments = read("lib/organisations/assignments.ts");
    const route = read("app/api/organisations/assignments/route.ts");
    const members = read("app/api/organisations/members/route.ts");
    const oversight = read("lib/organisations/oversight.ts");
    expect(assignments).toContain("isSelfDevelopmentClientRow");
    expect(members).toContain("listSelfDevelopmentClientIdsForOrganisation");
    expect(oversight).toContain("isSelfDevelopmentClientRow");
    expect(route).toContain("buildLeadAssignmentAdministrationPayload");
    expect(route).toContain("SelfDevelopmentAssignmentBlockedError");
    expect(isSelfDevelopmentClientRow({ is_self_development: true })).toBe(true);
    expect(
      isSelfDevelopmentClientRow({ role: "Self development" })
    ).toBe(true);
  });

  it("does not expose self-development in Lead assignment GET, while ordinary People remain", () => {
    const { clients, assignments, members } = westbridgeStyleAssignmentRows();
    const payload = buildLeadAssignmentAdministrationPayload({
      clients,
      assignments,
      members,
      nameByUser: new Map(members.map(member => [member.user_id, member.user_id])),
    });

    expect(payload.relationships).toHaveLength(50);
    expect(payload.assignments).toHaveLength(50);
    expect(payload.relationships.some(row => /self/i.test(row.id))).toBe(false);
    expect(payload.assignments.some(row => /self/i.test(row.clientId))).toBe(
      false
    );
    expect(payload.relationships.some(row => row.id.includes("-person-"))).toBe(
      true
    );
    expect(payload.practitioners).toHaveLength(10);
    expect(payload.practitioners.every(row => row.assignedCount === 5)).toBe(
      true
    );
    expect(
      payload.practitioners.reduce((sum, row) => sum + row.assignedCount, 0)
    ).toBe(50);
  });

  it("Manager assigned-People counts exclude self-development assignment rows", () => {
    const counts = countActiveAssignedPeopleByUser(
      [
        { user_id: MGR_A, client_id: PERSON_ID, status: "active" },
        { user_id: MGR_A, client_id: SELF_ID, status: "active" },
        { user_id: MGR_B, client_id: "person-2", status: "active" },
      ],
      new Set([SELF_ID])
    );
    expect(counts.get(MGR_A)).toBe(1);
    expect(counts.get(MGR_B)).toBe(1);
  });

  it("does not change Manager My Development creation or workspace access", () => {
    const selfRelationship = read("lib/my-development/self-relationship.ts");
    const workspace = read("lib/my-development/workspace.ts");
    const workspaceRoute = read("app/api/my-development/workspace/route.ts");
    expect(selfRelationship).toContain("ensureSelfDevelopmentRelationship");
    expect(selfRelationship).not.toContain("assertClientIsAssignableOrganisationPerson");
    expect(selfRelationship).not.toContain("SelfDevelopmentAssignmentBlockedError");
    expect(workspace).toContain("ensureSelfDevelopmentRelationship");
    expect(workspaceRoute).toContain("requireOrganisationContext");
  });
});

describe("server fail-closed assignment guard", () => {
  const selfClient = {
    id: SELF_ID,
    organisation_id: ORG_ID,
    role: "Self development",
    is_self_development: true,
  };
  const personClient = {
    id: PERSON_ID,
    organisation_id: ORG_ID,
    role: "Team leader",
    is_self_development: false,
  };

  it("rejects a self-development client UUID before any assignment mutation", async () => {
    const { supabase, mutations } = createAssignmentSupabase({ client: selfClient });
    await expect(
      assertClientIsAssignableOrganisationPerson({
        supabase: supabase as never,
        organisationId: ORG_ID,
        clientId: SELF_ID,
      })
    ).rejects.toBeInstanceOf(SelfDevelopmentAssignmentBlockedError);

    await expect(
      transferPrimaryAssignment({
        supabase: supabase as never,
        organisationId: ORG_ID,
        clientId: SELF_ID,
        toUserId: MGR_B,
        actorUserId: "lead-1",
      })
    ).rejects.toMatchObject({
      code: SELF_DEVELOPMENT_ASSIGNMENT_BLOCKED_CODE,
    });

    await expect(
      assignRelationship({
        supabase: supabase as never,
        organisationId: ORG_ID,
        clientId: SELF_ID,
        userId: MGR_B,
        assignmentRole: "cover",
        actorUserId: "lead-1",
      })
    ).rejects.toBeInstanceOf(SelfDevelopmentAssignmentBlockedError);

    expect(
      mutations.filter(row => row.table === "relationship_assignments")
    ).toEqual([]);
  });

  it("rejects ending a self-development assignment by UUID without mutating it", async () => {
    const { supabase, mutations } = createAssignmentSupabase({
      client: selfClient,
      existingAssignment: {
        id: SELF_ASSIGNMENT_ID,
        client_id: SELF_ID,
        user_id: MGR_A,
        assignment_role: "primary",
        status: "active",
      },
    });

    await expect(
      endAssignment({
        supabase: supabase as never,
        organisationId: ORG_ID,
        assignmentId: SELF_ASSIGNMENT_ID,
        actorUserId: "lead-1",
      })
    ).rejects.toBeInstanceOf(SelfDevelopmentAssignmentBlockedError);

    expect(mutations.some(row => row.op === "update")).toBe(false);
    expect(mutations.some(row => row.op === "insert")).toBe(false);
  });

  it("leaves ordinary Person transfer behaviour unchanged", async () => {
    const { supabase, mutations } = createAssignmentSupabase({
      client: personClient,
      currentPrimary: {
        id: PERSON_ASSIGNMENT_ID,
        user_id: MGR_A,
      },
    });

    await transferPrimaryAssignment({
      supabase: supabase as never,
      organisationId: ORG_ID,
      clientId: PERSON_ID,
      toUserId: MGR_B,
      actorUserId: "lead-1",
    });

    expect(
      mutations.some(
        row => row.table === "relationship_assignments" && row.op === "update"
      )
    ).toBe(true);
    expect(
      mutations.some(
        row => row.table === "relationship_assignments" && row.op === "insert"
      )
    ).toBe(true);
  });
});

describe("Lead assignment POST rejects self-development by UUID", () => {
  beforeEach(() => {
    requireOrganisationContext.mockReset();
  });

  async function postAsLead(
    body: Record<string, unknown>,
    supabase: unknown
  ) {
    const { POST } = await import("@/app/api/organisations/assignments/route");
    requireOrganisationContext.mockResolvedValue({
      ok: true,
      context: {
        user: { id: "lead-1" },
        supabase,
        organisation: {
          organisationId: ORG_ID,
          role: "oversight",
          organisation: { name: "Westbridge" },
        },
      },
    });
    return POST(
      new Request("http://localhost/api/organisations/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    );
  }

  it("returns 403 for transfer, assign and end of a self-development UUID", async () => {
    const selfClient = {
      id: SELF_ID,
      organisation_id: ORG_ID,
      role: "Self development",
      is_self_development: true,
    };

    const transferMock = createAssignmentSupabase({ client: selfClient });
    const transferResponse = await postAsLead(
      { action: "transfer", clientId: SELF_ID, userId: MGR_B },
      transferMock.supabase
    );
    expect(transferResponse.status).toBe(403);
    await expect(transferResponse.json()).resolves.toMatchObject({
      code: SELF_DEVELOPMENT_ASSIGNMENT_BLOCKED_CODE,
    });
    expect(transferMock.mutations).toEqual([]);

    const assignMock = createAssignmentSupabase({ client: selfClient });
    const assignResponse = await postAsLead(
      { clientId: SELF_ID, userId: MGR_B, assignmentRole: "cover" },
      assignMock.supabase
    );
    expect(assignResponse.status).toBe(403);
    expect(assignMock.mutations).toEqual([]);

    const endMock = createAssignmentSupabase({
      client: selfClient,
      existingAssignment: {
        id: SELF_ASSIGNMENT_ID,
        client_id: SELF_ID,
        user_id: MGR_A,
        assignment_role: "primary",
        status: "active",
      },
    });
    const endResponse = await postAsLead(
      { action: "end", assignmentId: SELF_ASSIGNMENT_ID },
      endMock.supabase
    );
    expect(endResponse.status).toBe(403);
    expect(endMock.mutations.some(row => row.op === "update")).toBe(false);
  });
});
