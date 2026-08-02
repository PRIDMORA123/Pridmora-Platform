import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  canTransitionCoachingMoment,
  coachingMomentEvidenceCanonicalKey,
  coachingMomentStage,
  conciseMomentTitle,
  guidanceFromMoment,
  isSavedCoachingMoment,
  parseQuestions,
  parseCoachingMomentType,
  type CoachingMoment,
} from "@/lib/coaching-moments/coaching-moment";
import {
  parseGuidanceFromModel,
  parseInsightFromModel,
  buildGuidanceFingerprint,
} from "@/lib/coaching-moments/parse";
import { coachingMomentToEvidencePoint } from "@/lib/coaching-moments/repository";
import { collectPatternEvidenceFromRelationship } from "@/lib/patterns/collect";
import { classifyPatternStrength } from "@/lib/patterns/classify";
import { createBlankSession } from "@/lib/sessions";

function baseMoment(overrides: Partial<CoachingMoment> = {}): CoachingMoment {
  return {
    id: "moment-1",
    relationshipId: "rel-1",
    clientId: "rel-1",
    coachId: "coach-1",
    createdBy: "coach-1",
    occurredAt: "2026-07-31T10:00:00.000Z",
    status: "captured",
    situation: "Missed deadline and defensive response",
    desiredOutcome: "Clear ownership",
    inferredType: "accountability",
    generatedIntention: "Address the missed deadline clearly",
    generatedOpening: "Can we look at what affected the deadline?",
    generatedQuestions: ["What prevented completion?", "What will you do differently?"],
    generatedConsideration: "Avoid taking the work back.",
    relevantContext: null,
    privateNote: "She looked exhausted — private",
    outcomeNotes: "Sarah accepted she had not raised the risk early enough.",
    agreedCommitment: "Flag risks 48 hours before deadlines.",
    noCommitmentAgreed: false,
    followUp: "Review at next one-to-one.",
    generatedInsight: null,
    insightStatus: "not_requested",
    guidanceFingerprint: null,
    archivedAt: null,
    createdAt: "2026-07-31T09:00:00.000Z",
    updatedAt: "2026-07-31T10:05:00.000Z",
    ...overrides,
  };
}

describe("Coaching Moment transitions", () => {
  it("allows draft → prepared → in_progress → captured → complete", () => {
    expect(canTransitionCoachingMoment("draft", "prepared")).toBe(true);
    expect(canTransitionCoachingMoment("prepared", "in_progress")).toBe(true);
    expect(canTransitionCoachingMoment("in_progress", "captured")).toBe(true);
    expect(canTransitionCoachingMoment("captured", "complete")).toBe(true);
  });

  it("allows continue without guidance: draft → in_progress", () => {
    expect(canTransitionCoachingMoment("draft", "in_progress")).toBe(true);
  });

  it("allows discard from draft and prepared", () => {
    expect(canTransitionCoachingMoment("draft", "discarded")).toBe(true);
    expect(canTransitionCoachingMoment("prepared", "discarded")).toBe(true);
  });

  it("does not permit complete → in_progress without reopen", () => {
    expect(canTransitionCoachingMoment("complete", "in_progress")).toBe(false);
  });

  it("maps stages correctly", () => {
    expect(coachingMomentStage("draft")).toBe("prepare");
    expect(coachingMomentStage("prepared")).toBe("prepare");
    expect(coachingMomentStage("in_progress")).toBe("conversation");
    expect(coachingMomentStage("captured")).toBe("capture");
    expect(coachingMomentStage("complete")).toBe("complete");
  });
});

describe("Coaching Moment guidance parsing", () => {
  it("limits questions to three", () => {
    const parsed = parseGuidanceFromModel(
      JSON.stringify({
        inferredType: "feedback",
        intention: "Address the issue clearly.",
        opening: "Can we talk about yesterday?",
        questions: ["Q1", "Q2", "Q3", "Q4", "Q5"],
        consideration: "Stay calm.",
        relevantContext: null,
      })
    );
    expect(parsed.guidance.questions).toHaveLength(3);
    expect(parsed.inferredType).toBe("feedback");
  });

  it("falls back to general when type confidence is low/unknown", () => {
    expect(parseCoachingMomentType("mystery")).toBeNull();
    const parsed = parseGuidanceFromModel(
      JSON.stringify({
        inferredType: "unknown_type",
        intention: "Explore what is useful.",
        opening: null,
        questions: ["What matters most?"],
        consideration: null,
        relevantContext: null,
      })
    );
    expect(parsed.inferredType).toBe("general");
  });

  it("parses optional insight JSON", () => {
    const insight = parseInsightFromModel(
      JSON.stringify({
        summary: "A short interaction about deadlines.",
        commitment: "Raise risks earlier.",
        patternConnection: null,
        followUpQuestion: "What will help you notice risk earlier?",
      })
    );
    expect(insight.summary).toContain("deadlines");
    expect(insight.commitment).toContain("risks");
  });

  it("builds stable guidance fingerprints for duplicate prevention", () => {
    const a = buildGuidanceFingerprint(["same", "outcome"]);
    const b = buildGuidanceFingerprint(["same", "outcome"]);
    expect(a).toBe(b);
  });
});

