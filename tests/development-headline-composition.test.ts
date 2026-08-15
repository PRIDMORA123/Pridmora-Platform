import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildDevelopmentIntelligenceEvidenceView,
  composeDevelopmentHeadlineIntelligence,
  evidenceLibraryHasMeaningfulSignals,
} from "@/lib/development-evidence";
import type { DevelopmentEvidenceRecord } from "@/lib/development-evidence";
import type { DevelopmentProfile } from "@/lib/development-updates/types";
import { buildRelationshipDevelopmentSnapshot } from "@/lib/development-snapshot";
import { buildDevelopmentProfileViewModel } from "@/lib/development-profile-view-model";
import type { Client } from "@/lib/types";

function emptyEvidenceView() {
  return buildDevelopmentIntelligenceEvidenceView({ records: [] });
}

function makeProfile(
  overrides: Partial<DevelopmentProfile> = {}
): DevelopmentProfile {
  return {
    id: "profile-1",
    clientId: "client-1",
    coachId: "coach-1",
    currentFocus: "",
    strengths: [],
    values: [],
    motivators: [],
    emergingThemes: [],
    growthAreas: [],
    coachingPreferences: [],
    beliefs: [],
    patterns: [],
    commitments: [],
    coachingPatterns: [],
    patternsEvidenceFingerprint: null,
    patternsGeneratedAt: null,
    createdAt: "2026-08-14T00:00:00.000Z",
    updatedAt: "2026-08-14T00:00:00.000Z",
    ...overrides,
  };
}

function makeEvidence(
  overrides: Partial<DevelopmentEvidenceRecord> = {}
): DevelopmentEvidenceRecord {
  return {
    id: "ev-1",
    organisationId: null,
    clientId: "client-1",
    evidenceType: "feedback_360",
    sourceType: "uploaded_document",
    sourceRecordId: null,
    title: "360 feedback",
    evidenceDate: "2026-08-01",
    capturedAt: "2026-08-01T00:00:00.000Z",
    capturedBy: null,
    originalDocumentId: null,
    processingStatus: "ready",
    reviewStatus: "approved",
    includeInIntelligence: true,
    structuredEvidence: {
      strengthSignals: ["Clearer expectation-setting"],
      developmentSignals: ["Earlier performance conversations"],
      observations: [
        {
          title: "Clearer expectations",
          description: "Peers note clearer standards.",
          behaviouralEvidence: "Weekly priorities stated explicitly.",
        },
      ],
    },
    sourceSummary: "Peers note clearer standards.",
    freshnessClass: "current",
    restricted: false,
    contentHash: null,
    extractionVersion: null,
    purpose: null,
    sourceLabel: null,
    capabilityKeys: ["feedback_difficult_conversations"],
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  };
}

