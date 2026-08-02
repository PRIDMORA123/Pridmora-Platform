import { describe, expect, it } from "vitest";
import {
  buildSourceFingerprint,
  EMPTY_PREPARATION_AI_BRIEF,
  hasPreparationAiContent,
  isPreparationBriefStale,
  parsePreparationAiBrief,
  removeAiSection,
} from "@/lib/preparation-brief";
import {
  DEFAULT_PREPARATION_STYLE,
  PREPARATION_STYLE_DESCRIPTIONS,
  PREPARATION_STYLE_LABELS,
  PREPARATION_STYLE_SELECTOR_OPTIONS,
  PREPARATION_STYLE_SHORT_DESCRIPTIONS,
  effectiveStyleDescription,
  estimatedReviewMinutes,
  parsePreparationStyle,
  preparationApproachScopeCopy,
  preparationSectionVisibility,
  resolvePreparationStyle,
} from "@/lib/preparation-style";

describe("resolvePreparationStyle", () => {
  it("gives existing coaches Guided when no preference is saved", () => {
    expect(resolvePreparationStyle(undefined, null)).toBe("guided");
    expect(resolvePreparationStyle(null, null)).toBe("guided");
    expect(parsePreparationStyle(undefined)).toBe(DEFAULT_PREPARATION_STYLE);
  });

  it("uses the coach default when the client has no override", () => {
    expect(resolvePreparationStyle("minimal", null)).toBe("minimal");
    expect(resolvePreparationStyle("enhanced", null)).toBe("enhanced");
    expect(resolvePreparationStyle("guided", null)).toBe("guided");
  });

  it("lets a client override the coach default", () => {
    expect(resolvePreparationStyle("guided", "minimal")).toBe("minimal");
    expect(resolvePreparationStyle("minimal", "enhanced")).toBe("enhanced");
  });

  it("returns to the coach default when no relationship override is set", () => {
    expect(resolvePreparationStyle("enhanced", null)).toBe("enhanced");
    expect(resolvePreparationStyle("minimal", undefined)).toBe("minimal");
  });

  it("does not let an invalid override change a valid coach default", () => {
    expect(resolvePreparationStyle("enhanced", "unknown")).toBe("enhanced");
  });

  it("falls back to guided for invalid coach values without an override", () => {
    expect(resolvePreparationStyle("legacy", null)).toBe("guided");
  });
});

describe("coach preference changes", () => {
  it("supports Guided → Minimal and Minimal → Enhanced", () => {
    let coachStyle = resolvePreparationStyle("guided", null);
    expect(coachStyle).toBe("guided");
    coachStyle = "minimal";
    expect(resolvePreparationStyle(coachStyle, null)).toBe("minimal");
    coachStyle = "enhanced";
    expect(resolvePreparationStyle(coachStyle, null)).toBe("enhanced");
  });

  it("changing the global default does not change clients with an explicit override", () => {
    const override = "minimal" as const;
    expect(resolvePreparationStyle("guided", override)).toBe("minimal");
    expect(resolvePreparationStyle("enhanced", override)).toBe("minimal");
  });
});

describe("preparation section visibility", () => {
  it("Minimal hides all AI suggestions", () => {
    const visibility = preparationSectionVisibility("minimal");
    expect(visibility.showAiSupport).toBe(false);
    expect(visibility.showThemes).toBe(false);
    expect(visibility.showExploration).toBe(false);
    expect(visibility.showSuggestedQuestions).toBe(false);
    expect(visibility.showCoachReflection).toBe(false);
    expect(visibility.showPatterns).toBe(false);
    expect(visibility.showDevelopmentDirection).toBe(false);
    expect(visibility.showHistoricalContext).toBe(false);
    expect(visibility.showAdditionalQuestions).toBe(false);
  });

  it("Guided shows themes, four-question capacity, and one reflection prompt", () => {
    const visibility = preparationSectionVisibility("guided");
    expect(visibility.showAiSupport).toBe(true);
    expect(visibility.showThemes).toBe(true);
    expect(visibility.showExploration).toBe(true);
    expect(visibility.showSuggestedQuestions).toBe(true);
    expect(visibility.showCoachReflection).toBe(true);
    expect(visibility.showPatterns).toBe(false);
    expect(visibility.showAdditionalQuestions).toBe(false);
  });

  it("Enhanced shows cross-conversation patterns without requiring every AI section always", () => {
    const visibility = preparationSectionVisibility("enhanced");
    expect(visibility.showPatterns).toBe(true);
    expect(visibility.showDevelopmentDirection).toBe(true);
    expect(visibility.showHistoricalContext).toBe(true);
    expect(visibility.showAdditionalQuestions).toBe(true);
  });
});

