import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  canAccessCoachingContent,
  canAccessPrivateIdentity,
} from "@/lib/organisations/permissions";
import {
  getRelationshipDisplayName,
  validateCreateRelationshipIdentity,
  generateConfidentialReference,
} from "@/lib/relationship-identity";

const root = process.cwd();

function read(pathFromRoot: string): string {
  return readFileSync(join(root, pathFromRoot), "utf8");
}

describe("private identity access — org role regressions", () => {
  it("denies organisation owner when not assigned", () => {
    expect(
      canAccessPrivateIdentity({ role: "owner", assignmentRole: null })
    ).toBe(false);
    expect(
      canAccessCoachingContent({ role: "owner", assignmentRole: null })
    ).toBe(false);
  });

  it("denies organisation admin when not assigned", () => {
    expect(
      canAccessPrivateIdentity({ role: "administrator", assignmentRole: null })
    ).toBe(false);
  });

  it("denies oversight when not assigned", () => {
    expect(
      canAccessPrivateIdentity({ role: "oversight", assignmentRole: null })
    ).toBe(false);
    // Oversight is never content-capable even if somehow assigned supervisor-only.
    expect(
      canAccessPrivateIdentity({ role: "oversight", assignmentRole: "primary" })
    ).toBe(false);
  });

  it("allows directly assigned practitioner", () => {
    expect(
      canAccessPrivateIdentity({
        role: "practitioner",
        assignmentRole: "primary",
      })
    ).toBe(true);
    expect(
      canAccessPrivateIdentity({
        role: "practitioner",
        assignmentRole: "co_practitioner",
      })
    ).toBe(true);
    expect(
      canAccessPrivateIdentity({
        role: "practitioner",
        assignmentRole: "cover",
      })
    ).toBe(true);
  });

  it("allows owner/admin only when directly assigned", () => {
    expect(
      canAccessPrivateIdentity({ role: "owner", assignmentRole: "primary" })
    ).toBe(true);
    expect(
      canAccessPrivateIdentity({
        role: "administrator",
        assignmentRole: "cover",
      })
    ).toBe(true);
  });

  it("models legacy coach_id owner as primary only when deliberately retained", () => {
    // requireAssignedClientAccess maps legacy owner (coach_id, no assignments)
    // to assignmentRole "primary". Org role alone remains insufficient.
    expect(
      canAccessPrivateIdentity({
        role: "practitioner",
        assignmentRole: "primary",
      })
    ).toBe(true);
    expect(
      canAccessPrivateIdentity({
        role: "practitioner",
        assignmentRole: null,
      })
    ).toBe(false);
  });

  it("RLS policies use content access, not org oversight permissions", () => {
    const sql = read(
      "supabase/migrations/20260804120000_confidential_coaching.sql"
    );
    expect(sql).toContain("user_can_access_client_content(client_id, auth.uid())");
    expect(sql).not.toMatch(
      /Private identity select assigned[\s\S]{0,400}organisation\.view_safe_oversight/
    );
    expect(sql).not.toMatch(
      /Private identity select assigned[\s\S]{0,400}assignments\.manage/
    );
    // Documented SQL helper: assignment OR legacy coach_id when no assignments.
    const foundation = read(
      "supabase/migrations/20260802140000_organisation_foundation.sql"
    );
    expect(foundation).toContain("user_is_assigned_to_client");
    expect(foundation).toMatch(
      /user_can_access_client_content[\s\S]*coach_id = p_user_id[\s\S]*not exists/
    );
    const freeze = read(
      "supabase/migrations/20260827200000_organisation_deletion_foundation.sql"
    );
    expect(freeze).toContain("client_organisation_allows_member_access(p_client_id)");
    expect(freeze).toContain("pending_closure organisations fail closed");
  });
});

