import { describe, expect, it } from "vitest";
import {
  clampGeneratedBriefPayload,
  parseGeneratedPreparationBrief,
} from "@/lib/coaching-intelligence/parse-generated-brief";

describe("parseGeneratedPreparationBrief", () => {
  it("clamps overlong coachingGuidance.framework instead of rejecting", () => {
    const longFramework = "A".repeat(280);
    const brief = parseGeneratedPreparationBrief(
      {
        previousConversation: "Prior session covered delegation.",
        outstandingActions: ["Follow up on workload boundary"],
        possibleFocus: "Boundaries under pressure",
        purposeSuggestion: "Clarify what support looks like",
        topicsToExplore: ["Workload", "Delegation"],
        suggestedQuestions: [
          "What feels most unsustainable right now?",
          "Where are you saying yes when you mean not yet?",
          "What support would change the pressure?",
          "What would a clearer boundary sound like?",
        ],
        desiredOutcomeSuggestion: "A workable boundary to try this week",
        coachingGuidance: {
          framework: longFramework,
          considerations: ["Keep the pace calm"],
        },
      },
      "comprehensive"
    );

    expect(brief.coachingGuidance?.framework).toHaveLength(200);
    expect(brief.coachingGuidance?.framework).toBe("A".repeat(200));
  });

  it("clampGeneratedBriefPayload trims nested guidance fields", () => {
    const clamped = clampGeneratedBriefPayload({
      coachingGuidance: {
        framework: "x".repeat(250),
        considerations: ["y".repeat(500)],
      },
    }) as {
      coachingGuidance: { framework: string; considerations: string[] };
    };

    expect(clamped.coachingGuidance.framework).toHaveLength(200);
    expect(clamped.coachingGuidance.considerations[0]).toHaveLength(400);
  });
});
