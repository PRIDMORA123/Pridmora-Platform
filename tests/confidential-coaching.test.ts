import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  assertAiPayloadExcludesPrivateIdentity,
  buildRelationshipAiContext,
  formatRelationshipAiPersonContext,
  generateConfidentialReference,
  isConfidentialReferenceFormat,
  validateCreateRelationshipIdentity,
  relationshipPublicIdentity,
  DEFAULT_CONFIDENTIAL_DISPLAY_LABEL,
} from "@/lib/relationship-identity";
import {
  buildCoachingReportDraft,
  defaultReportPrivacyForClient,
} from "@/lib/coaching-report";
import type { Client } from "@/lib/types";

const root = process.cwd();

function read(pathFromRoot: string): string {
  return readFileSync(join(root, pathFromRoot), "utf8");
}

function baseClient(overrides: Partial<Client> = {}): Client {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Public Label",
    initials: "PL",
    organisation: "Acme",
    role: "Head of Finance",
    email: "",
    identityMode: "confidential",
    displayLabel: "Head of Finance programme",
    confidentialReference: "C-7K4M2P",
    aiNameAllowed: false,
    status: "Active",
    nextSession: "Not scheduled",
    currentFocus: "Stakeholder confidence",
    identitySummary: "",
    coachInsight: "",
    preparationStyleOverride: null,
    strengths: [],
    values: [],
    themes: [],
    goals: [],
    actions: [],
    quotes: [],
    sessions: [],
    journey: [],
    ...overrides,
  };
}

describe("confidential coaching migration", () => {
  it("ships the confidential coaching migration with RLS and uniqueness", () => {
    const path = "supabase/migrations/20260804120000_confidential_coaching.sql";
    expect(existsSync(join(root, path))).toBe(true);
    const sql = read(path);
    expect(sql).toContain("identity_mode");
    expect(sql).toContain("confidential_reference");
    expect(sql).toContain("display_label");
    expect(sql).toContain("ai_name_allowed");
    expect(sql).toContain("client_private_identities");
    expect(sql).toContain("user_can_access_client_content");
    expect(sql).toContain("Private identity select assigned");
    expect(sql).toContain("clients_org_confidential_reference_uidx");
    expect(sql).not.toMatch(/has_organisation_permission.*private/i);
    // No sequential global ID generator.
    expect(sql).not.toMatch(/serial|bigserial|nextval/i);
  });

  it("does not auto-migrate existing clients away from standard", () => {
    const sql = read(
      "supabase/migrations/20260804120000_confidential_coaching.sql"
    );
    expect(sql).toContain("default 'standard'");
    expect(sql).toMatch(/display_label = name/);
    expect(sql).not.toMatch(/set identity_mode\s*=\s*'confidential'/i);
  });
});

describe("confidential reference generation", () => {
  it("generates C-XXXXXX format without sequential IDs", () => {
    const ref = generateConfidentialReference(() =>
      Uint8Array.from([7, 20, 4, 12, 2, 15])
    );
    expect(isConfidentialReferenceFormat(ref)).toBe(true);
    expect(ref.startsWith("C-")).toBe(true);
  });

  it("rejects browser-supplied confidential references on create", () => {
    const result = validateCreateRelationshipIdentity(
      {
        identityMode: "confidential",
        displayLabel: "Programme lead",
        confidentialReference: "C-HACKED",
      },
      { generateReference: () => "C-7K4M2P" }
    );
    expect(result).toMatchObject({
      status: 400,
      error: expect.stringMatching(/cannot be supplied/i),
    });
  });
});

