import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Static ownership guard checks for Version 1.0 pilot readiness.
 * These verify server-side scoping patterns remain present in source.
 * They do not replace live multi-coach integration tests.
 */

const root = process.cwd();

function read(pathFromRoot: string): string {
  return readFileSync(join(root, pathFromRoot), "utf8");
}

describe("server-side ownership guards", () => {
  it("scopes client reads and writes by authenticated organisation context", () => {
    const clientsRoute = read("app/api/clients/route.ts");
    const clientRoute = read("app/api/clients/[clientId]/route.ts");
    const repository = read("lib/supabase/repository.ts");

    expect(clientsRoute).toContain("requireOrganisationContext");
    expect(clientsRoute).toContain("auth.context.coachId");
    expect(clientRoute).toContain("notFoundOrForbidden");
    expect(clientRoute).toContain("auth.context.coachId");
    expect(repository).toContain('.eq("coach_id", coachId)');
  });

  it("keeps preparation generation behind authentication", () => {
    const preparation = read("app/api/preparation/generate/route.ts");
    expect(preparation).toContain("requireOrganisationContext");
    expect(preparation).toMatch(/coachId|coach_id/);
  });

  it("keeps development update generation behind organisation assignment", () => {
    const updates = read("app/api/development-updates/generate/route.ts");
    expect(updates).toContain("requireAssignedPersonInOrganisation");
  });

  it("scopes journey and AI generation by relationship id", () => {
    const journeyLoader = read("lib/journey/load-journey-view-model.ts");
    const identityJourney = read("app/api/identity-journey/route.ts");
    const preparation = read("app/api/preparation/generate/route.ts");
    const updates = read("app/api/development-updates/generate/route.ts");
    const scope = read("lib/relationship-scope.ts");

    expect(journeyLoader).toContain("RelationshipScope");
    expect(journeyLoader).toContain("assertRelationshipOwnership");
    expect(identityJourney).toContain("relationshipId");
    expect(identityJourney).toContain("getApprovedRelationshipEvidence");
    expect(preparation).toContain("assertRelationshipOwnership");
    expect(updates).toContain("assertRelationshipOwnership");
    expect(scope).toContain("getJourneyQueryKey");
  });

  it("remounts relationship workspace views by client id", () => {
    const home = read("components/home-app.tsx");
    expect(home).toContain("key={selected.id}");
    expect(home).toContain("<CoachSpaceView");
    expect(home).toContain("<RelationshipReportsView");
    expect(home).toContain("<CareerJourneyView");
    expect(home).toContain("<PersonIntelligenceView");
  });

  it("does not ship pilot fixtures into SQL seed", () => {
    const seed = read("supabase/seed.sql");
    expect(seed).not.toContain("pilot-client-a");
    expect(seed).not.toContain("Alex Rivera");
  });
});
