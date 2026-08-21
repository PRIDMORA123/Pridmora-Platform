import { describe, expect, it } from "vitest";
import { COACHING_INTELLIGENCE_MODES } from "@/lib/coaching-intelligence/mode-config";
import {
  getRefreshButtonLabels,
  modeToPreparationStyle,
  parseCoachingIntelligenceMode,
  preparationStyleToMode,
} from "@/lib/coaching-intelligence/mode";
import { COACHING_INTELLIGENCE_RULES } from "@/lib/coaching-intelligence/rules";

describe("coaching intelligence modes", () => {
  it("maps modes to preparation styles for compatibility", () => {
    expect(modeToPreparationStyle("manual")).toBe("minimal");
    expect(modeToPreparationStyle("assisted")).toBe("guided");
    expect(modeToPreparationStyle("comprehensive")).toBe("enhanced");
    expect(preparationStyleToMode("minimal")).toBe("manual");
    expect(preparationStyleToMode("guided")).toBe("assisted");
    expect(preparationStyleToMode("enhanced")).toBe("comprehensive");
  });

  it("keeps assisted concise and comprehensive wider, with manager-facing labels", () => {
    expect(COACHING_INTELLIGENCE_MODES.manual.label).toBe("Human-led");
    expect(COACHING_INTELLIGENCE_MODES.assisted.label).toBe("AI-light");
    expect(COACHING_INTELLIGENCE_MODES.comprehensive.label).toBe("AI-supported");
    expect(COACHING_INTELLIGENCE_MODES.manual.aiEnabled).toBe(false);
    expect(COACHING_INTELLIGENCE_MODES.assisted.sources).toEqual([
      "previous_conversations",
      "approved_summaries",
      "open_commitments",
      "authorised_development_evidence",
    ]);
    expect(COACHING_INTELLIGENCE_MODES.comprehensive.sources).toContain(
      "development_themes"
    );
    expect(COACHING_INTELLIGENCE_MODES.comprehensive.sources).toContain(
      "authorised_development_evidence"
    );
  });

  it("never overwrites coach content or uses private notes", () => {
    expect(COACHING_INTELLIGENCE_RULES.includePrivateCoachNotes).toBe(false);
    expect(COACHING_INTELLIGENCE_RULES.overwriteCoachEnteredPreparation).toBe(
      false
    );
    expect(COACHING_INTELLIGENCE_RULES.automaticallyApproveGeneratedContent).toBe(
      false
    );
  });

  it("uses mode-aware refresh labels", () => {
    expect(getRefreshButtonLabels("manual").idle).toBe("AI preparation off");
    expect(getRefreshButtonLabels("assisted").idle).toContain("AI-light");
    expect(getRefreshButtonLabels("comprehensive").idle).toContain(
      "AI-supported"
    );
  });

  it("parses unknown values to assisted", () => {
    expect(parseCoachingIntelligenceMode("nope")).toBe("assisted");
    expect(parseCoachingIntelligenceMode("comprehensive")).toBe("comprehensive");
  });
});
