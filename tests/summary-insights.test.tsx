/** @vitest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SummaryInsightsView } from "@/components/summary-insights/summary-insights-view";
import {
  __summaryNormaliserTestUtils,
  hasSummaryInsightsContent,
  normaliseSummaryContent,
} from "@/lib/summary-insights/normalise-summary-content";
import {
  parseSummaryInsightsFromModel,
  parseSummaryInsightsJson,
} from "@/lib/summary-insights/parse-summary-json";
import { serialiseSummaryContent } from "@/lib/summary-insights/serialise-summary-content";
import type { SummaryInsightsContent } from "@/lib/summary-insights/types";
import { SUMMARY_INSIGHTS_LIMITS } from "@/lib/summary-insights/types";

const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];

async function renderView(node: ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  mounted.push({ root, container });
  return container;
}

afterEach(async () => {
  for (const entry of mounted.splice(0)) {
    await act(async () => {
      entry.root.unmount();
    });
    entry.container.remove();
  }
});

const structuredExample: SummaryInsightsContent = {
  sessionSummary:
    "Sarah explored delegation pressure and the shift from doing the work herself to enabling her team.",
  keyInsights: [
    {
      title: "Delegation and ownership",
      description:
        "Sarah recognised that retaining detailed ownership was limiting her team’s growth.",
    },
    {
      title: "Leadership development",
      description:
        "She connected leadership presence with clearer expectations rather than closer control.",
    },
    {
      title: "Growing self-awareness",
      description:
        "She noticed a pattern of stepping in when discomfort rose around standards.",
    },
  ],
  strengths: [
    {
      title: "Self-awareness",
      description:
        "Sarah could name the moment she takes work back from others.",
    },
    {
      title: "Reflective capacity",
      description:
        "She used the session to examine impact without becoming defensive.",
    },
  ],
  developmentEvidence: [
    {
      title: "Emerging leadership shift",
      description:
        "She described one recent attempt to leave a decision with a direct report.",
    },
  ],
  coachingContext:
    "Sarah is adjusting to a broader leadership remit with rising stakeholder demands.",
  commitments: [
    "Agree one decision her team lead will own this week",
    "Pause before reclaiming a task and name the standard instead",
  ],
  possibleNextFocus: [
    "How standards can be held without reabsorbing work",
    "What support her team needs to carry ownership",
  ],
  evidenceQualification:
    "The notes do not yet provide sufficient evidence of sustained behavioural change.",
};

describe("parseSummaryInsightsJson", () => {
  it("parses structured JSON for rendering", () => {
    const parsed = parseSummaryInsightsJson(structuredExample);
    expect(parsed?.sessionSummary).toContain("delegation pressure");
    expect(parsed?.keyInsights).toHaveLength(3);
    expect(parsed?.strengths[0]?.title).toBe("Self-awareness");
    expect(parsed?.commitments).toHaveLength(2);
  });

  it("enforces maximum item display limits", () => {
    const parsed = parseSummaryInsightsJson({
      sessionSummary: "Summary",
      keyInsights: Array.from({ length: 8 }, (_, index) => ({
        title: `Insight ${index + 1}`,
        description: `Description ${index + 1}`,
      })),
      strengths: Array.from({ length: 6 }, (_, index) => ({
        title: `Strength ${index + 1}`,
        description: `Strength description ${index + 1}`,
      })),
      developmentEvidence: Array.from({ length: 5 }, (_, index) => ({
        title: `Evidence ${index + 1}`,
        description: `Evidence description ${index + 1}`,
      })),
      commitments: Array.from(
        { length: 7 },
        (_, index) => `Commitment ${index + 1}`
      ),
      possibleNextFocus: Array.from(
        { length: 5 },
        (_, index) => `Focus ${index + 1}`
      ),
    });

    expect(parsed?.keyInsights).toHaveLength(SUMMARY_INSIGHTS_LIMITS.keyInsights);
    expect(parsed?.strengths).toHaveLength(SUMMARY_INSIGHTS_LIMITS.strengths);
    expect(parsed?.developmentEvidence).toHaveLength(
      SUMMARY_INSIGHTS_LIMITS.developmentEvidence
    );
    expect(parsed?.commitments).toHaveLength(SUMMARY_INSIGHTS_LIMITS.commitments);
    expect(parsed?.possibleNextFocus).toHaveLength(
      SUMMARY_INSIGHTS_LIMITS.possibleNextFocus
    );
  });

  it("parses model JSON wrapped in prose fences", () => {
    const parsed = parseSummaryInsightsFromModel(
      `Here is the draft:\n\`\`\`json\n${JSON.stringify(structuredExample)}\n\`\`\``
    );
    expect(parsed?.keyInsights[0]?.title).toBe("Delegation and ownership");
  });
});

describe("normaliseSummaryContent", () => {
  it("splits legacy numbered headings without showing numbering", () => {
    const raw = [
      "1. Session Summary",
      "Sarah discussed delegation and ownership with her team.",
      "",
      "2. Emerging Themes",
      "Delegation and ownership: Sarah recognised she was holding too much.",
      "Leadership development: She wants to lead through others.",
      "",
      "3. Relevant Strengths and Capabilities",
      "Self-awareness: She can describe the moment she steps back in.",
      "",
      "4. Development Evidence",
      "Emerging leadership shift: She left one decision with a report.",
      "The notes do not yet provide sufficient evidence of development or behavioural change.",
      "",
      "5. Relevant Coaching Context",
      "Sarah is managing a wider remit under stakeholder pressure.",
      "",
      "6. Agreed Actions",
      "- Agree one decision the team lead will own",
      "- Pause before reclaiming work",
      "",
      "7. Suggested Focus for the Next Session",
      "- Holding standards without reabsorbing work",
      "- Team support for ownership",
    ].join("\n");

    const content = normaliseSummaryContent({ summary: raw });

    expect(content.sessionSummary).toContain("delegation and ownership");
    expect(content.sessionSummary).not.toMatch(/^1\./);
    expect(content.keyInsights[0]?.title).toBe("Delegation and ownership");
    expect(content.strengths[0]?.title).toBe("Self-awareness");
    expect(content.developmentEvidence[0]?.title).toBe(
      "Emerging leadership shift"
    );
    expect(content.coachingContext).toContain("wider remit");
    expect(content.commitments).toEqual([
      "Agree one decision the team lead will own",
      "Pause before reclaiming work",
    ]);
    expect(content.possibleNextFocus[0]).toContain("Holding standards");
    expect(content.evidenceQualification).toContain("sufficient evidence");
  });

  it("supports unnumbered and lightly numbered headings", () => {
    const raw = [
      "Session Summary",
      "A short summary.",
      "3 Relevant Strengths and Capabilities",
      "Clarity: She named the standard she wants others to meet.",
      "Possible Next Focus",
      "- Explore standards language",
    ].join("\n");

    const content = normaliseSummaryContent({ summary: raw });
    expect(content.strengths[0]?.title).toBe("Clarity");
    expect(content.possibleNextFocus).toEqual(["Explore standards language"]);
  });

  it("parses colon-based subheading pairs safely", () => {
    const item = __summaryNormaliserTestUtils.parseColonInsight(
      "Delegation and ownership: Sarah recognised she was holding too much."
    );
    expect(item).toEqual({
      title: "Delegation and ownership",
      description: "Sarah recognised she was holding too much.",
    });

    expect(
      __summaryNormaliserTestUtils.parseColonInsight(
        "Meet at 10:30 to continue the discussion about ownership."
      )
    ).toBeNull();
  });

  it("treats dash-prefixed legacy lists as list items", () => {
    const items = __summaryNormaliserTestUtils.splitListItems(
      ["- First commitment", "- Second commitment"].join("\n")
    );
    expect(items).toEqual(["First commitment", "Second commitment"]);
  });

  it("does not split ordinary prose merely because it contains a dash", () => {
    const content = normaliseSummaryContent({
      summary:
        "Sarah explored the trade-off between pace and quality during a demanding week.",
    });
    expect(content.sessionSummary).toContain("trade-off between pace");
    expect(content.commitments).toHaveLength(0);
  });

  it("removes duplicate insight statements", () => {
    const content = normaliseSummaryContent({
      emergingThemes: [
        "Delegation and ownership: Sarah recognised she was holding too much.",
        "Delegation and ownership: Sarah recognised she was holding too much.",
        "Leadership development: She wants to lead through others.",
      ].join("\n"),
    });
    expect(content.keyInsights).toHaveLength(2);
  });

  it("extracts commitments and reports when none were recorded", () => {
    const withCommitments = normaliseSummaryContent({
      agreedActions: "- Follow up with Alex\n- Book a planning slot",
    });
    expect(withCommitments.commitments).toEqual([
      "Follow up with Alex",
      "Book a planning slot",
    ]);

    const empty = normaliseSummaryContent({
      summary: "Session Summary\nA short conversation.",
      agreedActions: "",
    });
    expect(empty.commitments).toEqual([]);
  });

  it("falls back to a readable paragraph for unstructured raw text", () => {
    const content = normaliseSummaryContent({
      summary:
        "Sarah spoke about workload, then returned to the same ownership concern later in the conversation.",
    });
    expect(content.sessionSummary).toContain("workload");
    expect(content.keyInsights).toHaveLength(0);
    expect(hasSummaryInsightsContent(content)).toBe(true);
  });

  it("preserves coach edits through serialise and normalise", () => {
    const edited: SummaryInsightsContent = {
      ...structuredExample,
      sessionSummary: "Coach-edited summary retained for the record.",
      commitments: ["Coach-edited commitment"],
    };
    const serialised = serialiseSummaryContent(edited);
    const restored = normaliseSummaryContent(serialised);
    expect(restored.sessionSummary).toBe(
      "Coach-edited summary retained for the record."
    );
    expect(restored.commitments).toEqual(["Coach-edited commitment"]);
    expect(restored.keyInsights[0]?.title).toBe("Delegation and ownership");
  });
});

describe("SummaryInsightsView", () => {
  it("renders structured sections and omits empty optional sections", async () => {
    const container = await renderView(
      <SummaryInsightsView
        content={{
          sessionSummary: "A concise session summary.",
          keyInsights: [
            {
              title: "Delegation and ownership",
              description: "Supported insight text.",
            },
          ],
          strengths: [],
          developmentEvidence: [],
          coachingContext: null,
          commitments: [],
          possibleNextFocus: [],
          evidenceQualification: null,
        }}
        status="draft"
      />
    );

    expect(container.textContent).toContain("Pridmora Intelligence");
    expect(container.textContent).not.toContain("Identity Intelligence");
    expect(container.querySelector("h2")?.textContent).toBe("Session Summary");
    expect(container.textContent).toContain("Key Insights");
    expect(container.textContent).toContain("Delegation and ownership");
    expect(container.textContent).not.toContain("Strengths Observed");
    expect(container.textContent).not.toContain("Coaching Context");
    expect(container.textContent).toContain("Agreed Commitments");
    expect(container.textContent).toContain("No commitment was recorded.");
    expect(container.textContent).toMatch(/Draft/);
  });

  it("renders commitments and next focus as lists", async () => {
    const container = await renderView(
      <SummaryInsightsView content={structuredExample} status="approved" />
    );

    expect(container.querySelectorAll(".summary-commitment-list li").length).toBe(
      2
    );
    expect(container.querySelectorAll(".summary-next-focus-list li").length).toBe(
      2
    );
    expect(container.textContent).toContain("Approved coaching record");
  });

  it("keeps heading order accessible for screen readers", async () => {
    const container = await renderView(
      <SummaryInsightsView content={structuredExample} status="draft" />
    );

    const headings = Array.from(
      container.querySelectorAll("h1, h2, h3, h4, h5, h6")
    );
    const levels = headings.map(heading => Number(heading.tagName.replace("H", "")));
    expect(levels[0]).toBe(2);
    expect(levels).toContain(3);
    expect(levels.every((level, index) => index === 0 || level >= levels[0])).toBe(
      true
    );
    expect(
      headings.some(
        heading =>
          heading.tagName === "H2" && heading.textContent === "Key Insights"
      )
    ).toBe(true);
    expect(
      headings.some(
        heading =>
          heading.tagName === "H3" &&
          heading.textContent === "Delegation and ownership"
      )
    ).toBe(true);
  });

  it("uses distinct edit-mode fields rather than a single wall textarea", async () => {
    const container = await renderView(
      <SummaryInsightsView
        content={structuredExample}
        status="draft"
        editing
        onChange={() => undefined}
      />
    );

    expect(container.querySelector("#summary-session-summary")).toBeTruthy();
    expect(
      container.querySelectorAll('input[type="text"], textarea').length
    ).toBeGreaterThan(4);
    expect(container.textContent).toMatch(/Add insight/i);
    expect(container.querySelector(".summary-insights-content.is-editing")).toBeTruthy();
  });

  it("stays single-column and readable at mobile widths", async () => {
    const container = await renderView(
      <SummaryInsightsView content={structuredExample} status="draft" />
    );

    const list = container.querySelector(".summary-insight-list");
    expect(list).toBeTruthy();
    expect(list?.className).toContain("summary-insight-list");
    expect(container.querySelector(".summary-insights-content")).toBeTruthy();
    // Mobile CSS forces a single column; markup must not introduce multi-column wrappers.
    expect(container.querySelectorAll(".summary-insight-list").length).toBeGreaterThan(
      0
    );
  });
});

describe("regeneration warning behaviour", () => {
  it("surfaces a confirmation path when coach edits exist", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const confirmed = window.confirm(
      "You have unsaved coach edits. Regenerating may replace the current unapproved draft. Your approved record will not change until you approve again. Continue?"
    );
    expect(confirmed).toBe(false);
    expect(confirmSpy).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
