import { describe, expect, it } from "vitest";
import {
  buildDraftSummaryInput,
  buildDraftSummaryInstructions,
} from "@/lib/ai/draft-summary-prompt";
import {
  hasComprehensiveExtras,
  packQualificationAndComprehensive,
  unpackQualificationAndComprehensive,
} from "@/lib/summary-insights/comprehensive-pack";
import { dedupeAcrossSummarySections } from "@/lib/summary-insights/section-dedupe";
import {
  contentFromSession,
  serialiseSummaryContent,
} from "@/lib/summary-insights/serialise-summary-content";
import type { SummaryInsightsContent } from "@/lib/summary-insights/types";
import { COMPREHENSIVE_MARKER } from "@/lib/summary-insights/types";

describe("Standard vs Comprehensive summary depth", () => {
  it("builds materially different prompt structures", () => {
    const standard = buildDraftSummaryInstructions("standard");
    const comprehensive = buildDraftSummaryInstructions("comprehensive");

    expect(standard).toContain("Depth mode for this draft: STANDARD");
    expect(comprehensive).toContain("Depth mode for this draft: COMPREHENSIVE");
    expect(standard).not.toContain('"comprehensive"');
    expect(comprehensive).toContain('"developmentTrajectory"');
    expect(comprehensive).toContain('"behaviouralPatterns"');
    expect(comprehensive).toContain('"evidenceConfidenceNote"');
    expect(comprehensive).toContain("COMPREHENSIVE REQUIREMENTS");
    expect(standard).toContain("STANDARD REQUIREMENTS");
    expect(standard).not.toEqual(comprehensive);
  });

  it("asks the model for different depth in the input envelope", () => {
    const notes = "Delegation discussed with concrete ownership examples.";
    expect(buildDraftSummaryInput(notes, "standard")).toContain(
      "Use STANDARD depth."
    );
    expect(buildDraftSummaryInput(notes, "comprehensive")).toContain(
      "Use COMPREHENSIVE depth."
    );
  });

  it("serialises comprehensive extras into a distinct packed structure", () => {
    const standard: SummaryInsightsContent = {
      sessionSummary: "A concise conversation about ownership.",
      keyInsights: [
        {
          title: "Ownership",
          description: "She left a decision with her report.",
        },
      ],
      strengths: [],
      developmentEvidence: [],
      commitments: ["Follow up next week"],
      possibleNextFocus: ["Explore accountability"],
      depthMode: "standard",
      comprehensive: null,
    };

    const comprehensive: SummaryInsightsContent = {
      ...standard,
      depthMode: "comprehensive",
      coachingContext: "Protect space for her to hold accountability.",
      comprehensive: {
        developmentTrajectory:
          "Across three conversations she is shifting from rescue to sponsorship.",
        behaviouralPatterns: [
          {
            title: "Delegation under pressure",
            description:
              "She now pauses before reclaiming work when standards feel at risk.",
          },
        ],
        evidenceConfidenceNote: "Moderate — repeated conversation evidence.",
        evidenceCoverageNote:
          "Conversations and reflection represented; assessment not yet included.",
        contradictoryOrLimitedEvidence: [
          "Earlier notes still show occasional reclaiming under deadline pressure.",
        ],
        developmentRisks: [
          "Progress may not yet hold under sustained operational pressure.",
        ],
        recommendedNextConversation:
          "Explore how she sustains ownership when delivery risk rises.",
      },
    };

    const standardPacked = serialiseSummaryContent(standard);
    const comprehensivePacked = serialiseSummaryContent(comprehensive);

    expect(standardPacked.coachReflection).not.toContain(COMPREHENSIVE_MARKER);
    expect(comprehensivePacked.coachReflection).toContain(COMPREHENSIVE_MARKER);
    expect(comprehensivePacked.coachReflection).toContain("developmentTrajectory");
    expect(standardPacked).not.toEqual(comprehensivePacked);

    const restored = contentFromSession({
      summary: comprehensivePacked.summary,
      emergingThemes: comprehensivePacked.emergingThemes,
      strengthsObserved: comprehensivePacked.strengthsObserved,
      valuesBecomingVisible: comprehensivePacked.valuesBecomingVisible,
      professionalIdentityDevelopment:
        comprehensivePacked.professionalIdentityDevelopment,
      agreedActions: comprehensivePacked.agreedActions,
      commitments: comprehensivePacked.agreedActions,
      suggestedFocus: comprehensivePacked.suggestedFocus,
      outcomes: comprehensivePacked.outcomes,
      coachReflection: comprehensivePacked.coachReflection,
    });

    expect(restored.depthMode).toBe("comprehensive");
    expect(hasComprehensiveExtras(restored.comprehensive)).toBe(true);
    expect(restored.comprehensive?.developmentTrajectory).toMatch(/shifting/i);
  });

  it("packs and unpacks comprehensive extras without losing structure", () => {
    const packed = packQualificationAndComprehensive({
      qualification: "Limited third-party evidence.",
      comprehensive: {
        developmentTrajectory: "Gradual strengthening of listening under tension.",
        behaviouralPatterns: [
          {
            title: "Listening",
            description: "She stayed with the issue before advising.",
          },
        ],
        evidenceConfidenceNote: "Moderate",
        evidenceCoverageNote: "Conversation evidence only",
        contradictoryOrLimitedEvidence: ["No recent observation from peers"],
        developmentRisks: ["May revert under time pressure"],
        recommendedNextConversation: "Test listening when stakes are high",
      },
    });

    const unpacked = unpackQualificationAndComprehensive(packed);
    expect(unpacked.qualification).toBe("Limited third-party evidence.");
    expect(unpacked.comprehensive?.behaviouralPatterns?.[0]?.title).toBe(
      "Listening"
    );
  });
});

describe("Summary section deduplication", () => {
  it("removes materially duplicated ideas across sections", () => {
    const content: SummaryInsightsContent = {
      sessionSummary:
        "She is learning to leave decisions with her team and avoid reclaiming work.",
      keyInsights: [
        {
          title: "Leaving decisions",
          description:
            "She is learning to leave decisions with her team and avoid reclaiming work.",
        },
      ],
      strengths: [
        {
          title: "Leaving decisions",
          description:
            "She is learning to leave decisions with her team and avoid reclaiming work.",
        },
      ],
      developmentEvidence: [
        {
          title: "Ownership shift",
          description:
            "Previously she reclaimed work under pressure; this week she left a decision with her report.",
        },
      ],
      commitments: [],
      possibleNextFocus: [],
      depthMode: "standard",
    };

    const deduped = dedupeAcrossSummarySections(content);
    expect(deduped.developmentEvidence).toHaveLength(1);
    // Key insights / strengths that only restate evidence should be filtered.
    expect(deduped.keyInsights.length + deduped.strengths.length).toBeLessThan(
      content.keyInsights.length + content.strengths.length
    );
  });
});