describe("preparation brief helpers", () => {
  it("keeps regeneration from implying overwrite of confirmed notes", () => {
    const brief = parsePreparationAiBrief({
      themes: [{ title: "Delegation", basis: "Appeared in recent conversations" }],
      exploration: "You may wish to explore follow-through.",
      questions: ["What would help?", "What shifted?", "What still matters?", "What next?"],
      reflectionPrompt: "What assumption are you bringing?",
      patterns: [],
      developmentDirection: "",
      historicalContext: [],
      additionalQuestions: [],
      removedSections: [],
    });
    expect(brief).not.toBeNull();
    expect(hasPreparationAiContent(brief)).toBe(true);

    const withoutThemes = removeAiSection(brief!, "themes");
    expect(withoutThemes.themes).toEqual([]);
    expect(withoutThemes.questions).toHaveLength(4);
    expect(withoutThemes.removedSections).toContain("themes");
  });

  it("detects stale briefs only when the source fingerprint changes", () => {
    const fingerprint = buildSourceFingerprint(["2026-07-25T10:00:00.000Z", "focus"]);
    expect(
      isPreparationBriefStale(
        { generatedAt: "2026-07-25T17:45:00.000Z", sourceFingerprint: fingerprint },
        fingerprint
      )
    ).toBe(false);
    expect(
      isPreparationBriefStale(
        { generatedAt: "2026-07-25T17:45:00.000Z", sourceFingerprint: fingerprint },
        buildSourceFingerprint(["2026-07-25T18:00:00.000Z", "focus"])
      )
    ).toBe(true);
  });

  it("treats an empty AI brief as no AI content", () => {
    expect(hasPreparationAiContent(EMPTY_PREPARATION_AI_BRIEF)).toBe(false);
  });
});

describe("guidance labels", () => {
  it("exposes modest estimated review times", () => {
    expect(estimatedReviewMinutes("minimal")).toBe(2);
    expect(estimatedReviewMinutes("guided")).toBe(4);
    expect(estimatedReviewMinutes("enhanced")).toBe(7);
  });

  it("describes whether the effective style uses the coach default", () => {
    expect(effectiveStyleDescription("guided", null)).toBe(
      "Assisted — using your default"
    );
    expect(effectiveStyleDescription("minimal", "minimal")).toBe(
      "Manual — selected for this client"
    );
  });

  it("keeps stored values mapped to coach-facing labels", () => {
    expect(PREPARATION_STYLE_LABELS).toEqual({
      minimal: "Manual",
      guided: "Assisted",
      enhanced: "Comprehensive",
    });
    expect(PREPARATION_STYLE_SHORT_DESCRIPTIONS.guided).toBe("Light support");
    expect(PREPARATION_STYLE_DESCRIPTIONS.minimal).toContain("No AI preparation");
    expect(
      PREPARATION_STYLE_SELECTOR_OPTIONS.find(option => option.value === "guided")
        ?.recommended
    ).toBe(true);
    expect(
      PREPARATION_STYLE_SELECTOR_OPTIONS.find(
        option => option.value === "enhanced"
      )?.recommended
    ).toBeFalsy();
  });

  it("distinguishes relationship and session scope wording", () => {
    expect(preparationApproachScopeCopy("relationship")).toContain(
      "this coaching relationship"
    );
    expect(preparationApproachScopeCopy("session")).toContain(
      "this preparation only"
    );
  });
});