describe("atomic confidential relationship creation", () => {
  it("ships SECURITY DEFINER create_coaching_relationship RPC", () => {
    const sql = read(
      "supabase/migrations/20260804120000_confidential_coaching.sql"
    );
    expect(sql).toContain("create_coaching_relationship");
    expect(sql).toContain("security definer");
    expect(sql).toContain("generate_confidential_reference");
    expect(sql).toContain("relationship_assignments");
    expect(sql).toContain("client_private_identities");
    expect(sql).toContain("has_organisation_permission");
    expect(sql).toContain("relationships.create");
    // Never accept coach_id / confidential_reference from callers.
    expect(sql).not.toMatch(
      /create_coaching_relationship\([\s\S]*p_coach_id/
    );
    expect(sql).not.toMatch(
      /create_coaching_relationship\([\s\S]*p_confidential_reference/
    );
  });

  it("API uses atomic RPC and rejects browser-supplied ownership fields", () => {
    const route = read("app/api/clients/route.ts");
    const repo = read("lib/supabase/repository.ts");
    expect(route).toContain("createRelationshipAtomicInDb");
    expect(route).toContain("organisationId: source.organisationId");
    expect(route).toContain("coachId: source.coachId");
    expect(route).toContain("Never trust browser-supplied coachId");
    expect(repo).toContain('rpc("create_coaching_relationship"');
    expect(repo).not.toMatch(
      /createRelationshipAtomicInDb[\s\S]*confidential_reference:/
    );
  });

  it("rejects browser organisation_id, coach_id and confidential_reference", () => {
    const gen = generateConfidentialReference;
    expect(
      validateCreateRelationshipIdentity(
        {
          identityMode: "confidential",
          role: "Lead",
          organisationId: "org-1",
        },
        { generateReference: gen }
      )
    ).toMatchObject({ status: 400 });

    expect(
      validateCreateRelationshipIdentity(
        {
          identityMode: "standard",
          name: "Alex",
          coach_id: "user-1",
        },
        { generateReference: gen }
      )
    ).toMatchObject({ status: 400 });

    expect(
      validateCreateRelationshipIdentity(
        {
          identityMode: "confidential",
          role: "Lead",
          confidentialReference: "C-HACKED",
        },
        { generateReference: gen }
      )
    ).toMatchObject({ status: 400 });
  });
});

describe("AI route identity boundary guard", () => {
  const aiRouteFiles = [
    "app/api/preparation/generate/route.ts",
    "app/api/development-updates/generate/route.ts",
    "app/api/coaching-intelligence/prepare/route.ts",
    "app/api/patterns/generate/route.ts",
    "app/api/identity-journey/route.ts",
    "app/api/coaching-moments/route.ts",
    "app/api/development-reports/[reportId]/generate/route.ts",
    "app/api/coaching-report/route.ts",
  ];

  it("lists every generative AI route using buildRelationshipAiContext", () => {
    for (const path of aiRouteFiles) {
      const source = read(path);
      expect(source, path).toContain("buildRelationshipAiContext");
    }
  });

  it("fails if an AI route constructs Name: from client.name directly", () => {
    for (const path of aiRouteFiles) {
      const source = read(path);
      expect(source, path).not.toMatch(/`Name: \$\{client\.name/);
      expect(source, path).not.toMatch(/`Name: \$\{String\(client\.name/);
      expect(source, path).not.toMatch(
        /personName:\s*String\(client\.name/
      );
      expect(source, path).not.toMatch(
        /coacheeName\s*=\s*String\(client\.name/
      );
      expect(source, path).not.toMatch(
        /clientDisplayName\s*=\s*String\(client\.name/
      );
    }
  });

  it("draft-summary and coaching-questions do not invent identity context", () => {
    const draft = read("app/api/draft-summary/route.ts");
    const questions = read("app/api/coaching-questions/route.ts");
    // Notes-only routes — must not build person identity prompts.
    expect(draft).not.toMatch(/`Name: \$\{/);
    expect(questions).not.toMatch(/`Name: \$\{/);
    expect(draft).not.toContain("buildRelationshipAiContext");
    expect(questions).not.toContain("buildRelationshipAiContext");
  });
});

describe("confidential client.name display audit", () => {
  it("stores only public label/reference in clients.name for confidential mode", () => {
    const result = validateCreateRelationshipIdentity(
      {
        identityMode: "confidential",
        displayLabel: "Programme lead",
        privateRealName: "Jordan Secret",
      },
      { generateReference: () => "C-7K4M2P" }
    );
    expect("status" in result).toBe(false);
    if ("status" in result) return;
    expect(result.name).toBe("Programme lead");
    expect(result.name).not.toContain("Jordan");
    expect(
      getRelationshipDisplayName({
        name: result.name,
        identityMode: "confidential",
        displayLabel: result.displayLabel,
        confidentialReference: result.confidentialReference,
      })
    ).toBe("Programme lead");
  });

  it("UI surfaces use getRelationshipDisplayName rather than raw private fields", () => {
    const surfaces = [
      "components/clients-view.tsx",
      "components/identity/client-header.tsx",
      "components/coaching-report-view.tsx",
      "components/journey-view.tsx",
      "components/session-view.tsx",
      "components/session-workspace.tsx",
      "components/coach-space-view.tsx",
      "components/prepare-session-view.tsx",
    ];
    for (const path of surfaces) {
      const source = read(path);
      expect(source, path).toMatch(
        /getRelationshipDisplayName|relationshipPublicIdentity/
      );
    }
  });
});

describe("client_private_identities policy source guards", () => {
  it("documents focused policy expectations for live DB tests", () => {
    const sql = read(
      "supabase/migrations/20260804120000_confidential_coaching.sql"
    );
    expect(sql).toContain('create policy "Private identity select assigned"');
    expect(sql).toContain('create policy "Private identity insert assigned"');
    expect(sql).toContain('create policy "Private identity update assigned"');
    expect(sql).toContain('create policy "Private identity delete assigned"');
    expect(sql).toContain("grant all on public.client_private_identities to service_role");
  });
});