describe("composeDevelopmentHeadlineIntelligence", () => {
  it("A. applied profile populated + zero included evidence → profile headlines", () => {
    const evidenceView = emptyEvidenceView();
    expect(evidenceLibraryHasMeaningfulSignals(evidenceView)).toBe(false);

    const composed = composeDevelopmentHeadlineIntelligence({
      evidenceView,
      profile: makeProfile({
        currentFocus: "Lead with clearer expectations",
        strengths: [
          {
            id: "s1",
            value: "Naming priorities early",
            status: "supported",
          },
        ],
        emergingThemes: [
          {
            id: "t1",
            value: "Delegation under pressure",
            status: "emerging",
          },
        ],
      }),
    });

    expect(composed.headlineSource).toBe("development_profile");
    expect(composed.developmentTrajectory).not.toMatch(
      /not yet enough reviewed evidence/i
    );
    expect(composed.strengthsBeingDemonstrated).toContain(
      "Naming priorities early"
    );
    expect(composed.nextDevelopmentFocus).not.toMatch(/gathering broader evidence/i);
  });

  it("B. applied strength present → cannot say no reviewed strength signals", () => {
    const composed = composeDevelopmentHeadlineIntelligence({
      evidenceView: emptyEvidenceView(),
      profile: makeProfile({
        strengths: [
          { id: "s1", value: "Calm under scrutiny", status: "supported" },
        ],
      }),
    });
    expect(composed.strengthsBeingDemonstrated.length).toBeGreaterThan(0);
    expect(composed.strengthsBeingDemonstrated.join(" ")).not.toMatch(
      /No reviewed strength signals yet/i
    );
  });

  it("C. profile progress/theme → trajectory reflects reviewed development", () => {
    const composed = composeDevelopmentHeadlineIntelligence({
      evidenceView: emptyEvidenceView(),
      profile: makeProfile({
        emergingThemes: [
          { id: "t1", value: "Holding boundaries", status: "supported" },
        ],
        strengths: [
          { id: "s1", value: "Clearer follow-through", status: "emerging" },
        ],
      }),
    });
    expect(composed.developmentTrajectory).toMatch(/Holding boundaries|Clearer follow-through/i);
    expect(composed.developmentTrajectory).not.toBe(
      "There is not yet enough reviewed evidence to describe a development trajectory."
    );
  });

  it("D. meaningful evidence-library signals still display correctly", () => {
    const evidenceView = buildDevelopmentIntelligenceEvidenceView({
      records: [makeEvidence()],
      currentFocus: "Lead former peers with clear expectations",
    });
    expect(evidenceLibraryHasMeaningfulSignals(evidenceView)).toBe(true);

    const composed = composeDevelopmentHeadlineIntelligence({
      evidenceView,
      profile: makeProfile({
        strengths: [
          { id: "s1", value: "Profile-only strength", status: "supported" },
        ],
      }),
    });

    expect(composed.headlineSource).toBe("evidence_library");
    expect(composed.strengthsBeingDemonstrated).toContain(
      "Clearer expectation-setting"
    );
    expect(composed.strengthsBeingDemonstrated).not.toContain(
      "Profile-only strength"
    );
    expect(composed.capabilities.length).toBeGreaterThan(0);
  });

  it("E. empty profile + empty evidence library → true empty state", () => {
    const evidenceView = emptyEvidenceView();
    const composed = composeDevelopmentHeadlineIntelligence({
      evidenceView,
      profile: makeProfile(),
    });
    expect(composed.headlineSource).toBe("empty");
    expect(composed.developmentTrajectory).toMatch(
      /not yet enough reviewed evidence/i
    );
    expect(composed.strengthsBeingDemonstrated).toEqual([]);
    expect(composed.nextDevelopmentFocus).toMatch(/gathering broader evidence/i);
  });

  it("F. Development Snapshot remains driven by profile view-model", () => {
    const profile = makeProfile({
      currentFocus: "Lead with clearer expectations",
      emergingThemes: [
        { id: "t1", value: "Delegation under pressure", status: "supported" },
      ],
      strengths: [
        { id: "s1", value: "Naming priorities early", status: "supported" },
      ],
    });
    const client = {
      id: "client-1",
      name: "Alex Morgan",
      sessions: [],
      actions: [],
    } as unknown as Client;
    const viewModel = buildDevelopmentProfileViewModel(client, profile);
    const snapshot = buildRelationshipDevelopmentSnapshot({
      data: viewModel,
      completedSessionCount: 2,
    });
    expect(snapshot.hasEnoughEvidence).toBe(true);
    expect(snapshot.currentDirection).toMatch(/clearer expectations/i);
    expect(snapshot.areas.some(area => /Delegation/i.test(area.label))).toBe(
      true
    );
  });
});

describe("post-apply consistency contracts", () => {
  it("G. Apply route remains unchanged (no evidence bridge)", () => {
    const apply = readFileSync(
      resolve(process.cwd(), "app/api/development-updates/[updateId]/apply/route.ts"),
      "utf8"
    );
    expect(apply).toContain("applyDevelopmentUpdateRpc");
    expect(apply).not.toContain("development_evidence");
    expect(apply).not.toContain("composeDevelopmentHeadlineIntelligence");
  });

  it("H. patterns refresh label and behaviour remain pattern-scoped", () => {
    const panels = readFileSync(
      resolve(process.cwd(), "components/patterns/pattern-panels.tsx"),
      "utf8"
    );
    expect(panels).toContain("Refresh recognised patterns");
    expect(panels).not.toContain("Refresh development intelligence");

    const generate = readFileSync(
      resolve(process.cwd(), "app/api/patterns/generate/route.ts"),
      "utf8"
    );
    expect(generate).toContain("saveCoachingPatterns");
    expect(generate).not.toContain("composeDevelopmentHeadlineIntelligence");
  });

  it("wires profile into Development page composition", () => {
    const person = readFileSync(
      resolve(process.cwd(), "components/person-intelligence-view.tsx"),
      "utf8"
    );
    expect(person).toContain("profile={profile}");
    const panel = readFileSync(
      resolve(
        process.cwd(),
        "components/development-evidence/development-intelligence-evidence-panel.tsx"
      ),
      "utf8"
    );
    expect(panel).toContain("composeDevelopmentHeadlineIntelligence");
    expect(panel).toContain("Based on the reviewed development profile");
  });
});
