import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildDevelopmentIntelligenceEvidenceView,
  buildProfileCurrentPosition,
  buildProfileDevelopmentTrajectory,
  composeDevelopmentHeadlineIntelligence,
  evidenceLibraryHasMeaningfulSignals,
  isCompleteStatement,
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
    expect(composed.developmentTrajectory).toMatch(
      /Holding boundaries|Clearer follow-through|emerging|progress|becoming clearer|intention|strengthening/i
    );
    expect(composed.developmentTrajectory).not.toBe(
      "There is not yet enough reviewed evidence to describe a development trajectory."
    );
    // Not a raw concatenation of theme + strength values.
    expect(composed.developmentTrajectory).not.toBe(
      "Holding boundaries · Clearer follow-through"
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

  it("D-api. current-focus-only evidence state is not meaningful evidence-library intelligence", () => {
    const evidenceView = buildDevelopmentIntelligenceEvidenceView({
      records: [],
      currentFocus: "Strengthen Alex's confidence in using their project judgement",
    });
    expect(evidenceView.currentPosition).toMatch(/Strengthen Alex/i);
    expect(evidenceView.developmentTrajectory).toMatch(
      /not yet enough reviewed evidence/i
    );
    expect(evidenceLibraryHasMeaningfulSignals(evidenceView)).toBe(false);

    const composed = composeDevelopmentHeadlineIntelligence({
      evidenceView,
      profile: makeProfile({
        currentFocus:
          "Strengthen Alex's confidence in using their project judgement",
        emergingThemes: [
          { id: "t1", value: "Project judgement under pressure", status: "supported" },
        ],
        growthAreas: [
          { id: "g1", value: "Earlier escalation conversations", status: "emerging" },
        ],
        strengths: [
          { id: "s1", value: "Clearer stakeholder updates", status: "supported" },
        ],
      }),
    });
    expect(composed.headlineSource).toBe("development_profile");
    expect(composed.developmentTrajectory).not.toMatch(
      /not yet enough reviewed evidence/i
    );
    expect(composed.developmentPriorities.length).toBeGreaterThan(0);
    expect(composed.strengthsBeingDemonstrated).toContain(
      "Clearer stakeholder updates"
    );
  });

  it("G-api. profile fallback response carries explicit attribution", () => {
    const composed = composeDevelopmentHeadlineIntelligence({
      evidenceView: emptyEvidenceView(),
      profile: makeProfile({
        strengths: [
          { id: "s1", value: "Naming priorities early", status: "supported" },
        ],
      }),
    });
    expect(composed.headlineSource).toBe("development_profile");
  });

  it("idempotent compose does not relabel API profile-backed headlines", () => {
    const first = composeDevelopmentHeadlineIntelligence({
      evidenceView: emptyEvidenceView(),
      profile: makeProfile({
        emergingThemes: [
          { id: "t1", value: "Delegation under pressure", status: "supported" },
        ],
        strengths: [
          { id: "s1", value: "Naming priorities early", status: "supported" },
        ],
      }),
    });
    expect(first.headlineSource).toBe("development_profile");

    const second = composeDevelopmentHeadlineIntelligence({
      evidenceView: first,
      profile: null,
    });
    expect(second.headlineSource).toBe("development_profile");
    expect(second.developmentTrajectory).toBe(first.developmentTrajectory);
    expect(second.strengthsBeingDemonstrated).toEqual(
      first.strengthsBeingDemonstrated
    );
  });
});

