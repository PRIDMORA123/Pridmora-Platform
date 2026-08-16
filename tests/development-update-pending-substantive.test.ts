import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  deriveJourneyStage,
  pendingDevelopmentUpdate,
} from "@/lib/client-journey";
import {
  isSubstantivePendingDevelopmentUpdate,
  type DevelopmentUpdate,
} from "@/lib/development-updates/types";
import type { Client, Session } from "@/lib/types";

function update(
  partial: Partial<DevelopmentUpdate> &
    Pick<DevelopmentUpdate, "id" | "sessionId" | "status" | "hasMeaningfulChanges">
): DevelopmentUpdate {
  return {
    clientId: "client-1",
    coachId: "coach-1",
    conversationSummary: "",
    proposedChanges: {},
    editedChanges: null,
    appliedChanges: null,
    evidenceSummary: [],
    coachNote: "",
    generatedAt: null,
    reviewedAt: null,
    appliedAt: null,
    discardedAt: null,
    createdAt: "2026-08-01T12:00:00.000Z",
    updatedAt: "2026-08-01T12:00:00.000Z",
    ...partial,
  };
}

function session(
  partial: Partial<Session> & Pick<Session, "id" | "sessionNumber">
): Session {
  return {
    clientId: "client-1",
    coachId: "coach-1",
    title: "",
    date: "2026-08-01",
    time: "10:00",
    durationMinutes: 60,
    location: "",
    focus: "Focus",
    preparation: "",
    prepPurpose: "",
    prepTopics: "",
    prepQuestions: "",
    prepCommitmentsReview: "",
    prepRisks: "",
    prepPrivateNotes: "",
    prepAiBrief: null,
    prepAiBriefGeneratedAt: "",
    prepAiBriefStyle: "",
    prepAiBriefConfirmedAt: "",
    prepAiBriefSourceFingerprint: "",
    intelligenceMode: "",
    intelligenceStatus: "idle",
    intelligenceSources: [],
    intelligenceLastRefreshedAt: "",
    intelligenceErrorCode: "",
    notes: "Notes",
    commitments: "",
    parkingLot: "",
    notesSavedAt: "",
    timerElapsedSeconds: 0,
    timerStartedAt: null,
    sessionStartedAt: null,
    reflection: "",
    reflectWhatShifted: "",
    reflectWhatSurprised: "",
    reflectWhatWorked: "",
    reflectDifferently: "",
    reflectProfessionalLearning: "",
    reflectPrivate: "",
    summary: "Summary",
    emergingThemes: "",
    strengthsObserved: "",
    valuesBecomingVisible: "",
    professionalIdentityDevelopment: "",
    agreedActions: "",
    outcomes: "",
    suggestedFocus: "",
    coachReflection: "",
    summaryStatus: "approved",
    aiSummaryApproved: true,
    coachingQuestions: [],
    completedAt: "2026-08-01T10:00:00.000Z",
    lastUpdated: "",
    status: "completed",
    ...partial,
  };
}

function client(sessions: Session[]): Client {
  return {
    id: "client-1",
    name: "Alex",
    organisation: "Org",
    role: "Manager",
    email: "",
    currentFocus: "Build confidence",
    status: "Active",
    sessions,
    createdAt: "2026-07-01T10:00:00.000Z",
  } as Client;
}

