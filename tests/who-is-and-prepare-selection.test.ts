import { describe, expect, it } from "vitest";
import { buildPersonSummary } from "@/lib/development-evidence/display-copy";
import { buildProfileCurrentPosition } from "@/lib/development-evidence/compose-headline-intelligence";
import { getSessionForPrepare } from "@/lib/session-workflow";
import { createBlankSession } from "@/lib/sessions";
import { looksLikeFirstSessionBoilerplate } from "@/components/prepare/preparation-view";
import { normalisePreparationBrief } from "@/lib/prepare/normalise-preparation-brief";
import {
  buildPreparationAdapterContext,
  selectCommitmentsForPrepare,
} from "@/lib/preparation/preparation-intelligence-adapter";
import { selectPatternsForPrepare } from "@/lib/patterns/prioritise";
import type { CoachingPattern } from "@/lib/patterns/types";

function makeSession(
  overrides: Partial<ReturnType<typeof createBlankSession>> & {
    sessionNumber?: number;
    status?: ReturnType<typeof createBlankSession>["status"];
    summaryStatus?: string;
    aiSummaryApproved?: boolean;
  } = {}
) {
  return {
    ...createBlankSession({
      id: overrides.id ?? `session-${overrides.sessionNumber ?? 1}`,
      clientId: "client-1",
      coachId: "coach-1",
      sessionNumber: overrides.sessionNumber ?? 1,
      status: overrides.status ?? "planned",
    }),
    ...overrides,
  };
}

describe("Who is Alex? present-state preference", () => {
  it("does not use currentFocus when present-state intelligence exists", () => {
    const presentState = buildProfileCurrentPosition({
      demonstratedStrengths: [],
      themes: [
        "Confidence in judgement remains a central development theme, with evidence of progress through action rather than only reflection.",
      ],
      behaviouralPatterns: [
        "Alex is beginning to act on sound project judgement by raising delivery concerns early and clarifying responsibility.",
      ],
      growthAreas: [],
    });
    const focus =
      "Strengthen Alex’s confidence in using their project judgement in meetings by speaking up early, clarifying ownership and stating a clear recommendation, particularly when more senior colleagues are present.";

    const summary = buildPersonSummary({
      name: "Alex Morgan",
      presentDevelopmentalState: presentState,
      currentPosition: focus,
      direction: focus,
      priorities: [focus],
      completedConversationCount: 2,
    });

    expect(summary).toMatch(/Confidence in judgement remains/i);
    expect(summary).toMatch(/beginning to act on sound project judgement/i);
    expect(summary).not.toMatch(/Strengthen Alex/i);
    expect(summary).not.toMatch(/stating a clear recommendation/i);
  });
});

describe("Prepare session selection for established relationships", () => {
  it("does not select stale Session 1 over the correct next open session", () => {
    const session1 = makeSession({
      id: "session-1",
      sessionNumber: 1,
      status: "prepared",
      summaryStatus: "approved",
      aiSummaryApproved: true,
    });
    const session2 = makeSession({
      id: "session-2",
      sessionNumber: 2,
      status: "completed",
      summaryStatus: "approved",
      aiSummaryApproved: true,
    });
    const session3 = makeSession({
      id: "session-3",
      sessionNumber: 3,
      status: "planned",
    });
    expect(getSessionForPrepare([session1, session2, session3])?.id).toBe(
      "session-3"
    );
  });

  it("returns undefined so a next session can be created when only stale Session 1 remains open", () => {
    const session1 = makeSession({
      id: "session-1",
      sessionNumber: 1,
      status: "prepared",
    });
    const session2 = makeSession({
      id: "session-2",
      sessionNumber: 2,
      status: "completed",
      summaryStatus: "approved",
      aiSummaryApproved: true,
    });
    expect(getSessionForPrepare([session1, session2])).toBeUndefined();
  });
});

describe("stale first-session boilerplate vs continuing preparation", () => {
  it("detects first-session boilerplate", () => {
    expect(
      looksLikeFirstSessionBoilerplate(
        "Support Alex to define a clear coaching purpose, identify current priorities, and agree how progress will be recognised."
      )
    ).toBe(true);
    expect(
      looksLikeFirstSessionBoilerplate(
        "Revisit the open commitment: State a clear recommendation."
      )
    ).toBe(false);
  });

  it("stale boilerplate does not override bounded continuing preparation", () => {
    const adapterFocus =
      "Revisit the open commitment: State a clear recommendation in the next project discussion.";
    const brief = normalisePreparationBrief({
      primaryFocus: adapterFocus,
      areasToExplore: ["Progress on the open commitment", "Earlier escalation"],
      questions: [
        "What progress has been possible on the open commitment since it was agreed?",
      ],
      mode: "assisted",
      isFirstSession: false,
      clientFirstName: "Alex",
    });
    expect(brief.primaryFocus).toMatch(/open commitment|recommendation/i);
    expect(brief.primaryFocus).not.toMatch(/define a clear coaching purpose/i);
    expect(
      looksLikeFirstSessionBoilerplate(
        "Support Alex to define a clear coaching purpose, identify current priorities, and agree how progress will be recognised."
      )
    ).toBe(true);
  });

  it("genuine Session 1 contracting still works", () => {
    const planned = makeSession({
      id: "s1",
      sessionNumber: 1,
      status: "planned",
    });
    const adapter = buildPreparationAdapterContext({
      client: {
        name: "Alex Morgan",
        role: "Project Coordinator",
        currentFocus: "",
        actions: [],
        sessions: [planned],
      },
      currentSession: planned,
      profile: null,
    });
    expect(adapter.isFirstSession).toBe(true);
    expect(adapter.primaryFocusSuggestion).toMatch(/coaching purpose/i);
    expect(getSessionForPrepare([planned])?.id).toBe("s1");
  });
});

describe("historical Session 1 temporal integrity remains", () => {
  it("cannot see Session 2+ commitments or patterns", () => {
    const session1 = makeSession({
      id: "s1",
      sessionNumber: 1,
      status: "completed",
      summaryStatus: "approved",
      aiSummaryApproved: true,
    });
    const session2 = makeSession({
      id: "s2",
      sessionNumber: 2,
      status: "completed",
      summaryStatus: "approved",
      aiSummaryApproved: true,
    });
    const commitments = selectCommitmentsForPrepare({
      actions: [
        {
          id: "a2",
          title: "State a clear recommendation in the next project discussion",
          status: "Open",
          sessionId: "s2",
        },
      ],
      sessions: [session1, session2],
      currentSessionId: "s1",
      beforeSessionNumber: 1,
      allowUndatedOpenActions: false,
    });
    expect(commitments).toEqual([]);

    const pattern = {
      id: "p1",
      clientId: "client-1",
      title: "Later pattern",
      description: "From session 2",
      strength: "emerging",
      status: "active",
      evidenceCount: 1,
      evidence: [
        {
          sourceType: "approved_summary",
          sourceId: "ev-2",
          sessionId: "s2",
          excerpt: "Later",
        },
      ],
      firstObservedAt: "2026-08-01T00:00:00.000Z",
      lastObservedAt: "2026-08-08T00:00:00.000Z",
      coachReviewed: true,
      coachAccepted: true,
      suppressed: false,
      createdAt: "2026-08-08T00:00:00.000Z",
      updatedAt: "2026-08-08T00:00:00.000Z",
    } as unknown as CoachingPattern;

    expect(
      selectPatternsForPrepare([pattern], {
        beforeSessionNumber: 1,
        sessionNumbers: new Map([
          ["s1", 1],
          ["s2", 2],
        ]),
      })
    ).toEqual([]);
  });
});
