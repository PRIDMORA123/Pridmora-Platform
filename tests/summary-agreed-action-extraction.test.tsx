/** @vitest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildDraftSummaryInstructions,
} from "@/lib/ai/draft-summary-prompt";
import { SummaryInsightsView } from "@/components/summary-insights/summary-insights-view";
import {
  parseSummaryInsightsFromModel,
  parseSummaryInsightsJson,
} from "@/lib/summary-insights/parse-summary-json";
import {
  contentFromSession,
  serialiseSummaryContent,
} from "@/lib/summary-insights/serialise-summary-content";
import type { SummaryInsightsContent } from "@/lib/summary-insights/types";

const EXPLICIT_AGREEMENT =
  "Alex agreed to practise stating a clear recommendation in the next relevant discussion.";

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

describe("draft summary agreed-action extraction contract", () => {
  it("requires explicit agreement language such as agreed to to become commitments", () => {
    const instructions = buildDraftSummaryInstructions("standard");

    expect(instructions).toMatch(/Positively extract explicit agreement language/i);
    expect(instructions).toMatch(/agreed to/i);
    expect(instructions).toMatch(/committed to/i);
    expect(instructions).toMatch(/decided to/i);
    expect(instructions).toMatch(/it was agreed that/i);
    expect(instructions).toContain(EXPLICIT_AGREEMENT);
    expect(instructions).toMatch(/MUST appear in commitments/i);
    expect(instructions).toMatch(
      /not inferred development priorities, not suggested next-focus items, and not possible ideas/i
    );
    expect(instructions).toMatch(
      /do not write that no explicitly agreed actions were recorded/i
    );
    expect(instructions).toMatch(
      /Do not claim "No explicitly agreed actions are recorded"/i
    );
  });

  it("requires tentative wording not to become commitments", () => {
    const instructions = buildDraftSummaryInstructions("standard");

    expect(instructions).toMatch(/MUST NOT appear in commitments/i);
    expect(instructions).toContain(
      "Alex could practise stating recommendations more clearly."
    );
    expect(instructions).toContain(
      "Alex might try leaving the decision with the team."
    );
    expect(instructions).toContain(
      "A possible next step is to practise clearer recommendations."
    );
    expect(instructions).toContain(
      "It may be useful to explore ownership under pressure."
    );
    expect(instructions).toMatch(
      /Keep suggested or tentative next steps here — never move them into commitments/i
    );
  });

  it("keeps next-focus suggestions separate from commitments in the prompt shape", () => {
    const instructions = buildDraftSummaryInstructions("comprehensive");

    expect(instructions).toContain('"commitments"');
    expect(instructions).toContain('"possibleNextFocus"');
    expect(instructions).toMatch(/possibleNextFocus:/);
    expect(instructions).toMatch(/commitments:/);
  });
});

describe("agreed action parse → normalise → serialise → display", () => {
  it("preserves a valid commitment through the summary pipeline", async () => {
    const modelJson = {
      sessionSummary:
        "Alex discussed stating a clear recommendation in the next project discussion and agreed to practise that behaviour.",
      keyInsights: [
        {
          title: "Clearer recommendations",
          description:
            "Alex recognised that tentative framing reduced influence in project discussions.",
        },
      ],
      strengths: [],
      developmentEvidence: [],
      coachingContext: "Protect space for Alex to practise a clear recommendation.",
      commitments: [EXPLICIT_AGREEMENT],
      possibleNextFocus: [
        "How Alex sustains a clear recommendation when challenged",
      ],
      evidenceQualification: null,
    };

    const parsed = parseSummaryInsightsJson(modelJson);
    expect(parsed?.commitments).toEqual([EXPLICIT_AGREEMENT]);
    expect(parsed?.possibleNextFocus).toEqual([
      "How Alex sustains a clear recommendation when challenged",
    ]);

    const serialised = serialiseSummaryContent(parsed!);
    expect(serialised.agreedActions).toContain(EXPLICIT_AGREEMENT);
    expect(serialised.suggestedFocus).toContain(
      "How Alex sustains a clear recommendation when challenged"
    );
    expect(serialised.agreedActions).not.toContain(
      "How Alex sustains a clear recommendation when challenged"
    );

    const restored = contentFromSession({
      summary: serialised.summary,
      emergingThemes: serialised.emergingThemes,
      strengthsObserved: serialised.strengthsObserved,
      valuesBecomingVisible: serialised.valuesBecomingVisible,
      professionalIdentityDevelopment: serialised.professionalIdentityDevelopment,
      agreedActions: serialised.agreedActions,
      commitments: serialised.agreedActions,
      suggestedFocus: serialised.suggestedFocus,
      outcomes: serialised.outcomes,
      coachReflection: serialised.coachReflection,
    });

    expect(restored.commitments).toEqual([EXPLICIT_AGREEMENT]);
    expect(restored.possibleNextFocus).toEqual([
      "How Alex sustains a clear recommendation when challenged",
    ]);

    const container = await renderView(
      <SummaryInsightsView content={restored} status="draft" />
    );
    expect(container.textContent).toContain(EXPLICIT_AGREEMENT);
    expect(container.textContent).not.toContain("No commitment was recorded.");
  });

  it("still shows the empty state when commitments are truly empty", async () => {
    const content: SummaryInsightsContent = {
      sessionSummary: "A short conversation with no recorded agreement.",
      keyInsights: [],
      strengths: [],
      developmentEvidence: [],
      commitments: [],
      possibleNextFocus: ["Explore ownership under pressure"],
      evidenceQualification: null,
    };

    const container = await renderView(
      <SummaryInsightsView content={content} status="draft" />
    );
    expect(container.textContent).toContain("No commitment was recorded.");
  });

  it("does not treat might-try or possible-next-step wording as commitments when only next focus is populated", async () => {
    const parsed = parseSummaryInsightsFromModel(
      JSON.stringify({
        sessionSummary: "Alex explored clearer recommendations.",
        keyInsights: [],
        strengths: [],
        developmentEvidence: [],
        commitments: [],
        possibleNextFocus: [
          "Alex might try leaving the decision with the team.",
          "A possible next step is to practise clearer recommendations.",
        ],
      })
    );

    expect(parsed?.commitments).toEqual([]);
    expect(parsed?.possibleNextFocus).toEqual([
      "Alex might try leaving the decision with the team.",
      "A possible next step is to practise clearer recommendations.",
    ]);

    const container = await renderView(
      <SummaryInsightsView content={parsed!} status="draft" />
    );
    expect(container.textContent).toContain("No commitment was recorded.");
    expect(container.textContent).toContain(
      "Alex might try leaving the decision with the team."
    );
    expect(container.textContent).toContain(
      "A possible next step is to practise clearer recommendations."
    );
  });
});