describe("profile-backed headline semantic mapping", () => {
  const focus =
    "Strengthen Alex's confidence in using their project judgement";

  function alexProfile() {
    return makeProfile({
      currentFocus: focus,
      emergingThemes: [
        {
          id: "t1",
          value: "Project judgement under pressure",
          status: "supported",
        },
      ],
      growthAreas: [
        {
          id: "g1",
          value: "Earlier escalation conversations",
          status: "emerging",
        },
        { id: "g2", value: focus, status: "emerging" },
      ],
      strengths: [
        {
          id: "s1",
          value: "Clearer stakeholder updates",
          status: "supported",
        },
        {
          id: "s2",
          value: "Delegating under time pressure",
          status: "emerging",
        },
        {
          id: "s3",
          value: "Holding standards calmly",
          status: "well_established",
        },
      ],
      patterns: [
        {
          id: "p1",
          value: "Over-preparing before senior meetings",
          status: "supported",
        },
      ],
    });
  }

  it("A. currentFocus populated → Current Position does not equal currentFocus", () => {
    const composed = composeDevelopmentHeadlineIntelligence({
      evidenceView: emptyEvidenceView(),
      profile: alexProfile(),
    });
    expect(composed.currentPosition.trim()).not.toBe(focus);
    expect(composed.currentPosition).not.toMatch(
      /Strengthen Alex's confidence/i
    );
  });

  it("B. Next Development Focus = currentFocus when available", () => {
    const composed = composeDevelopmentHeadlineIntelligence({
      evidenceView: emptyEvidenceView(),
      profile: alexProfile(),
    });
    expect(composed.nextDevelopmentFocus).toBe(focus);
  });

  it("C. Current Priorities do not duplicate Next Focus verbatim", () => {
    const composed = composeDevelopmentHeadlineIntelligence({
      evidenceView: emptyEvidenceView(),
      profile: alexProfile(),
    });
    expect(composed.developmentPriorities).toContain(
      "Earlier escalation conversations"
    );
    expect(composed.developmentPriorities).not.toContain(focus);
    expect(
      composed.developmentPriorities.some(p =>
        /Continue exploring:\s*Strengthen Alex/i.test(p)
      )
    ).toBe(false);
  });

  it("D. supported/well-established strengths preferred over emerging", () => {
    const composed = composeDevelopmentHeadlineIntelligence({
      evidenceView: emptyEvidenceView(),
      profile: alexProfile(),
    });
    expect(composed.strengthsBeingDemonstrated).toContain(
      "Clearer stakeholder updates"
    );
    expect(composed.strengthsBeingDemonstrated).toContain(
      "Holding standards calmly"
    );
    expect(composed.strengthsBeingDemonstrated.join(" ")).not.toMatch(
      /Delegating under time pressure/i
    );
  });

  it("E. only-emerging strength state uses cautious wording", () => {
    const composed = composeDevelopmentHeadlineIntelligence({
      evidenceView: emptyEvidenceView(),
      profile: makeProfile({
        strengths: [
          {
            id: "s1",
            value: "Delegating under time pressure",
            status: "emerging",
          },
        ],
      }),
    });
    expect(composed.strengthsBeingDemonstrated).toEqual([
      "Delegating under time pressure — still emerging",
    ]);
  });

  it("F. Trajectory expresses progression, not raw concatenation", () => {
    const composed = composeDevelopmentHeadlineIntelligence({
      evidenceView: emptyEvidenceView(),
      profile: alexProfile(),
    });
    expect(composed.developmentTrajectory).toMatch(
      /established|emerging|movement|practice/i
    );
    expect(composed.developmentTrajectory).not.toBe(
      "Project judgement under pressure · Clearer stakeholder updates · Holding standards calmly"
    );
    const helper = buildProfileDevelopmentTrajectory({
      demonstratedStrengths: ["Clearer stakeholder updates"],
      emergingStrengths: ["Delegating under time pressure"],
      themes: ["Project judgement under pressure"],
      growthAreas: ["Earlier escalation conversations"],
      establishedPatterns: 0,
      emergingPatterns: 0,
    });
    expect(helper).toMatch(/established|emerging/i);
  });

  it("G. profile-backed Current Position describes present state", () => {
    const composed = composeDevelopmentHeadlineIntelligence({
      evidenceView: emptyEvidenceView(),
      profile: alexProfile(),
    });
    expect(composed.currentPosition).toMatch(
      /development theme|coming through as|strength/i
    );
    expect(composed.currentPosition).not.toMatch(
      /Reviewed development currently|centres on|should|continue exploring/i
    );
    expect(composed.currentPosition).not.toBe(composed.nextDevelopmentFocus);
    expect(composed.profileBehaviouralPatterns).toContain(
      "Over-preparing before senior meetings"
    );
    expect(composed.capabilities).toEqual([]);
    const position = buildProfileCurrentPosition({
      demonstratedStrengths: ["Clearer stakeholder updates"],
      themes: ["Project judgement under pressure"],
      behaviouralPatterns: ["Over-preparing before senior meetings"],
      growthAreas: ["Earlier escalation conversations"],
    });
    expect(position).toMatch(/current development theme/i);
    expect(position).not.toMatch(/centres on/i);
  });

  it("H. evidence-library precedence unchanged", () => {
    const evidenceView = buildDevelopmentIntelligenceEvidenceView({
      records: [makeEvidence()],
      currentFocus: "Lead former peers with clear expectations",
    });
    const composed = composeDevelopmentHeadlineIntelligence({
      evidenceView,
      profile: alexProfile(),
    });
    expect(composed.headlineSource).toBe("evidence_library");
    expect(composed.strengthsBeingDemonstrated).toContain(
      "Clearer expectation-setting"
    );
    expect(composed.strengthsBeingDemonstrated).not.toContain(
      "Clearer stakeholder updates"
    );
  });

  it("I. empty-state behaviour unchanged", () => {
    const composed = composeDevelopmentHeadlineIntelligence({
      evidenceView: emptyEvidenceView(),
      profile: makeProfile(),
    });
    expect(composed.headlineSource).toBe("empty");
    expect(composed.developmentTrajectory).toMatch(
      /not yet enough reviewed evidence/i
    );
  });

  it("J. API/client composition remains idempotent", () => {
    const first = composeDevelopmentHeadlineIntelligence({
      evidenceView: emptyEvidenceView(),
      profile: alexProfile(),
    });
    const second = composeDevelopmentHeadlineIntelligence({
      evidenceView: first,
      profile: makeProfile({ currentFocus: "Different focus that must not apply" }),
    });
    expect(second).toEqual(first);
    expect(second.nextDevelopmentFocus).toBe(focus);
  });

  it("K. My Development receives the same corrected semantic mapping", () => {
    const panel = readFileSync(
      resolve(
        process.cwd(),
        "components/development-evidence/development-intelligence-evidence-panel.tsx"
      ),
      "utf8"
    );
    const myDevIntel = readFileSync(
      resolve(process.cwd(), "components/my-development-intelligence-view.tsx"),
      "utf8"
    );
    expect(panel).toContain("composeDevelopmentHeadlineIntelligence");
    expect(myDevIntel).toContain("DevelopmentIntelligenceEvidencePanel");
    // Same compose path → same semantic mapping for coach Development and My Development.
    const composed = composeDevelopmentHeadlineIntelligence({
      evidenceView: emptyEvidenceView(),
      profile: alexProfile(),
    });
    expect(composed.nextDevelopmentFocus).toBe(focus);
    expect(composed.currentPosition).not.toBe(focus);
  });
});