describe("Coaching Moment private notes and evidence", () => {
  it("excludes private notes from evidence points", () => {
    const point = coachingMomentToEvidencePoint(baseMoment());
    expect(point).not.toBeNull();
    expect(point!.content).not.toContain("private");
    expect(point!.content).not.toContain("exhausted");
    expect(point!.content).toContain("raised the risk");
  });

  it("counts raw moment and accepted insight as one evidence point", () => {
    const moment = baseMoment({
      insightStatus: "accepted",
      generatedInsight: {
        summary: "Accepted insight wording.",
        commitment: "Flag risks 48 hours before deadlines.",
        patternConnection: null,
        followUpQuestion: null,
      },
    });
    const point = coachingMomentToEvidencePoint(moment)!;
    expect(point.canonicalKey).toBe(coachingMomentEvidenceCanonicalKey(moment.id));

    const collected = collectPatternEvidenceFromRelationship({
      relationshipId: "rel-1",
      sessions: [],
      coachingMoments: [moment],
    });
    const momentPoints = collected.filter(item => item.sourceType === "coaching_moment");
    expect(momentPoints).toHaveLength(1);
    expect(momentPoints[0].canonicalKey).toBe(
      coachingMomentEvidenceCanonicalKey(moment.id)
    );
  });

  it("does not create an established pattern from one coaching moment", () => {
    const moment = baseMoment();
    const points = collectPatternEvidenceFromRelationship({
      relationshipId: "rel-1",
      sessions: [],
      coachingMoments: [moment],
    });
    expect(points).toHaveLength(1);
    expect(classifyPatternStrength(points)).toBe("observation");
  });

  it("does not treat coaching moments as formal sessions", () => {
    const moment = baseMoment();
    expect(isSavedCoachingMoment(moment.status)).toBe(true);
    // Formal sessions live in sessions[] — moments never appear there.
    const session = createBlankSession({
      id: "session-1",
      clientId: "rel-1",
      coachId: "coach-1",
      sessionNumber: 1,
    });
    expect(session.id).not.toBe(moment.id);
    expect(session.sessionNumber).toBe(1);
  });

  it("ignores moments from another relationship", () => {
    const foreign = baseMoment({ clientId: "other", relationshipId: "other" });
    const points = collectPatternEvidenceFromRelationship({
      relationshipId: "rel-1",
      sessions: [],
      coachingMoments: [foreign],
    });
    expect(points).toHaveLength(0);
  });

  it("ignores draft moments and private-only content", () => {
    const draft = baseMoment({ status: "draft", outcomeNotes: null });
    expect(coachingMomentToEvidencePoint(draft)).toBeNull();

    const points = collectPatternEvidenceFromRelationship({
      relationshipId: "rel-1",
      sessions: [],
      coachingMoments: [draft],
    });
    expect(points).toHaveLength(0);
  });

  it("supports no commitment agreed and optional follow-up", () => {
    const moment = baseMoment({
      noCommitmentAgreed: true,
      agreedCommitment: null,
      followUp: "Check in next week.",
    });
    const point = coachingMomentToEvidencePoint(moment)!;
    expect(point.content).toContain("Check in next week");
    expect(point.content).not.toContain("Flag risks");
  });
});

describe("Coaching Moment product contracts", () => {
  it("is not a seventh journey stage", () => {
    const journey = readFileSync(
      join(process.cwd(), "lib/coaching-journey/coaching-journey.ts"),
      "utf8"
    );
    expect(journey).not.toMatch(/coaching_moment/);
    expect(journey).toMatch(/current_position/);
    expect(journey).toMatch(/prepare/);
    expect(journey).toMatch(/session_notes/);
    expect(journey).toMatch(/summary_insights/);
    expect(journey).toMatch(/development/);
    expect(journey).toMatch(/reports/);
  });

  it("exposes New Coaching Moment from the relationship Coaching Moments section", () => {
    const canvas = readFileSync(
      join(
        process.cwd(),
        "components/relationship-workspace/relationship-canvas.tsx"
      ),
      "utf8"
    );
    const section = readFileSync(
      join(
        process.cwd(),
        "components/relationship-workspace/coaching-moments-section.tsx"
      ),
      "utf8"
    );
    const coachSpace = readFileSync(
      join(process.cwd(), "components/coach-space-view.tsx"),
      "utf8"
    );
    const css = readFileSync(
      join(process.cwd(), "app/identity-design-system.css"),
      "utf8"
    );
    expect(canvas).toContain("CoachingMomentsSection");
    expect(section).toContain("New Coaching Moment");
    expect(section).toContain("coaching-moments-title");
    const menuBlock = coachSpace.match(
      /<ClientActionsMenu[\s\S]*?\/>/
    )?.[0];
    expect(menuBlock).toBeTruthy();
    expect(menuBlock).not.toContain("onNewCoachingMoment");
    expect(css).toContain("@media (max-width: 680px)");
    expect(css).toContain(".coaching-moment-workspace");
    expect(css).toContain(".coaching-moment-checkbox");
    expect(css).toContain("width: fit-content");
  });
});
