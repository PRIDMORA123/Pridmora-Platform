import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  boundMyDevelopmentLearningSnippet,
  toReflectionSummaries,
} from "@/lib/my-development/workspace";
import type { DevelopmentEvidenceRecord } from "@/lib/development-evidence/types";

const root = process.cwd();

function read(pathFromRoot: string): string {
  return readFileSync(join(root, pathFromRoot), "utf8");
}

function reflectionWithFields(input: {
  id: string;
  title: string;
  noticed?: string;
  practiseNext?: string;
  preview?: string;
}): DevelopmentEvidenceRecord {
  const observations = [];
  if (input.noticed) {
    observations.push({
      title: "What I noticed",
      description: input.noticed,
      category: "Reflection",
    });
  }
  if (input.practiseNext) {
    observations.push({
      title: "What I want to practise next",
      description: input.practiseNext,
      category: "Development priority",
    });
  }
  return {
    id: input.id,
    organisationId: "org-a",
    clientId: "self-a",
    evidenceType: "personal_reflection",
    sourceType: "manual_entry",
    sourceRecordId: null,
    title: input.title,
    evidenceDate: "2026-08-12",
    capturedAt: "2026-08-12T10:00:00Z",
    capturedBy: "user-a",
    originalDocumentId: null,
    processingStatus: "ready",
    reviewStatus: "approved",
    includeInIntelligence: true,
    structuredEvidence: {
      observations,
      developmentSignals: [],
      strengthSignals: [],
      capabilitySignals: [],
      contradictoryEvidence: [],
      context: [],
      limitations: [],
    },
    sourceSummary: input.preview ?? "Preview fallback text",
    freshnessClass: "current",
    restricted: false,
    contentHash: null,
    extractionVersion: null,
    purpose: "Manager development reflection",
    sourceLabel: "My development reflection",
    capabilityKeys: [],
    createdAt: "2026-08-12T10:00:00Z",
    updatedAt: "2026-08-12T10:00:00Z",
    deletedAt: null,
  };
}

