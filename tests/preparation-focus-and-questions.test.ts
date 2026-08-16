import { describe, expect, it } from "vitest";
import { looksLikeFirstSessionBoilerplate } from "@/components/prepare/preparation-view";
import { normalisePreparationBrief } from "@/lib/prepare/normalise-preparation-brief";
import {
  isRetiredGenericPreparationFallbackQuestion,
  resolveConversationFocus,
  resolveDevelopmentFocus,
  RETIRED_GENERIC_PREPARATION_FALLBACK_QUESTIONS,
} from "@/lib/prepare/resolve-preparation-focus";
import { buildPreparationAdapterContext } from "@/lib/preparation/preparation-intelligence-adapter";
import { PREPARATION_INTELLIGENCE_PROMPT } from "@/lib/coaching-intelligence/rules";
import { PREPARATION_BRIEF_SYSTEM_PROMPT } from "@/lib/ai/preparation-brief-prompt";
import { createBlankSession } from "@/lib/sessions";
import type { DevelopmentProfile } from "@/lib/development-updates/types";

const LONGITUDINAL =
  "Build consistency in using project judgement in meetings by speaking up early, clarifying ownership and stating a clear recommendation.";

describe("Preparation focus hierarchy", () => {
  it("1. Development focus prefers profile.current_focus then client.current_focus", () => {
    expect(
      resolveDevelopmentFocus({
        profileCurrentFocus: LONGITUDINAL,
        clientCurrentFocus: "Client fallback focus",
      })
    ).toBe(LONGITUDINAL);
    expect(
      resolveDevelopmentFocus({
        profileCurrentFocus: "",
        clientCurrentFocus: "Client fallback focus",
      })
    ).toBe("Client fallback focus");
  });

  it("2–3. Conversation focus uses prep_purpose/session.focus and cannot overwrite Development focus", () => {
    const conversation = resolveConversationFocus({
      prepPurpose: "",
      sessionFocus: "test 5",
      aiSuggestion: "Explore recent recommendation practice",
      isFirstSession: false,
      isBoilerplate: looksLikeFirstSessionBoilerplate,
    });
    expect(conversation).toBe("test 5");

    const brief = normalisePreparationBrief({
      developmentFocus: LONGITUDINAL,
      conversationFocus: "test 5",
      areasToExplore: [],
      questions: ["What enabled the progress visible since the last conversation?"],
      mode: "assisted",
      clientFirstName: "Alex",
    });

    expect(brief.developmentFocus).toContain("project judgement");
    expect(brief.conversationFocus).toBe("test 5");
    expect(brief.developmentFocus).not.toBe(brief.conversationFocus);
  });

  it("4–5. Both display fields remain distinct; missing conversation focus stays empty", () => {
    const withBoth = normalisePreparationBrief({
      developmentFocus: LONGITUDINAL,
      conversationFocus: "Practise stating a recommendation this week",
      mode: "assisted",
      clientFirstName: "Alex",
      questions: ["What changed since the last conversation?"],
    });
    expect(withBoth.developmentFocus).toBeTruthy();
    expect(withBoth.conversationFocus).toBeTruthy();

    const withoutConversation = normalisePreparationBrief({
      developmentFocus: LONGITUDINAL,
      conversationFocus: "",
      primaryFocus: "",
      mode: "assisted",
      isFirstSession: false,
      clientFirstName: "Alex",
      questions: ["What remains difficult in senior meetings?"],
    });
    expect(withoutConversation.developmentFocus).toContain("project judgement");
    expect(withoutConversation.conversationFocus).toBe("");
  });
});

describe("Preparation question specificity", () => {
  it("6–9. prompts prefer grounded open questions when specific evidence exists", () => {
    expect(PREPARATION_INTELLIGENCE_PROMPT).toMatch(
      /prefer open,\s*\n?\s*non-leading questions grounded/i
    );
    expect(PREPARATION_INTELLIGENCE_PROMPT).toMatch(/what enabled progress/i);
    expect(PREPARATION_INTELLIGENCE_PROMPT).toMatch(
      /Do not turn questions into assessment/i
    );
    expect(PREPARATION_INTELLIGENCE_PROMPT).toMatch(
      /too thin to support specificity/i
    );
    expect(PREPARATION_BRIEF_SYSTEM_PROMPT).toMatch(
      /prefer questions\s+grounded in that evidence/i
    );
  });

  it("10. adapter fallback does not return the three retired generics when evidence exists", () => {
    const prior = {
      ...createBlankSession({
        id: "s4",
        clientId: "client-1",
        coachId: "coach-1",
        sessionNumber: 4,
        status: "completed",
      }),
      summary: "Practised stating a recommendation.",
      summaryStatus: "approved" as const,
      aiSummaryApproved: true,
      commitments: "State a clear recommendation in the next project meeting.",
      emergingThemes: "Recommendation practice",
    };

    const current = createBlankSession({
      id: "s5",
      clientId: "client-1",
      coachId: "coach-1",
      sessionNumber: 5,
      status: "planned",
    });

    const profile = {
      id: "p1",
      clientId: "client-1",
      coachId: "coach-1",
      currentFocus: LONGITUDINAL,
      strengths: [],
      values: [],
      motivators: [],
      emergingThemes: [],
      growthAreas: [
        {
          id: "g1",
          value: "Stating recommendations clearly",
          status: "emerging" as const,
        },
      ],
      coachingPreferences: [],
      beliefs: [],
      patterns: [],
      commitments: [
        {
          id: "c1",
          value: "State a clear recommendation in the next project meeting.",
          status: "open" as const,
          dueDate: null,
        },
      ],
      coachingPatterns: [],
      patternsEvidenceFingerprint: null,
      patternsGeneratedAt: null,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-16T08:53:14.000Z",
    } as DevelopmentProfile;

    const adapter = buildPreparationAdapterContext({
      client: {
        name: "Alex Morgan",
        role: "Project Coordinator",
        currentFocus: LONGITUDINAL,
        actions: [],
        sessions: [prior, current],
      },
      currentSession: current,
      profile,
      patterns: [],
    });

    for (const retired of RETIRED_GENERIC_PREPARATION_FALLBACK_QUESTIONS) {
      expect(adapter.questions).not.toContain(retired);
    }
    expect(
      adapter.questions.every(
        q => !isRetiredGenericPreparationFallbackQuestion(q)
      )
    ).toBe(true);
    expect(adapter.questions.some(q => /progress|commitment|practice|difficult/i.test(q))).toBe(
      true
    );
  });

  it("filters retired generic templates out of normalised questions", () => {
    const brief = normalisePreparationBrief({
      developmentFocus: LONGITUDINAL,
      conversationFocus: "Explore recent practice",
      questions: [
        RETIRED_GENERIC_PREPARATION_FALLBACK_QUESTIONS[0],
        "What enabled the progress visible since the last conversation?",
      ],
      mode: "assisted",
      clientFirstName: "Alex",
    });
    expect(brief.questions).not.toContain(
      RETIRED_GENERIC_PREPARATION_FALLBACK_QUESTIONS[0]
    );
    expect(brief.questions[0]).toMatch(/progress visible/i);
  });
});
