import { describe, expect, it } from "vitest";
import { COMPREHENSIVE_MARKER } from "@/lib/summary-insights/types";
import { extractVisibleCoachNotes } from "@/lib/coach-notes";
import {
  containsInternalMarker,
  normaliseProseDashes,
  prepareVisibleText,
  stripInternalMarkers,
} from "@/lib/visible-text";

describe("visible text safety", () => {
  it("strips [[pridmora_comprehensive]] and never leaves the token visible", () => {
    const raw = `Useful reflection.\n\n${COMPREHENSIVE_MARKER}{"developmentTrajectory":"x"}`;
    expect(stripInternalMarkers(raw)).toBe("Useful reflection.");
    expect(prepareVisibleText(raw)).not.toContain("[[pridmora_comprehensive]]");
    expect(prepareVisibleText(raw)).not.toContain("[[");
    expect(extractVisibleCoachNotes(raw)).toBe("Useful reflection.");
  });

  it("detects internal markers for regression guards", () => {
    expect(containsInternalMarker("[[pridmora_comprehensive]]")).toBe(true);
    expect(containsInternalMarker("Clean professional prose.")).toBe(false);
  });

  it("normalises AI-style em dashes into separate sentences", () => {
    expect(
      normaliseProseDashes(
        "Evidence remains limited — further conversations will strengthen confidence."
      )
    ).toBe(
      "Evidence remains limited. Further conversations will strengthen confidence."
    );
  });

  it("keeps legitimate compound hyphens", () => {
    expect(
      prepareVisibleText(
        "Use evidence-based follow-up after the one-to-one conversation."
      )
    ).toContain("evidence-based");
    expect(
      prepareVisibleText(
        "Use evidence-based follow-up after the one-to-one conversation."
      )
    ).toContain("follow-up");
    expect(
      prepareVisibleText(
        "Use evidence-based follow-up after the one-to-one conversation."
      )
    ).toContain("one-to-one");
  });
});