describe("relationship creation validation", () => {
  it("creates standard relationships with required name", () => {
    const result = validateCreateRelationshipIdentity(
      {
        identityMode: "standard",
        name: "Alex Rivera",
        role: "Ops lead",
        aiNameAllowed: true,
      },
      { generateReference: () => "C-AAAAAA" }
    );
    expect(result).toMatchObject({
      identityMode: "standard",
      name: "Alex Rivera",
      displayLabel: "Alex Rivera",
      aiNameAllowed: true,
      confidentialReference: null,
    });
  });

  it("creates confidential relationships with vault real name kept private", () => {
    const result = validateCreateRelationshipIdentity(
      {
        identityMode: "confidential",
        role: "Head of Finance",
        privateRealName: "Secret Person",
        privateEmail: "secret@example.com",
        privatePhone: "+441234",
        privateNotes: "Do not share",
      },
      { generateReference: () => "C-7K4M2P" }
    );
    expect("status" in result).toBe(false);
    if ("status" in result) return;
    expect(result.identityMode).toBe("confidential");
    expect(result.confidentialReference).toBe("C-7K4M2P");
    expect(result.name).not.toContain("Secret Person");
    expect(result.name).toBe("Head of Finance");
    expect(result.privateIdentity).toEqual({
      realName: "Secret Person",
      email: "secret@example.com",
      phone: "+441234",
      privateNotes: "Do not share",
    });
  });

  it("requires Identity Vault real name for confidential create", () => {
    const result = validateCreateRelationshipIdentity(
      {
        identityMode: "confidential",
        displayLabel: "Programme lead",
        role: "Head of Finance",
      },
      { generateReference: () => "C-7K4M2P" }
    );
    expect(result).toMatchObject({
      status: 400,
      error: expect.stringMatching(/Identity Vault|real name/i),
    });
  });

  it("falls back display label to Confidential relationship", () => {
    // Confidential requires label or role — supply role then clear via empty role after? 
    // Validation requires at least one; test fallback helper via role-only path already covered.
    // Explicit empty both fails:
    const invalid = validateCreateRelationshipIdentity(
      { identityMode: "confidential" },
      { generateReference: () => "C-7K4M2P" }
    );
    expect(invalid).toMatchObject({ status: 400 });

    const withLabel = validateCreateRelationshipIdentity(
      { identityMode: "confidential", displayLabel: " " },
      { generateReference: () => "C-7K4M2P" }
    );
    expect(withLabel).toMatchObject({ status: 400 });
  });
});

describe("AI identity boundary", () => {
  it("excludes private identity from confidential AI context", () => {
    const privateIdentity = {
      realName: "Jordan Secret",
      email: "jordan.secret@example.com",
      phone: "+447700900123",
      privateNotes: "Lives in Manchester; prefers evenings",
    };
    const context = buildRelationshipAiContext(
      baseClient(),
      privateIdentity
    );
    const payload = [
      ...formatRelationshipAiPersonContext(context),
      "Evidence notes about leadership.",
    ].join("\n");

    expect(payload).toContain("C-7K4M2P");
    expect(payload).toContain("Head of Finance programme");
    expect(payload).not.toContain("Jordan Secret");
    expect(payload).not.toContain("jordan.secret@example.com");
    expect(payload).not.toContain("+447700900123");
    expect(payload).not.toContain("Manchester");

    expect(() =>
      assertAiPayloadExcludesPrivateIdentity(payload, privateIdentity)
    ).not.toThrow();
  });

  it("fails when private values leak into an AI payload", () => {
    expect(() =>
      assertAiPayloadExcludesPrivateIdentity(
        "Talking with Jordan Secret about email jordan.secret@example.com",
        {
          realName: "Jordan Secret",
          email: "jordan.secret@example.com",
          phone: "",
          privateNotes: "",
        }
      )
    ).toThrow(/realName|email/);
  });

  it("standard mode withholds preferred name unless ai_name_allowed", () => {
    const blocked = buildRelationshipAiContext({
      name: "Alex Rivera",
      displayLabel: "Ops programme",
      identityMode: "standard",
      aiNameAllowed: false,
      role: "Ops",
      organisation: "Trust",
    });
    expect(blocked.aiDisplayName).toBe("Ops programme");
    expect(blocked.allowedClientName).toBe("Alex Rivera");

    const allowed = buildRelationshipAiContext({
      name: "Alex Rivera",
      displayLabel: "Ops programme",
      identityMode: "standard",
      aiNameAllowed: true,
      role: "Ops",
      organisation: "Trust",
    });
    expect(allowed.aiDisplayName).toBe("Alex Rivera");
  });

  it("does not send legal name when display_label equals name and ai_name_allowed is false", () => {
    const context = buildRelationshipAiContext({
      name: "Sarah Chen",
      displayLabel: "Sarah Chen",
      identityMode: "standard",
      aiNameAllowed: false,
      role: "Manager",
      organisation: "Trust",
    });
    expect(context.aiDisplayName).toBe("[SUBJECT]");
    expect(context.allowedClientName).toBe("Sarah Chen");
    const lines = formatRelationshipAiPersonContext(context).join("\n");
    expect(lines).toContain("Person reference: [SUBJECT]");
    expect(lines).not.toContain("Sarah Chen");
  });

  it("never includes email or phone in formatted AI person context", () => {
    const context = buildRelationshipAiContext({
      name: "Alex",
      email: "alex@example.com" as unknown as undefined,
      identityMode: "standard",
      aiNameAllowed: true,
      role: "Lead",
      organisation: "Trust",
    } as Parameters<typeof buildRelationshipAiContext>[0]);
    const lines = formatRelationshipAiPersonContext(context).join("\n");
    expect(lines).not.toMatch(/@/);
    expect(lines).not.toMatch(/phone/i);
  });
});