describe("isSubstantivePendingDevelopmentUpdate", () => {
  it("A: applied latest + older zero-change ready_for_review is not substantive pending", () => {
    const updates = [
      update({
        id: "u-s4",
        sessionId: "s4",
        status: "applied",
        hasMeaningfulChanges: true,
      }),
      update({
        id: "u-old",
        sessionId: "s1",
        status: "ready_for_review",
        hasMeaningfulChanges: false,
      }),
    ];
    expect(pendingDevelopmentUpdate(updates)).toBeUndefined();
    expect(updates.filter(isSubstantivePendingDevelopmentUpdate)).toEqual([]);
  });

  it("B: ready_for_review + hasMeaningfulChanges true is substantive pending", () => {
    const pending = update({
      id: "u1",
      sessionId: "s1",
      status: "ready_for_review",
      hasMeaningfulChanges: true,
    });
    expect(isSubstantivePendingDevelopmentUpdate(pending)).toBe(true);
    expect(pendingDevelopmentUpdate([pending])?.id).toBe("u1");
  });

  it("C: applied + hasMeaningfulChanges true is not pending", () => {
    const applied = update({
      id: "u1",
      sessionId: "s1",
      status: "applied",
      hasMeaningfulChanges: true,
    });
    expect(isSubstantivePendingDevelopmentUpdate(applied)).toBe(false);
    expect(pendingDevelopmentUpdate([applied])).toBeUndefined();
  });

  it("D: discarded + hasMeaningfulChanges true is not pending", () => {
    const discarded = update({
      id: "u1",
      sessionId: "s1",
      status: "discarded",
      hasMeaningfulChanges: true,
    });
    expect(isSubstantivePendingDevelopmentUpdate(discarded)).toBe(false);
    expect(pendingDevelopmentUpdate([discarded])).toBeUndefined();
  });
});

describe("journey stage with zero-change ready_for_review", () => {
  it("does not enter development_update_awaiting_review for zero-change ready_for_review", () => {
    const stage = deriveJourneyStage(
      client([
        session({
          id: "s1",
          sessionNumber: 1,
          status: "completed",
          summaryStatus: "approved",
          aiSummaryApproved: true,
        }),
      ]),
      [
        update({
          id: "u1",
          sessionId: "s1",
          status: "ready_for_review",
          hasMeaningfulChanges: false,
        }),
      ]
    );
    expect(stage.id).toBe("reflecting_between_sessions");
  });

  it("still enters development_update_awaiting_review for meaningful ready_for_review", () => {
    const stage = deriveJourneyStage(
      client([
        session({
          id: "s1",
          sessionNumber: 1,
          status: "completed",
          summaryStatus: "approved",
          aiSummaryApproved: true,
        }),
      ]),
      [
        update({
          id: "u1",
          sessionId: "s1",
          status: "ready_for_review",
          hasMeaningfulChanges: true,
        }),
      ]
    );
    expect(stage.id).toBe("development_update_awaiting_review");
  });

  it("Alex-shaped: Session 4 applied + older zero-change does not await review", () => {
    const stage = deriveJourneyStage(
      client([
        session({ id: "s1", sessionNumber: 1 }),
        session({ id: "s4", sessionNumber: 4 }),
      ]),
      [
        update({
          id: "u-s4",
          sessionId: "s4",
          status: "applied",
          hasMeaningfulChanges: true,
        }),
        update({
          id: "u-old",
          sessionId: "s1",
          status: "ready_for_review",
          hasMeaningfulChanges: false,
        }),
      ]
    );
    expect(stage.id).toBe("reflecting_between_sessions");
    expect(pendingDevelopmentUpdate([
      update({
        id: "u-s4",
        sessionId: "s4",
        status: "applied",
        hasMeaningfulChanges: true,
      }),
      update({
        id: "u-old",
        sessionId: "s1",
        status: "ready_for_review",
        hasMeaningfulChanges: false,
      }),
    ])).toBeUndefined();
  });
});

describe("pending detection wiring", () => {
  it("development profile route uses substantive pending predicate", () => {
    const route = readFileSync(
      resolve(process.cwd(), "app/api/development-profiles/[clientId]/route.ts"),
      "utf8"
    );
    expect(route).toContain("isSubstantivePendingDevelopmentUpdate");
    expect(route).not.toMatch(
      /updates\.find\(\s*update\s*=>\s*update\.status\s*===\s*["']ready_for_review["']\s*\)/
    );
  });

  it("listReadyDevelopmentUpdates requires has_meaningful_changes", () => {
    const repo = readFileSync(
      resolve(process.cwd(), "lib/development-updates/repository.ts"),
      "utf8"
    );
    expect(repo).toMatch(
      /\.eq\(\s*["']status["']\s*,\s*["']ready_for_review["']\s*\)[\s\S]*?\.eq\(\s*["']has_meaningful_changes["']\s*,\s*true\s*\)/
    );
  });
});
