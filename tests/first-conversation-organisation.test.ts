import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  allocateNextSessionNumber,
  defaultSessionTitle,
} from "@/lib/relationship-workspace";
import {
  CREATE_CONVERSATION_USER_ERROR,
  RELATIONSHIP_ORGANISATION_MISSING,
  RelationshipOrganisationMissingError,
  isRawDatabaseConstraintMessage,
  resolveSessionOrganisationId,
  safeCreateConversationErrorMessage,
} from "@/lib/organisations/session-organisation";
import { createBlankSession } from "@/lib/sessions";
import { sessionToRow } from "@/lib/supabase/map";

const root = process.cwd();

function read(pathFromRoot: string): string {
  return readFileSync(join(root, pathFromRoot), "utf8");
}

describe("first conversation organisation ownership", () => {
  it("resolves organisation_id from the stored client only", () => {
    expect(resolveSessionOrganisationId("org-personal-1")).toBe("org-personal-1");
    expect(() => resolveSessionOrganisationId(null)).toThrow(
      RelationshipOrganisationMissingError
    );
    expect(() => resolveSessionOrganisationId("")).toThrow(
      RelationshipOrganisationMissingError
    );
    expect(() => resolveSessionOrganisationId("   ")).toThrow(
      RelationshipOrganisationMissingError
    );
  });

  it("sessionToRow writes organisation_id when provided", () => {
    const session = createBlankSession({
      id: "11111111-1111-4111-8111-111111111111",
      clientId: "22222222-2222-4222-8222-222222222222",
      coachId: "33333333-3333-4333-8333-333333333333",
      sessionNumber: 1,
    });
    const row = sessionToRow(
      session,
      "33333333-3333-4333-8333-333333333333",
      "44444444-4444-4444-8444-444444444444"
    );
    expect(row.organisation_id).toBe("44444444-4444-4444-8444-444444444444");
    expect(row.client_id).toBe(session.clientId);
    expect(row.coach_id).toBe("33333333-3333-4333-8333-333333333333");
  });

  it("never leaves organisation_id off the session write path", () => {
    const route = read("app/api/sessions/route.ts");
    const repository = read("lib/supabase/repository.ts");
    expect(route).toContain("resolveSessionOrganisationId");
    expect(route).toContain("access.clientOrganisationId");
    expect(route).toContain("Never trust browser-supplied organisation");
    expect(route).toContain("RELATIONSHIP_ORGANISATION_MISSING");
    expect(route).toContain("CREATE_CONVERSATION_USER_ERROR");
    expect(repository).toContain("organisation_id: resolvedOrganisationId");
    expect(repository).not.toMatch(
      /return insertFullClient\(supabase, client, coachId, null\)/
    );
  });

  it("clients API derives organisation_id server-side for new personal workspace clients", () => {
    const route = read("app/api/clients/route.ts");
    expect(route).toContain("requireOrganisationContext");
    expect(route).toContain("Never trust browser-supplied organisation");
    expect(route).toContain("auth.context.organisation.organisationId");
    expect(route).toContain("createRelationshipAtomicInDb");
    expect(route).not.toContain("organisationId !== coachId ? organisationId");
  });

  it("createClientInDb requires organisation ownership", () => {
    const repository = read("lib/supabase/repository.ts");
    expect(repository).toContain("RelationshipOrganisationMissingError");
    expect(repository).toContain("organisation_id: organisationId");
    expect(repository).toContain("createPrimaryAssignment");
    expect(repository).toContain("createRelationshipAtomicInDb");
    expect(repository).toContain('rpc("create_coaching_relationship"');
  });

  it("assigned access returns clientOrganisationId for session derivation", () => {
    const source = read("lib/organisations/current-organisation.ts");
    expect(source).toContain("clientOrganisationId");
    expect(source).toContain('select("id, organisation_id, coach_id")');
  });

  it("unassigned practitioners are rejected by requireAssignedClientAccess", () => {
    const source = read("lib/organisations/current-organisation.ts");
    expect(source).toContain("canAccessCoachingContent");
    expect(source).toContain("getActiveAssignment");
    expect(source).toContain("notFoundOrForbidden");
  });

  it("allocates Session 1 with correct capitalisation for a new relationship", () => {
    expect(allocateNextSessionNumber([])).toBe(1);
    expect(defaultSessionTitle(1)).toBe("Session 1");
  });

  it("modal shows the person name and hides raw database errors", () => {
    const modal = read("components/relationship-workspace/add-session-control.tsx");
    const canvas = read(
      "components/relationship-workspace/relationship-canvas.tsx"
    );
    expect(modal).toContain("Create conversation for ${personName}");
    expect(modal).toContain("clientName");
    expect(modal).toContain("clientId");
    expect(modal).toContain("safeCreateConversationErrorMessage");
    expect(modal).toContain('type="submit"');
    expect(modal).toContain("identity-modal-error");
    expect(canvas).toContain("clientName={relationship.name}");
    expect(canvas).toContain("clientId={relationship.id}");
  });

  it("maps missing organisation and constraint leaks to a safe UI message", () => {
    expect(
      safeCreateConversationErrorMessage(
        new RelationshipOrganisationMissingError()
      )
    ).toBe(CREATE_CONVERSATION_USER_ERROR);

    expect(
      safeCreateConversationErrorMessage({
        code: RELATIONSHIP_ORGANISATION_MISSING,
        message: "internal",
      })
    ).toBe(CREATE_CONVERSATION_USER_ERROR);

    const raw =
      'null value in column "organisation_id" of relation "sessions" violates not-null constraint';
    expect(isRawDatabaseConstraintMessage(raw)).toBe(true);
    expect(safeCreateConversationErrorMessage(new Error(raw))).toBe(
      CREATE_CONVERSATION_USER_ERROR
    );
    expect(safeCreateConversationErrorMessage(new Error(raw))).not.toContain(
      "organisation_id"
    );
    expect(safeCreateConversationErrorMessage(new Error(raw))).not.toContain(
      "violates"
    );
  });

  it("createSessionRecord uses the safe conversation error path", () => {
    const storage = read("lib/storage.ts");
    expect(storage).toContain("safeCreateConversationErrorMessage");
    expect(storage).toContain("RELATIONSHIP_ORGANISATION_MISSING");
    expect(storage).toContain("CREATE_CONVERSATION_USER_ERROR");
  });
});
