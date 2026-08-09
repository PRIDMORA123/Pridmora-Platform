import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateCreateRelationshipIdentity } from "@/lib/relationship-identity";
import { findSelfDevelopmentClient } from "@/lib/my-development/self-relationship";

const root = process.cwd();

function read(pathFromRoot: string): string {
  return readFileSync(join(root, pathFromRoot), "utf8");
}

const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const SELF_ID = "33333333-3333-4333-8333-333333333333";
const MANAGED_ID = "44444444-4444-4444-8444-444444444444";

describe("My Development self evidence wiring", () => {
  it("opens evidence via self-relationship API, not selected managed person", () => {
    const home = read("components/home-app.tsx");
    expect(home).toContain("/api/my-development/self-relationship");
    expect(home).toContain('navigate("my-development-evidence")');
    expect(home).toContain("selfDevelopmentClient");
    expect(home).not.toMatch(
      /onOpenPersonalEvidence=\{\(\) => \{\s*if \(selected\) \{\s*navigate\("development-evidence"\)/
    );
  });

  it("excludes self-development clients from People listing", () => {
    const repo = read("lib/supabase/repository.ts");
    expect(repo).toContain("is_self_development");
    expect(repo).toContain("must not appear in People");
    expect(repo).toContain("self development");
  });

  it("supports pre-migration role sentinel fallback when column is absent", () => {
    const lib = read("lib/my-development/self-relationship.ts");
    const repo = read("lib/supabase/repository.ts");
    expect(lib).toContain('role: "Self development"');
    expect(lib).toContain('.eq("role", "Self development")');
    expect(lib).toMatch(/is_self_development\|schema cache\|could not find/);
    expect(repo).toContain("self development");
  });

  it("self-relationship route ensures own record without browser clientId", () => {
    const route = read("app/api/my-development/self-relationship/route.ts");
    const lib = read("lib/my-development/self-relationship.ts");
    expect(route).toContain("ensureSelfDevelopmentRelationship");
    expect(route).toContain("requireOrganisationContext");
    expect(route).not.toContain("requireAssignedPersonInOrganisation");
    expect(lib).toContain("is_self_development: true");
    expect(lib).toContain('displayLabel: "My development"');
    expect(lib).toContain('role: "Self development"');
    expect(lib).toContain(".eq(\"coach_id\", userId)");
    expect(lib).toContain(".eq(\"organisation_id\", organisationId)");
  });

  it("keeps managed-person evidence route separate", () => {
    const home = read("components/home-app.tsx");
    expect(home).toContain('view === "development-evidence" && selected');
    expect(home).toContain(
      'view === "my-development-evidence" && selfDevelopmentClient'
    );
  });

  it("surfaces self-development intelligence via dedicated My Development route", () => {
    const home = read("components/home-app.tsx");
    const shell = read("components/app-shell.tsx");
    const myDev = read("components/my-development-view.tsx");
    const evidence = read(
      "components/development-evidence/development-evidence-view.tsx"
    );
    const intel = read("components/my-development-intelligence-view.tsx");

    expect(shell).toContain('"my-development-intelligence"');
    expect(home).toContain("openSelfDevelopmentView");
    expect(home).toContain('navigate("my-development-intelligence")');
    expect(home).toContain("<MyDevelopmentIntelligenceView");
    expect(home).toContain(
      'view === "my-development-intelligence" && selfDevelopmentClient'
    );
    expect(home).toContain(
      'onOpenIntelligence={() => navigate("intelligence")}'
    );
    expect(myDev).toContain("onOpenPersonalIntelligence");
    expect(myDev).toContain("View development intelligence");
    expect(myDev).toContain("Development Intelligence");
    expect(evidence).toContain("View development intelligence");
    expect(evidence).toContain("Retry analysis");
    expect(evidence).toContain("Analysis pending");
    expect(evidence).toContain("Analysis failed");
    expect(evidence).toContain("decision === \"approve\" && onOpenIntelligence");
    expect(intel).toContain("DevelopmentIntelligenceEvidencePanel");
    expect(intel).toContain("own development");
    expect(intel).not.toMatch(/self[- ]?client/i);
  });

  it("reuses gated development-evidence APIs for add/read after self client is resolved", () => {
    const upload = read("app/api/development-evidence/[clientId]/upload/route.ts");
    const list = read("app/api/development-evidence/[clientId]/route.ts");
    expect(upload).toContain("requireAssignedPersonInOrganisation");
    expect(list).toContain("requireAssignedPersonInOrganisation");
  });

  it("creates evidence DB rows before extraction and does not await storage", () => {
    const upload = read("app/api/development-evidence/[clientId]/upload/route.ts");
    const createIdx = upload.indexOf("createUploadedEvidence");
    const extractIdx = upload.indexOf("extractEvidenceDocumentText");
    const storageIdx = upload.indexOf("startBestEffortStorageUpload");
    expect(createIdx).toBeGreaterThan(-1);
    expect(extractIdx).toBeGreaterThan(-1);
    expect(storageIdx).toBeGreaterThan(-1);
    expect(createIdx).toBeLessThan(extractIdx);
    expect(createIdx).toBeLessThan(storageIdx);
    expect(upload).toContain("Fire-and-forget");
    expect(upload).toContain("updateDocumentExtraction");
    expect(upload).not.toContain("await startBestEffortStorageUpload");
  });
});

describe("My Development self-relationship scoping", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  function mockFindClient(result: {
    data: Record<string, unknown> | null;
    error: { message: string } | null;
  }) {
    const maybeSingle = vi.fn().mockResolvedValue(result);
    const isArchived = vi.fn(() => ({ maybeSingle }));
    const eqSelf = vi.fn(() => ({ is: isArchived }));
    const eqCoach = vi.fn(() => ({ eq: eqSelf }));
    const eqOrg = vi.fn(() => ({ eq: eqCoach }));
    const select = vi.fn(() => ({ eq: eqOrg }));
    const from = vi.fn(() => ({ select }));
    return {
      supabase: { from } as never,
      eqOrg,
      eqCoach,
      eqSelf,
    };
  }

  it("finds own self-development client in current org only", async () => {
    const { supabase, eqOrg, eqCoach, eqSelf } = mockFindClient({
      data: {
        id: SELF_ID,
        name: "My development",
        display_label: "My development",
        role: "Self development",
        organisation_id: ORG_A,
        coach_id: USER_A,
        is_self_development: true,
        identity_mode: "standard",
        status: "Active",
        initials: "MD",
        archived_at: null,
      },
      error: null,
    });

    const found = await findSelfDevelopmentClient(supabase, ORG_A, USER_A);
    expect(found?.id).toBe(SELF_ID);
    expect(found?.isSelfDevelopment).toBe(true);
    expect(eqOrg).toHaveBeenCalledWith("organisation_id", ORG_A);
    expect(eqCoach).toHaveBeenCalledWith("coach_id", USER_A);
    expect(eqSelf).toHaveBeenCalledWith("is_self_development", true);
  });

  it("returns null for another user (cannot read peer self-development)", async () => {
    const { supabase, eqCoach } = mockFindClient({
      data: null,
      error: null,
    });

    const found = await findSelfDevelopmentClient(supabase, ORG_A, USER_B);
    expect(found).toBeNull();
    expect(eqCoach).toHaveBeenCalledWith("coach_id", USER_B);
  });

  it("returns null across organisations (cross-org denied)", async () => {
    const { supabase, eqOrg } = mockFindClient({
      data: null,
      error: null,
    });

    const found = await findSelfDevelopmentClient(supabase, ORG_B, USER_A);
    expect(found).toBeNull();
    expect(eqOrg).toHaveBeenCalledWith("organisation_id", ORG_B);
  });

  it("ensure reuses existing self client and does not create a managed person", async () => {
    vi.resetModules();
    const createSpy = vi.fn();
    vi.doMock("@/lib/supabase/repository", () => ({
      createRelationshipAtomicInDb: createSpy,
    }));

    const { ensureSelfDevelopmentRelationship: ensure } = await import(
      "@/lib/my-development/self-relationship"
    );
    const { supabase } = mockFindClient({
      data: {
        id: SELF_ID,
        name: "My development",
        display_label: "My development",
        role: "Self development",
        organisation_id: ORG_A,
        coach_id: USER_A,
        is_self_development: true,
        identity_mode: "standard",
        status: "Active",
        initials: "MD",
        archived_at: null,
      },
      error: null,
    });

    const client = await ensure({
      supabase,
      organisationId: ORG_A,
      userId: USER_A,
      fullName: "Manager Name",
    });
    expect(client.id).toBe(SELF_ID);
    expect(client.id).not.toBe(MANAGED_ID);
    expect(createSpy).not.toHaveBeenCalled();
    vi.doUnmock("@/lib/supabase/repository");
  });
});

describe("confidential vault vs public record", () => {
  it("public confidential payload never includes vault real name", () => {
    const result = validateCreateRelationshipIdentity(
      {
        identityMode: "confidential",
        displayLabel: "Ops programme",
        privateRealName: "Jordan Vault",
      },
      { generateReference: () => "C-VAULT1" }
    );
    expect("status" in result).toBe(false);
    if ("status" in result) return;
    expect(result.name).toBe("Ops programme");
    expect(result.name).not.toContain("Jordan");
    expect(result.privateIdentity?.realName).toBe("Jordan Vault");
  });

  it("create API persists vault name via private fields only", () => {
    const route = read("app/api/clients/route.ts");
    expect(route).toContain("privateRealName: validated.privateIdentity?.realName");
    expect(route).toContain("validateCreateRelationshipIdentity");
    expect(route).not.toMatch(
      /createRelationshipAtomicInDb\([\s\S]*name:\s*validated\.privateIdentity/
    );
  });
});
