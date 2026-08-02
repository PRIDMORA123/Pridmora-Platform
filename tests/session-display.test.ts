import { describe, expect, it } from "vitest";
import {
  deduplicateDisplayValues,
  getConciseSessionFocus,
  getDisplayQuestions,
  getDisplayTopics,
  getSessionDisplayTitle,
  getSessionSequenceLabel,
  isQuestionLikeValue,
} from "@/lib/session/session-display";

describe("getConciseSessionFocus", () => {
  it("prefers the first complete meaningful sentence", () => {
    const focus = getConciseSessionFocus({
      purpose:
        "Help John separate observed team behaviour from assumptions and identify one practical next step. Then explore longer history.",
      clientFirstName: "John",
    });

    expect(focus).toBe(
      "Help John separate observed team behaviour from assumptions and identify one practical next step."
    );
    expect(focus.length).toBeLessThanOrEqual(180);
  });

  it("does not invent unsupported facts", () => {
    const focus = getConciseSessionFocus({
      purpose: "Explore confidence in delegation.",
    });
    expect(focus.toLowerCase()).toContain("delegation");
    expect(focus).not.toMatch(/diagnosed|disorder|trauma/i);
  });

  it("removes duplicated purpose/focus content", () => {
    const focus = getConciseSessionFocus({
      purpose: "Build confidence through delegation.",
      focus: "Build confidence through delegation.",
    });
    expect(focus).toBe("Build confidence through delegation.");
  });
});

describe("getDisplayTopics", () => {
  it("returns up to three concise labels and excludes question-like values", () => {
    const topics = getDisplayTopics(
      [
        "Observable team behaviours",
        "What is getting in the way?",
        "Previous attempts and responses",
        "Influence and practical next steps",
        "Another long topic that should not appear initially because we only show three",
      ].join("\n")
    );

    expect(topics).toHaveLength(3);
    expect(topics.every(topic => !topic.label.endsWith("?"))).toBe(true);
    expect(topics[0].label).toBe("Observable team behaviours");
  });

  it("deduplicates case-insensitively", () => {
    const topics = getDisplayTopics("Delegation\ndelegation\nDELEGATION");
    expect(topics).toHaveLength(1);
  });

  it("falls back safely for unsafe long topic labels", () => {
    const long =
      "A very long contaminated topic paragraph that mixes several themes without a clear short label and should not be shown as a pill";
    const topics = getDisplayTopics(long);
    expect(topics[0].original).toBe(long);
    expect(topics[0].label.length).toBeLessThanOrEqual(48);
  });
});

describe("getDisplayQuestions", () => {
  it("shows no more than three questions initially", () => {
    const questions = getDisplayQuestions(
      [
        "What are you noticing?",
        "What have you already tried?",
        "What would progress look like?",
        "What support would help?",
      ].join("\n\n"),
      { max: 3 }
    );

    expect(questions).toHaveLength(3);
  });

  it("filters blank values and deduplicates", () => {
    expect(
      getDisplayQuestions("What next?\n\n\nWhat next?\nHow will you know?")
    ).toEqual(["What next?", "How will you know?"]);
  });
});

describe("session sequence and title", () => {
  it("formats session sequence labels", () => {
    expect(
      getSessionSequenceLabel({ sessionNumber: 3, totalSessions: 8 })
    ).toBe("Session 3 of 8");
    expect(getSessionSequenceLabel({ sessionNumber: 2 })).toBe("Session 2");
    expect(getSessionSequenceLabel({})).toBe("Current session");
  });

  it("derives a short display title without mid-word truncation", () => {
    const source =
      "Navigating resistance within the team while protecting trust and clarity across stakeholders";
    const title = getSessionDisplayTitle({
      focus: source,
      sessionNumber: 3,
    });

    expect(title.length).toBeLessThanOrEqual(70);
    expect(title.endsWith(" ")).toBe(false);
    // Truncation should land on a word boundary from the source.
    expect(source.startsWith(title)).toBe(true);
    expect(source.charAt(title.length) === " " || title.length === source.length).toBe(
      true
    );
  });

  it("prefers an explicit stored title", () => {
    expect(
      getSessionDisplayTitle({
        title: "Building confidence through delegation",
        focus: "Something else",
      })
    ).toBe("Building confidence through delegation");
  });
});

describe("helpers", () => {
  it("detects question-like values", () => {
    expect(isQuestionLikeValue("What is happening?")).toBe(true);
    expect(isQuestionLikeValue("Observable team behaviours")).toBe(false);
  });

  it("deduplicates display values", () => {
    expect(
      deduplicateDisplayValues([" Alpha ", "alpha", "", "Beta"])
    ).toEqual(["Alpha", "Beta"]);
  });
});
