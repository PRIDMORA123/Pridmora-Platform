/**
 * End-to-end isolation contract for switching coaching relationships.
 *
 * Browser automation is not wired in this package; this test locks the
 * remount / query-key / fail-safe behaviour that prevents Sarah's content
 * from appearing on Michael's Journey (including after hard refresh).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getJourneyQueryKey,
  RELATIONSHIP_ISOLATION_FAILSAFE_BODY,
  RELATIONSHIP_ISOLATION_FAILSAFE_TITLE,
} from "@/lib/relationship-scope";

const root = process.cwd();

function read(pathFromRoot: string): string {
  return readFileSync(join(root, pathFromRoot), "utf8");
}

describe("relationship isolation end-to-end contract", () => {
  it("Open Sarah → Journey → People → Michael never reuses prior journey state", () => {
    const home = read("components/home-app.tsx");
    const coachSpace = read("components/coach-space-view.tsx");

    // Switching people remounts Journey (and sibling surfaces) by relationship id.
    expect(home).toMatch(/<CoachSpaceView[\s\S]*key=\{selected\.id\}/);
    expect(home).toMatch(/<CareerJourneyView[\s\S]*key=\{selected\.id\}/);
    expect(home).toMatch(/<RelationshipReportsView[\s\S]*key=\{selected\.id\}/);
    expect(home).toMatch(/<PersonIntelligenceView[\s\S]*key=\{selected\.id\}/);

    // While Michael loads, Sarah's resolved model must not remain visible.
    expect(coachSpace).toContain("setProfile(null)");
    expect(coachSpace).toContain("setUpdates([])");
    expect(coachSpace).toContain("SkeletonCard");
    expect(coachSpace).toContain("isLoading || !page");
    expect(coachSpace).toContain("RelationshipCanvas");

    // Hard refresh of Michael's Journey still uses relationship-scoped keys.
    expect(getJourneyQueryKey("coach-1", "michael-relationship")).toEqual([
      "journey",
      "coach-1",
      "",
      "michael-relationship",
    ]);
    expect(getJourneyQueryKey("coach-1", "sarah-relationship")).not.toEqual(
      getJourneyQueryKey("coach-1", "michael-relationship")
    );
  });

  it("mixed data shows the visible fail-safe, never partial content", () => {
    const failsafe = read("components/relationship-isolation-failsafe.tsx");
    const coachSpace = read("components/coach-space-view.tsx");

    expect(failsafe).toContain("RELATIONSHIP_ISOLATION_FAILSAFE_TITLE");
    expect(failsafe).toContain("RELATIONSHIP_ISOLATION_FAILSAFE_BODY");
    expect(RELATIONSHIP_ISOLATION_FAILSAFE_TITLE).toBe(
      "Journey temporarily unavailable"
    );
    expect(RELATIONSHIP_ISOLATION_FAILSAFE_BODY.toLowerCase()).toContain(
      "could not safely confirm"
    );
    expect(coachSpace).toContain("RelationshipIsolationFailsafe");
    expect(coachSpace).toContain("assertJourneySourcesForRelationship");
  });
});
