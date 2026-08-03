import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  COACHING_JOURNEY_STAGE_IDS,
  STAGE_TO_LEGACY_TAB,
  appViewToStage,
} from "@/lib/coaching-journey/coaching-journey";

const root = process.cwd();

function read(pathFromRoot: string): string {
  return readFileSync(join(root, pathFromRoot), "utf8");
}

/**
 * Regression lock: premium onboarding must not reorder or rename the core
 * Prepare → Conversation → Summary & Insights → Development sequence.
 */
describe("premium foundation — core workflow regression", () => {
  it("preserves the coaching journey stage sequence", () => {
    expect(COACHING_JOURNEY_STAGE_IDS).toEqual([
      "current_position",
      "prepare",
      "session_notes",
      "summary_insights",
      "development",
      "reports",
    ]);
  });

  it("maps Prepare / Conversation / Summary / Development to existing routes", () => {
    expect(STAGE_TO_LEGACY_TAB.prepare).toBe("prepare");
    expect(STAGE_TO_LEGACY_TAB.session_notes).toBe("sessions");
    expect(STAGE_TO_LEGACY_TAB.summary_insights).toBe("summary");
    expect(STAGE_TO_LEGACY_TAB.development).toBe("intelligence");
    expect(appViewToStage("prepare")).toBe("prepare");
    expect(appViewToStage("session")).toBe("session_notes");
    expect(appViewToStage("intelligence")).toBe("development");
  });

  it("keeps AI Preparation, Summary & Insights and Development entry points", () => {
    const homeApp = read("components/home-app.tsx");
    expect(homeApp).toContain("PrepareSessionView");
    expect(homeApp).toContain("getPrepareRoute");
    expect(homeApp).toContain("PREPARE_VIEW");
    expect(homeApp).toContain("SessionWorkspace");
    expect(homeApp).toContain("PersonIntelligenceView");
    expect(homeApp).toContain("prepareAfterOnboarding");

    const journey = read("lib/coaching-journey/coaching-journey.ts");
    expect(journey).toContain('label: "Prepare"');
    expect(journey).toContain('label: "Session Notes"');
    expect(journey).toContain('label: "Summary & Insights"');
    expect(journey).toContain('label: "Development"');
  });

  it("does not introduce a parallel preparation workflow from onboarding", () => {
    const onboarding = read("components/onboarding/first-user-onboarding.tsx");
    expect(onboarding).toContain("Prepare for conversation");
    expect(onboarding).not.toContain("/api/preparation");
    expect(onboarding).not.toContain("generatePreparation");
  });

  it("continues to derive organisation ownership server-side", () => {
    const clientsRoute = read("app/api/clients/route.ts");
    const sessionsRoute = read("app/api/sessions/route.ts");
    expect(clientsRoute).toContain("Never trust browser-supplied organisation");
    expect(sessionsRoute).toContain("Never trust browser-supplied organisation");
    expect(sessionsRoute).toContain("resolveSessionOrganisationId");
  });
});