describe("Stage 2.3.2.2 learning & navigation loop", () => {
  it("maps whatNoticed and practiseNext into reflection summaries", () => {
    const [summary] = toReflectionSummaries([
      reflectionWithFields({
        id: "r1",
        title: "After the meeting",
        noticed: "I held the decision too long.",
        practiseNext: "Name the outcome earlier.",
      }),
    ]);
    expect(summary?.whatNoticed).toBe("I held the decision too long.");
    expect(summary?.practiseNext).toBe("Name the outcome earlier.");
    expect(summary?.preview).toBe("Preview fallback text");
  });

  it("handles missing learning fields safely and bounds long snippets", () => {
    const [empty] = toReflectionSummaries([
      reflectionWithFields({
        id: "r2",
        title: "Short note",
        preview: "Only preview available",
      }),
    ]);
    expect(empty?.whatNoticed).toBeNull();
    expect(empty?.practiseNext).toBeNull();
    expect(empty?.preview).toBe("Only preview available");

    const long = "x".repeat(220);
    const bounded = boundMyDevelopmentLearningSnippet(long, 180);
    expect(bounded?.endsWith("…")).toBe(true);
    expect(bounded?.length).toBeLessThanOrEqual(180);
  });

  it("overview learning prefers whatNoticed/practiseNext and falls back to preview", () => {
    const view = read("components/my-development-view.tsx");
    expect(view).toContain("What I noticed");
    expect(view).toContain("What I&apos;ll practise next");
    expect(view).toContain("latestReflection.whatNoticed");
    expect(view).toContain("latestReflection.practiseNext");
    expect(view).toContain("latestReflection.preview");
    expect(view).not.toContain("openai");
    expect(view).not.toContain("generateSummary");
    expect(view).not.toContain("whatHappened");
    expect(view).not.toContain("whatWasDifficult");
  });

  it("keeps complete → Reflect now → save → View My Development loop intact", () => {
    const overview = read("components/my-development-view.tsx");
    const reflection = read("components/my-development-reflection-view.tsx");
    const home = read("components/home-app.tsx");
    expect(overview).toContain("onReflectAfterComplete");
    expect(overview).toContain("buildCompletedActionReflectionContext");
    expect(reflection).toContain("View My Development");
    expect(reflection).toContain('"/api/my-development/reflection"');
    expect(reflection).toContain('method: "POST"');
    expect(home).toContain("onReflectAfterComplete");
    expect(home).toContain("initialPrefill={reflectionPrefill}");
  });

  it("uses shared full My Development subnav across self views only", () => {
    const subnav = read("components/my-development-subnav.tsx");
    const overview = read("components/my-development-view.tsx");
    const reflection = read("components/my-development-reflection-view.tsx");
    const evidence = read(
      "components/development-evidence/development-evidence-view.tsx"
    );
    const intel = read("components/my-development-intelligence-view.tsx");
    const home = read("components/home-app.tsx");

    expect(subnav).toContain('active: MyDevelopmentSubnavSection');
    expect(subnav).toContain("Overview");
    expect(subnav).toContain("Reflection");
    expect(subnav).toContain("Evidence");
    expect(subnav).toContain("Development Intelligence");

    expect(overview).toContain('active="overview"');
    expect(reflection).toContain('active="reflection"');
    expect(intel).toContain('active="intelligence"');
    expect(evidence).toContain('active="evidence"');
    expect(evidence).toContain("myDevelopmentNav");
    expect(evidence).toContain("showMyDevelopmentSubnav");

    expect(home).toContain("myDevelopmentNav={{");
    // Managed-person evidence path must not receive My Development nav.
    const personEvidenceIdx = home.indexOf(
      'view === "development-evidence" && selected'
    );
    expect(personEvidenceIdx).toBeGreaterThan(-1);
    const personBlock = home.slice(
      personEvidenceIdx,
      personEvidenceIdx + 500
    );
    expect(personBlock).not.toContain("myDevelopmentNav");
  });

  it("adds View My Development on Aurelia capture success without changing capture logic", () => {
    const capture = read("components/aurelia/manager-aurelia-capture.tsx");
    const view = read("components/aurelia/manager-aurelia-view.tsx");
    const home = read("components/home-app.tsx");
    const captureAction = read(
      "app/api/my-development/aurelia/capture-action/route.ts"
    );
    const propose = read(
      "app/api/my-development/aurelia/propose-capture/route.ts"
    );

    expect(capture).toContain("View My Development");
    expect(capture).toContain("onViewMyDevelopment");
    expect(capture).toContain(
      "manager-aurelia-capture-view-my-development"
    );
    expect(view).toContain("onViewMyDevelopment");
    expect(home).toContain(
      'onViewMyDevelopment={() => navigate("my-development")}'
    );

    expect(captureAction).toContain("ensureSelfDevelopmentRelationship");
    expect(captureAction).toContain('status: "Open"');
    expect(propose).toContain("buildManagerAureliaProposeCaptureInstructions");
    expect(capture).toContain("/api/my-development/aurelia/propose-capture");
    expect(capture).toContain("/api/my-development/reflection");
    expect(capture).toContain("/api/my-development/aurelia/capture-action");
  });

  it("does not invent progress story or create migrations", () => {
    const overview = read("components/my-development-view.tsx");
    expect(overview).not.toContain("Your progress");
    expect(overview).not.toContain("progress score");
    expect(overview).not.toContain("streak");
    const migrations = readdirSync(join(root, "supabase/migrations"));
    expect(
      migrations.some(name => /2\.3\.2\.2|learning.?navigation/i.test(name))
    ).toBe(false);
  });

  it("preserves Stage 2.3.1 hierarchy and Stage 2.3.2.1 lifecycle controls", () => {
    const view = read("components/my-development-view.tsx");
    expect(view.indexOf("Your focus")).toBeLessThan(
      view.indexOf("What you&apos;re practising")
    );
    expect(view.indexOf("What you&apos;re practising")).toBeLessThan(
      view.indexOf("What you&apos;re learning")
    );
    expect(view.indexOf("What you&apos;re learning")).toBeLessThan(
      view.indexOf("Your next step")
    );
    expect(view).toContain("Mark complete");
    expect(view).toContain('operation: "complete"');
    expect(view).toContain("/api/my-development/actions/");
  });
});