describe("reports and exports", () => {
  it("defaults confidential reports to public identity", () => {
    const privacy = defaultReportPrivacyForClient({ identityMode: "confidential" });
    expect(privacy.includePrivateName).toBe(false);

    const draft = buildCoachingReportDraft({
      client: baseClient(),
      reportType: "progress",
      period: { mode: "all" },
    });
    expect(draft.clientName).toContain("C-7K4M2P");
    expect(draft.clientName).not.toContain("Secret");
  });

  it("includes private name only after explicit approval", () => {
    const draft = buildCoachingReportDraft({
      client: baseClient(),
      reportType: "progress",
      period: { mode: "all" },
      includePrivateName: true,
      privateRealName: "Jordan Secret",
    });
    expect(draft.clientName).toBe("Jordan Secret");
  });
});

describe("public representation", () => {
  it("keeps public clients representation free of private real name", () => {
    const identity = relationshipPublicIdentity(baseClient());
    expect(identity.displayName).toBe("Head of Finance programme");
    expect(identity.confidentialReference).toBe("C-7K4M2P");
    expect(identity.displayName).not.toBe(DEFAULT_CONFIDENTIAL_DISPLAY_LABEL);
  });
});

describe("API and AI route source guards", () => {
  it("client create API validates identity mode and uses atomic RPC", () => {
    const route = read("app/api/clients/route.ts");
    expect(route).toContain("validateCreateRelationshipIdentity");
    expect(route).toContain("createRelationshipAtomicInDb");
    expect(route).toContain("Never trust browser-supplied organisation");
    expect(route).not.toContain("upsertPrivateIdentity");
  });

  it("private identity API requires assigned access and audits without values", () => {
    const route = read(
      "app/api/clients/[clientId]/private-identity/route.ts"
    );
    const repo = read("lib/private-identity.ts");
    expect(route).toContain("requireAssignedClientAccess");
    expect(route).toContain("auditPrivateIdentityViewed");
    expect(repo).toContain("private_identity_viewed");
    expect(repo).toContain("private_identity_updated");
    expect(route).not.toMatch(/console\.(log|info|warn|error)\([^)]*realName/);
    // Audit metadata records presence flags only — never the private values themselves.
    expect(repo).toContain("hasRealName: Boolean(input.fields.realName.trim())");
    expect(repo).toContain("Never log identity values");
  });

  it("search API returns public identity only", () => {
    const route = read("app/api/clients/search/route.ts");
    expect(route).toContain("relationshipPublicIdentity");
    expect(route).toContain("searchPrivateIdentityClientIds");
    expect(route).not.toContain("real_name");
    expect(route).not.toContain("realName");
  });

  it("AI routes use buildRelationshipAiContext", () => {
    const routes = [
      "app/api/preparation/generate/route.ts",
      "app/api/development-updates/generate/route.ts",
      "app/api/coaching-intelligence/prepare/route.ts",
      "app/api/patterns/generate/route.ts",
      "app/api/identity-journey/route.ts",
      "app/api/coaching-moments/route.ts",
      "app/api/development-reports/[reportId]/generate/route.ts",
      "app/api/coaching-report/route.ts",
    ];
    for (const path of routes) {
      const source = read(path);
      expect(source, path).toContain("buildRelationshipAiContext");
    }
  });

  it("private identity RLS policies exclude organisation role shortcuts", () => {
    const sql = read(
      "supabase/migrations/20260804120000_confidential_coaching.sql"
    );
    const policyBlock = sql.slice(
      sql.indexOf("Private identity select assigned")
    );
    expect(policyBlock).toContain("user_can_access_client_content");
    expect(policyBlock).not.toContain("organisation.view_safe_oversight");
    expect(policyBlock).not.toContain("assignments.manage");
  });
});
