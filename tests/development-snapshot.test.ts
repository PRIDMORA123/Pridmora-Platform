import { describe, expect, it } from "vitest";
import { buildRelationshipDevelopmentSnapshot } from "@/lib/development-snapshot";
import { developmentStatusFromConfidence } from "@/lib/development-status";
import type { DevelopmentProfileViewModel } from "@/types/development-profile";
import type { CoachingPattern } from "@/lib/patterns/types";

function makeViewModel(
  overrides: Partial<DevelopmentProfileViewModel> = {}
): DevelopmentProfileViewModel {
  return {
    clientName: "Daniel Reed",
    currentDirection:
      "Leading through clearer delegation and manager accountability.",
    emergingStrengths: ["Delegation"],
    themes: [
      {
        id: "t1",
        name: "Delegation",
        confidence: "developing",
        narrative:
          "Daniel is beginning to leave decisions with managers while using clearer outcomes.",
        evidenceCount: 3,
      },
      {
        id: "t2",
        name: "Accountability",
        confidence: "developing",
        narrative: "Managers are taking clearer ownership.",
        evidenceCount: 2,
      },
      {
        id: "t3",
        name: "Leadership confidence",
        confidence: "developing",
        narrative: "Confidence is growing in review conversations.",
        evidenceCount: 2,
      },
      {
        id: "t4",
        name: "Strategic focus",
        confidence: "emerging",
        narrative: "Strategic framing is beginning to appear.",
        evidenceCount: 1,
      },
      {
        id: "t5",
        name: "Should not appear",
        confidence: "emerging",
        narrative: "Extra theme beyond the four-area limit.",
        evidenceCount: 1,
      },
    ],
    milestones: [
      {
        id: "m1",
        date: "2026-08-01",
        title: "Session 1",
        description: "First conversation completed.",
        sourceType: "summary",
      },
      {
        id: "m2",
        date: "2026-08-10",
        title: "Session 2",
        description: "Second conversation completed.",
        sourceType: "summary",
      },
      {
        id: "m3",
        date: "2026-08-18",
        title: "Session 3",
        description: "Third conversation completed.",
        sourceType: "summary",
      },
    ],
    notYetEstablished: [],
    lookingAhead: [
      "Maintain confidence when managers take ownership under pressure.",
    ],
    behaviouralEvidence: ["Clearer outcomes in manager reviews."],
    ...overrides,
  };
}

describe("buildRelationshipDevelopmentSnapshot", () => {
  it("returns insufficient evidence state when empty", () => {
    const snapshot = buildRelationshipDevelopmentSnapshot({
      data: makeViewModel({
        currentDirection: null,
        themes: [],
        milestones: [],
        behaviouralEvidence: [],
        lookingAhead: [],
        emergingStrengths: [],
      }),
      completedSessionCount: 0,
    });

    expect(snapshot.hasEnoughEvidence).toBe(false);
  });

  it("supports one session of approved evidence", () => {
    const snapshot = buildRelationshipDevelopmentSnapshot({
      data: makeViewModel({
        themes: makeViewModel().themes.slice(0, 1),
        milestones: makeViewModel().milestones.slice(0, 1),
      }),
      completedSessionCount: 1,
    });

    expect(snapshot.hasEnoughEvidence).toBe(true);
    expect(snapshot.areas).toHaveLength(1);
    expect(snapshot.evidenceNote).toMatch(/Session/);
  });

  it("supports three sessions and caps areas at four", () => {
    const snapshot = buildRelationshipDevelopmentSnapshot({
      data: makeViewModel(),
      completedSessionCount: 3,
    });

    expect(snapshot.hasEnoughEvidence).toBe(true);
    expect(snapshot.areas).toHaveLength(4);
    expect(snapshot.areas.map(area => area.label)).not.toContain(
      "Should not appear"
    );
    expect(snapshot.currentDirection).toContain("delegation");
    expect(snapshot.currentFocus).toContain("managers take ownership");
  });

  it("uses qualitative statuses only — no percentages", () => {
    const snapshot = buildRelationshipDevelopmentSnapshot({
      data: makeViewModel(),
      completedSessionCount: 3,
    });

    const serialised = JSON.stringify(snapshot);
    expect(serialised).not.toMatch(/%/);
    expect(serialised).not.toMatch(/score/i);
    expect(snapshot.areas[0]?.status).toBe("strengthening");
    expect(snapshot.areas[3]?.status).toBe("emerging");
  });

  it("maps confidence without inventing unsupported progress", () => {
    expect(developmentStatusFromConfidence("emerging", 1)).toBe("emerging");
    expect(developmentStatusFromConfidence("developing", 2)).toBe("developing");
    expect(developmentStatusFromConfidence("developing", 3)).toBe(
      "strengthening"
    );
    expect(developmentStatusFromConfidence("demonstrated", 4)).toBe(
      "established"
    );
  });

  it("only references approved pattern evidence for session range", () => {
    const patterns: CoachingPattern[] = [
      {
        id: "p1",
        relationshipId: "rel-1",
        title: "Delegation",
        description: "Clearer ownership.",
        strength: "emerging",
        status: "active",
        evidenceCount: 2,
        evidence: [
          {
            sourceType: "approved_summary",
            sourceId: "s1",
            sessionId: "session-1",
            sourceDate: "2026-08-01",
          },
          {
            sourceType: "approved_summary",
            sourceId: "s3",
            sessionId: "session-3",
            sourceDate: "2026-08-18",
          },
        ],
        coachReviewed: true,
        coachAccepted: true,
      },
    ];

    const snapshot = buildRelationshipDevelopmentSnapshot({
      data: makeViewModel(),
      patterns,
      sessionNumbers: new Map([
        ["session-1", 1],
        ["session-3", 3],
      ]),
      completedSessionCount: 3,
    });

    expect(snapshot.evidenceNote).toContain("Sessions 1–3");
  });
});