describe("post-apply consistency contracts", () => {
  it("Apply route remains unchanged (no evidence bridge)", () => {
    const apply = readFileSync(
      resolve(process.cwd(), "app/api/development-updates/[updateId]/apply/route.ts"),
      "utf8"
    );
    expect(apply).toContain("applyDevelopmentUpdateRpc");
    expect(apply).not.toContain("development_evidence");
    expect(apply).not.toContain("composeDevelopmentHeadlineIntelligence");
  });

  it("patterns refresh label and behaviour remain pattern-scoped", () => {
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
    expect(panel).toContain("From coaching conversations.");
    expect(panel).not.toContain("not uploaded evidence-library signals");
    expect(panel).toContain("Behavioural Patterns");
    expect(panel).toContain('voice === "self"');
  });

  it("intelligence API composes evidence view with living profile", () => {
    const route = readFileSync(
      resolve(
        process.cwd(),
        "app/api/development-evidence/[clientId]/intelligence/route.ts"
      ),
      "utf8"
    );
    expect(route).toContain("ensureProfileOrEmpty");
    expect(route).toContain("buildDevelopmentIntelligenceEvidenceView");
    expect(route).toContain("composeDevelopmentHeadlineIntelligence");
    expect(route).toMatch(
      /composeDevelopmentHeadlineIntelligence\(\{[\s\S]*evidenceView[\s\S]*profile/
    );
  });
});

describe("profile-backed narrative quality", () => {
  it("never embeds complete sentences mid-template in Current Position", () => {
    const theme =
      "Confidence in judgement remains a central development theme, with evidence of progress through action rather than only reflection.";
    const strength =
      "Alex is beginning to act with greater confidence in their project judgement.";
    const position = buildProfileCurrentPosition({
      demonstratedStrengths: [strength],
      themes: [theme],
      behaviouralPatterns: [],
      growthAreas: [],
    });
    expect(position).toContain(theme);
    expect(position).toContain(strength);
    expect(position).not.toMatch(/centres on Confidence/i);
    expect(position).not.toMatch(/Reviewed development currently/i);
    expect(position).not.toMatch(/\. and /i);
    expect(isCompleteStatement(theme)).toBe(true);
    expect(isCompleteStatement(strength)).toBe(true);
  });

  it("never embeds complete sentences mid-template in Trajectory", () => {
    const strength =
      "Alex is beginning to act with greater confidence in their project judgement.";
    const edge =
      "The next stage of influencing is moving from raising concerns to making clear recommendations.";
    const trajectory = buildProfileDevelopmentTrajectory({
      demonstratedStrengths: [strength],
      emergingStrengths: [],
      themes: [],
      growthAreas: [edge],
      establishedPatterns: 0,
      emergingPatterns: 0,
    });
    expect(trajectory).toContain(strength);
    expect(trajectory).toContain(edge);
    expect(trajectory).not.toMatch(/evidence around Alex/i);
    expect(trajectory).not.toMatch(/Reviewed signals show/i);
    expect(trajectory).not.toMatch(/\. and /i);
  });

  it("phrase-shaped values remain grammatical", () => {
    const position = buildProfileCurrentPosition({
      demonstratedStrengths: ["Clearer stakeholder updates"],
      themes: ["Project judgement under pressure"],
      behaviouralPatterns: [],
      growthAreas: ["Earlier escalation conversations"],
    });
    expect(position).toMatch(
      /Project judgement under pressure is a current development theme/i
    );
    expect(position).toMatch(
      /Clearer stakeholder updates is coming through as a demonstrated strength/i
    );
    expect(isCompleteStatement("Project judgement under pressure")).toBe(false);
  });

  it("trajectory uses established vs emerging movement language for phrases", () => {
    const trajectory = buildProfileDevelopmentTrajectory({
      demonstratedStrengths: [
        "Clearer stakeholder updates",
        "Holding standards calmly",
      ],
      emergingStrengths: ["Delegating under time pressure"],
      themes: ["Project judgement under pressure"],
      growthAreas: ["Earlier escalation conversations"],
      establishedPatterns: 0,
      emergingPatterns: 0,
    });
    expect(trajectory).toMatch(/becoming more established in practice/i);
    expect(trajectory).toMatch(/still emerging/i);
    expect(trajectory).not.toMatch(/Reviewed signals/i);
  });

  it("conditional Behavioural Patterns heading and manager-appropriate provenance", () => {
    const panel = readFileSync(
      resolve(
        process.cwd(),
        "components/development-evidence/development-intelligence-evidence-panel.tsx"
      ),
      "utf8"
    );
    expect(panel).toContain('? "Behavioural Patterns"');
    expect(panel).toContain("From coaching conversations.");
    expect(panel).toContain("From your coaching conversations.");
    expect(panel).not.toContain("evidence-library signals");
    expect(panel).toContain('voice === "self"');
  });

  it("My Development voice remains first-person appropriate in the panel", () => {
    const panel = readFileSync(
      resolve(
        process.cwd(),
        "components/development-evidence/development-intelligence-evidence-panel.tsx"
      ),
      "utf8"
    );
    const myDev = readFileSync(
      resolve(process.cwd(), "components/my-development-intelligence-view.tsx"),
      "utf8"
    );
    expect(myDev).toContain('voice="self"');
    expect(panel).toContain("Where are you now?");
    expect(panel).toContain("From your coaching conversations.");
  });
});
