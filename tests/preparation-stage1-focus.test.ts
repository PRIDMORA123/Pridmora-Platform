import { describe, expect, it } from "vitest";
import { createBlankSession } from "@/lib/sessions";
import { buildPreparationAdapterContext } from "@/lib/preparation/preparation-intelligence-adapter";
import { resolvePreparationIntelligence } from "@/lib/preparation-intelligence";
import { normalisePreparationBrief } from "@/lib/prepare/normalise-preparation-brief";
import {
  deriveLongitudinalPreparationSections,
  looksLikeCommitmentRevisitTitle,
} from "@/lib/prepare/derive-longitudinal-brief-sections";
import { looksLikeFirstSessionBoilerplate } from "@/components/prepare/preparation-view";
import { getSessionDisplayTitle } from "@/lib/session/session-display";
import { selectCommitmentsForPrepare } from "@/lib/preparation/commitment-selection";
import type { DevelopmentProfile } from "@/lib/development-updates/types";
import type { PreparationAiBrief } from "@/lib/preparation-brief";
import type { Client } from "@/lib/types";

function makeSession(
  overrides: Partial<ReturnType<typeof createBlankSession>> & {
    sessionNumber?: number;
  } = {}
) {
  return {
    ...createBlankSession({
      id: overrides.id ?? `session-${overrides.sessionNumber ?? 1}`,
      clientId: "client-alex",
      coachId: "coach-1",
      sessionNumber: overrides.sessionNumber ?? 1,
      status: overrides.status ?? "planned",
    }),
    ...overrides,
  };
}

function makeProfile(): DevelopmentProfile {
  return {
    id: "profile-1",
    clientId: "client-alex",
    coachId: "coach-1",
    currentFocus:
      "Strengthen Alex’s confidence in using their project judgement by speaking up early and stating a clear recommendation, particularly when more senior colleagues are present.",
    strengths: [
      {
        id: "s1",
        value: "Alex is beginning to act on sound project judgement.",
        reason: "Supported by one example.",
        status: "supported",
      },
    ],
    emergingThemes: [
      {
        id: "t1",
        value: "Confidence in judgement remains a central development theme.",
        reason: "Progress through action.",
        status: "supported",
      },
      {
        id: "t2",
        value:
          "The next stage of influencing is moving from identifying a problem to offering a clear recommendation.",
        reason: "Not yet evidenced in practice.",
        status: "emerging",
      },
    ],
    growthAreas: [
      {
        id: "g1",
        value:
          "Alex needs to practise stating recommendations clearly, rather than only raising delivery concerns.",
        reason: "Agreed next step.",
        status: "emerging",
      },
    ],
    patterns: [
      {
        id: "p1",
        value:
          "When senior colleagues are involved, Alex may hesitate before speaking up.",
        reason: "Self-report and prior theme.",
        status: "supported",
      },
    ],
    values: [],
    motivators: [],
    beliefs: [],
    commitments: [],
    coachingPreferences: [],
    coachingPatterns: [],
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-15T10:20:00.000Z",
  } as unknown as DevelopmentProfile;
}

function makeBrief(): PreparationAiBrief {
  return {
    themes: [
      {
        title:
          "Help Alex consolidate early progress by practising how to move from concern identification to a clear recommendation.",
        basis: "Suggested from reviewed evidence",
      },
      {
        title: "What Alex has tried since the last reviewed commitment.",
        basis: "Suggested topic to explore",
      },
      {
        title: "Whether Alex practised stating a recommendation clearly.",
        basis: "Suggested topic to explore",
      },
    ],
    exploration:
      "The reviewed coaching journey indicates that Alex has been working on using project judgement earlier. Confidence is emerging while hesitation with senior colleagues remains.",
    questions: [
      "Where have you had an opportunity to make a recommendation?",
      "What did you say in the moment?",
    ],
    reflectionPrompt:
      "Alex leaves with one upcoming project situation identified and a clear recommendation phrase prepared.",
    patterns: [
      {
        title: "Keep interpretations cautious",
        basis: "Evidence suggests emerging confidence, not yet consistency.",
      },
    ],
    developmentDirection: "Issue–Recommendation–Ownership rehearsal",
    historicalContext: [],
    additionalQuestions: [],
    removedSections: [],
  };
}

