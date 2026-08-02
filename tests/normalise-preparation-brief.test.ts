import { describe, expect, it } from "vitest";
import {
  isStrongDuplicate,
  normalisePreparationBrief,
} from "@/lib/prepare/normalise-preparation-brief";

describe("normalisePreparationBrief", () => {
  it("preserves complete primary focus sentences without truncation ellipsis", () => {
    const brief = normalisePreparationBrief({
      primaryFocus:
        "Hold accountability with Daniel without taking control of the work.",
      areasToExplore: [
        "How pressure changes his involvement",
        "Where managers should own decisions",
      ],
      questions: [
        "What would make this conversation useful today?",
        "Where does your involvement add the most value?",
      ],
      mode: "assisted",
      clientFirstName: "Daniel",
    });

    expect(brief.primaryFocus).toContain("without taking control");
    expect(brief.primaryFocus.endsWith("…")).toBe(false);
    expect(brief.primaryFocus).not.toMatch(/\s\w$/);
    expect(brief.areasToExplore.every(item => !item.includes("…"))).toBe(true);
  });

  it("removes incomplete trailing fragments", () => {
    const brief = normalisePreparationBrief({
      primaryFocus: "Clarify accountability p",
      areasToExplore: ["How Daniel leads under pressure."],
      questions: ["What would help today?"],
      mode: "assisted",
      clientFirstName: "Daniel",
    });

    expect(brief.primaryFocus.toLowerCase()).not.toContain("accountability p");
  });

  it("prevents primary focus repeating as first area to explore", () => {
    const focus =
      "Clarify what Daniel wants to change in his delegation approach.";
    const brief = normalisePreparationBrief({
      primaryFocus: focus,
      areasToExplore: [
        focus,
        "How Daniel currently leads when performance is under pressure.",
        "Decisions that should remain with his managers.",
      ],
      questions: ["What would make this conversation useful today?"],
      mode: "assisted",
      clientFirstName: "Daniel",
    });

    expect(brief.areasToExplore[0]).not.toBe(focus);
    expect(
      brief.areasToExplore.some(area => isStrongDuplicate(area, focus))
    ).toBe(false);
  });

  it("strips repeated coaching-purpose preamble phrasing", () => {
    const brief = normalisePreparationBrief({
      primaryFocus:
        "Given the stated coaching purpose, the session should clarify ownership.",
      areasToExplore: [
        "Given the stated coaching purpose, explore pressure responses.",
        "Where managers should retain decisions.",
      ],
      questions: [
        "Given the stated coaching purpose, what would help today?",
        "Where does involvement add value?",
      ],
      coachingPurpose: "Improve delegation and accountability.",
      mode: "assisted",
      isFirstSession: true,
      clientFirstName: "Daniel",
    });

    expect(brief.primaryFocus.toLowerCase()).not.toContain(
      "given the stated coaching purpose"
    );
    expect(
      brief.areasToExplore.every(
        area => !/given the stated coaching purpose/i.test(area)
      )
    ).toBe(true);
  });

  it("provides first-session limited-evidence defaults", () => {
    const brief = normalisePreparationBrief({
      primaryFocus: "",
      areasToExplore: [],
      questions: [],
      mode: "assisted",
      isFirstSession: true,
      clientFirstName: "Daniel",
      hasApprovedEvidence: false,
    });

    expect(brief.primaryFocus.toLowerCase()).toContain("daniel");
    expect(brief.areasToExplore).toHaveLength(3);
    expect(brief.questions).toHaveLength(4);
    expect(brief.previousCommitment ?? null).toBeNull();
  });

  it("limits comprehensive extras and keeps questions to four", () => {
    const brief = normalisePreparationBrief({
      primaryFocus: "Support clearer accountability.",
      areasToExplore: ["A", "B", "C", "D"],
      questions: ["Q1?", "Q2?", "Q3?", "Q4?", "Q5?"],
      relevantPatterns: [
        { title: "Pattern one", description: "Shows over-involvement." },
        { title: "Pattern two", description: "Avoids handing back work." },
        { title: "Pattern three", description: "Extra pattern." },
      ],
      developmentDirection: "Grow the habit of leaving decisions with managers.",
      historicalContext: [
        { title: "Session 1", detail: "Named the pressure response." },
        { title: "Session 1b", detail: "Committed to one handover." },
        { title: "Session 1c", detail: "Reviewed blockers." },
        { title: "Session 1d", detail: "Extra." },
      ],
      mode: "comprehensive",
      clientFirstName: "Daniel",
    });

    expect(brief.areasToExplore.length).toBeLessThanOrEqual(3);
    expect(brief.questions.length).toBeLessThanOrEqual(4);
    expect(brief.relevantPatterns.length).toBeLessThanOrEqual(2);
    expect(brief.historicalContext.length).toBeLessThanOrEqual(3);
    expect(brief.developmentDirection).toBeTruthy();
  });

  it("manual mode returns empty generated sections", () => {
    const brief = normalisePreparationBrief({
      primaryFocus: "Should not show",
      areasToExplore: ["Area"],
      questions: ["Question?"],
      mode: "manual",
    });

    expect(brief.primaryFocus).toBe("");
    expect(brief.areasToExplore).toEqual([]);
    expect(brief.questions).toEqual([]);
  });

  it("converts dash-prefixed text into list items", () => {
    const brief = normalisePreparationBrief({
      primaryFocus: "Clarify ownership.",
      areasToExplore: "- Pressure responses\n- Manager decisions\n- Stepping back",
      questions: "1. What would help?\n2. Where do you add value?",
      mode: "assisted",
    });

    expect(brief.areasToExplore).toEqual([
      "Pressure responses",
      "Manager decisions",
      "Stepping back",
    ]);
    expect(brief.questions[0]).toMatch(/what would help/i);
  });
});