describe("Stage 1 preparation focus hierarchy", () => {
  it("continuing + open commitment + richer profile does not use Revisit the open commitment as primary focus", () => {
    const session1 = makeSession({
      id: "s1",
      sessionNumber: 1,
      status: "completed",
      summaryStatus: "approved",
      aiSummaryApproved: true,
      summary: "Confidence in judgement.",
      commitments:
        "Alex agreed to practise stating their recommendation clearly.",
    });
    const session2 = makeSession({
      id: "s2",
      sessionNumber: 2,
      status: "completed",
      summaryStatus: "approved",
      aiSummaryApproved: true,
    });
    const session4 = makeSession({
      id: "s4",
      sessionNumber: 4,
      status: "planned",
    });

    const adapter = buildPreparationAdapterContext({
      client: {
        name: "Alex Morgan",
        role: "Project Coordinator",
        currentFocus: "",
        actions: [
          {
            id: "a1",
            title:
              "Alex agreed to practise stating their recommendation clearly, rather than only raising the problem.",
            status: "Open",
            sessionId: "s2",
          },
        ],
        sessions: [session1, session2, session4],
      },
      currentSession: session4,
      profile: makeProfile(),
    });

    expect(adapter.previousCommitment).toMatch(/recommendation/i);
    expect(adapter.primaryFocusSuggestion).not.toMatch(
      /^Revisit the open commitment/i
    );
    expect(adapter.primaryFocusSuggestion).toMatch(
      /judgement|recommendation|senior|confidence/i
    );
    expect(adapter.areasToExplore.join(" ")).not.toMatch(
      /^Progress on:/i
    );
  });

  it("AI brief focus wins over adapter when coach fields are empty", () => {
    const brief = makeBrief();
    const session4 = makeSession({
      id: "s4",
      sessionNumber: 4,
      status: "prepared",
      prepAiBrief: brief,
    });
    const client = {
      id: "client-alex",
      name: "Alex Morgan",
      initials: "AM",
      organisation: "Org",
      role: "Project Coordinator",
      email: "",
      status: "Active" as const,
      createdAt: "2026-08-01T00:00:00.000Z",
      nextSession: "",
      currentFocus: "",
      identitySummary: "",
      coachInsight: "",
      preparationStyleOverride: null,
      strengths: [],
      values: [],
      themes: [],
      goals: [],
      actions: [
        {
          id: "a1",
          title: "State a clear recommendation",
          status: "Open" as const,
          sessionId: "s2",
        },
      ],
      quotes: [],
      sessions: [
        makeSession({
          id: "s2",
          sessionNumber: 2,
          status: "completed",
          summaryStatus: "approved",
          aiSummaryApproved: true,
          summary: "Moved toward recommendation.",
          focus: "Recommendation clarity",
        }),
        session4,
      ],
      journey: [],
    } satisfies Client;

    const intelligence = resolvePreparationIntelligence({
      client,
      conversation: session4,
      profile: makeProfile(),
      updates: [],
      brief,
    });

    expect(intelligence.suggestedFocus).toMatch(/consolidate early progress|recommendation/i);
    expect(intelligence.suggestedFocus).not.toMatch(
      /^Revisit the open commitment/i
    );
  });

  it("explicit coach-entered preparation still wins", () => {
    const coachFocus =
      "Help Alex rehearse one specific recommendation for Thursday’s steering meeting.";
    const brief = normalisePreparationBrief({
      primaryFocus: coachFocus,
      areasToExplore: ["Steering meeting"],
      questions: ["What will you say first?"],
      mode: "comprehensive",
      isFirstSession: false,
      clientFirstName: "Alex",
    });
    expect(brief.primaryFocus).toMatch(/Thursday/i);
  });

  it("Prepare header is not automatically Revisit the open commitment", () => {
    expect(
      looksLikeCommitmentRevisitTitle(
        "Revisit the open commitment: State a clear recommendation."
      )
    ).toBe(true);

    const title = getSessionDisplayTitle({
      title: "",
      focus:
        "Strengthen Alex’s confidence in using their project judgement in meetings.",
      purpose: "",
      sessionNumber: 4,
    });
    expect(title).not.toMatch(/^Revisit the open commitment/i);
    expect(title).toMatch(/judgement|confidence/i);
  });

  it("Previous commitment remains available separately from primary focus", () => {
    const adapter = buildPreparationAdapterContext({
      client: {
        name: "Alex Morgan",
        role: "Project Coordinator",
        currentFocus: "",
        actions: [
          {
            id: "a1",
            title: "State a clear recommendation in the next project discussion",
            status: "Open",
            sessionId: "s2",
          },
        ],
        sessions: [
          makeSession({
            id: "s2",
            sessionNumber: 2,
            status: "completed",
            summaryStatus: "approved",
          }),
          makeSession({ id: "s4", sessionNumber: 4, status: "planned" }),
        ],
      },
      currentSession: makeSession({
        id: "s4",
        sessionNumber: 4,
        status: "planned",
      }),
      profile: makeProfile(),
    });
    expect(adapter.previousCommitment).toMatch(/recommendation/i);
    expect(adapter.primaryFocusSuggestion).not.toBe(
      `Revisit the open commitment: ${adapter.previousCommitment}`
    );
  });

  it("Session 1 / low-history behaviour remains appropriate", () => {
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
    expect(
      looksLikeFirstSessionBoilerplate(adapter.primaryFocusSuggestion)
    ).toBe(true);
  });

  it("commitment deduplication/prioritisation remains intact", () => {
    const commitments = selectCommitmentsForPrepare({
      actions: [
        {
          id: "old",
          title: "Raise concerns earlier",
          status: "Open",
          sessionId: "s1",
        },
        {
          id: "new",
          title:
            "Alex agreed to practise stating their recommendation clearly, rather than only raising the problem, in the next relevant project discussion.",
          status: "Open",
          sessionId: "s2",
        },
        {
          id: "dup",
          title: "State recommendation clearly",
          status: "Open",
          sessionId: "s2",
        },
      ],
      sessions: [
        makeSession({ id: "s1", sessionNumber: 1, status: "completed" }),
        makeSession({ id: "s2", sessionNumber: 2, status: "completed" }),
        makeSession({ id: "s4", sessionNumber: 4, status: "planned" }),
      ],
      currentSessionId: "s4",
      beforeSessionNumber: 4,
      allowUndatedOpenActions: true,
    });
    expect(commitments.length).toBeGreaterThan(0);
    expect(commitments[0]).toMatch(/recommendation/i);
  });

  it("derives longitudinal sections from existing brief without fabricating when empty", () => {
    const empty = deriveLongitudinalPreparationSections({
      isFirstSession: false,
      primaryFocus: "Focus",
    });
    expect(empty.developmentSinceLast).toBeNull();
    expect(empty.evidenceWorthExploring).toEqual([]);

    const rich = deriveLongitudinalPreparationSections({
      isFirstSession: false,
      primaryFocus: makeBrief().themes[0].title,
      exploration: makeBrief().exploration,
      reflectionPrompt: makeBrief().reflectionPrompt,
      themes: makeBrief().themes,
      patterns: makeBrief().patterns.map(p => ({
        title: p.title,
        basis: p.basis,
      })),
    });
    expect(rich.developmentSinceLast).toMatch(/judgement|confidence|hesitation/i);
    expect(rich.whatProgressCouldLookLike).toMatch(/recommendation|situation/i);
    expect(rich.evidenceWorthExploring.length).toBeGreaterThan(0);
    expect(rich.evidenceWorthExploring.join(" ")).not.toMatch(
      /consolidate early progress/i
    );
  });

  it("first-session longitudinal sections stay empty", () => {
    const sections = deriveLongitudinalPreparationSections({
      isFirstSession: true,
      exploration: "Should not appear",
      reflectionPrompt: "Should not appear",
    });
    expect(sections.developmentSinceLast).toBeNull();
    expect(sections.whatProgressCouldLookLike).toBeNull();
  });
});
