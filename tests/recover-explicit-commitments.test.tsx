/** @vitest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { SummaryInsightsView } from "@/components/summary-insights/summary-insights-view";
import { NO_COMMITMENT_AGREED_MARKER } from "@/lib/summary-insights/debrief-evidence-for-summary";
import {
  applyExplicitCommitmentSafeguard,
  extractExplicitAgreementsFromEvidence,
} from "@/lib/summary-insights/recover-explicit-commitments";
import {
  contentFromSession,
  serialiseSummaryContent,
} from "@/lib/summary-insights/serialise-summary-content";
import type { SummaryInsightsContent } from "@/lib/summary-insights/types";
import { EMPTY_SUMMARY_INSIGHTS_CONTENT } from "@/lib/summary-insights/types";

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

function emptyModelContent(
  overrides: Partial<SummaryInsightsContent> = {}
): SummaryInsightsContent {
  return {
    ...EMPTY_SUMMARY_INSIGHTS_CONTENT,
    sessionSummary: "A conversation about recommendations.",
    ...overrides,
  };
}

describe("extractExplicitAgreementsFromEvidence", () => {
  it("A recovers Alex agreed to practise… when model commitments are empty", () => {
    const evidence =
      "Alex agreed to practise stating a clear recommendation in the next relevant project discussion.";
    expect(extractExplicitAgreementsFromEvidence(evidence)).toEqual([evidence]);
    const secured = applyExplicitCommitmentSafeguard(
      emptyModelContent({ commitments: [] }),
      evidence
    );
    expect(secured.commitments).toEqual([evidence]);
  });

  it("B recovers Alex committed to…", () => {
    const evidence = "Alex committed to raising the issue at the next meeting.";
    expect(extractExplicitAgreementsFromEvidence(evidence)).toEqual([evidence]);
  });

  it("C recovers It was agreed that…", () => {
    const evidence = "It was agreed that Alex would speak to the project lead.";
    expect(extractExplicitAgreementsFromEvidence(evidence)).toEqual([evidence]);
  });

  it("D does not recover could practise…", () => {
    expect(
      extractExplicitAgreementsFromEvidence(
        "Alex could practise stating recommendations more clearly."
      )
    ).toEqual([]);
  });

  it("E does not recover might raise…", () => {
    expect(
      extractExplicitAgreementsFromEvidence("Alex might raise this next time.")
    ).toEqual([]);
  });

  it("F does not recover possible next step…", () => {
    expect(
      extractExplicitAgreementsFromEvidence(
        "A possible next step is to practise clearer recommendations."
      )
    ).toEqual([]);
  });

  it("G preserves existing populated model commitments without duplicates", () => {
    const modelCommitment = "Coach-confirmed follow-up with the sponsor.";
    const evidence =
      "Alex agreed to practise stating a clear recommendation in the next relevant project discussion.";
    const secured = applyExplicitCommitmentSafeguard(
      emptyModelContent({ commitments: [modelCommitment] }),
      evidence
    );
    expect(secured.commitments).toEqual([modelCommitment]);
    expect(secured.commitments).not.toContain(evidence);
  });

  it("H does not recover the no-commitment marker", () => {
    expect(
      extractExplicitAgreementsFromEvidence(NO_COMMITMENT_AGREED_MARKER)
    ).toEqual([]);
    expect(
      extractExplicitAgreementsFromEvidence("No commitment was agreed.")
    ).toEqual([]);
  });

  it("I recovers explicit agreement when a historical no-commitment marker also appears", () => {
    const agreement =
      "Alex agreed to practise doing this in the next relevant project discussion.";
    const evidence = `${agreement}\n\n${NO_COMMITMENT_AGREED_MARKER}`;
    expect(extractExplicitAgreementsFromEvidence(evidence)).toEqual([agreement]);
    const secured = applyExplicitCommitmentSafeguard(
      emptyModelContent({ commitments: [] }),
      evidence
    );
    expect(secured.commitments).toEqual([agreement]);
  });

  it("J recovered commitment survives serialise → contentFromSession → display", async () => {
    const agreement =
      "Alex agreed to practise stating a clear recommendation in the next relevant project discussion.";
    const secured = applyExplicitCommitmentSafeguard(
      emptyModelContent({
        commitments: [],
        possibleNextFocus: ["How Alex holds the recommendation under challenge"],
      }),
      agreement
    );

    const serialised = serialiseSummaryContent(secured);
    expect(serialised.agreedActions).toContain(agreement);

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

    expect(restored.commitments).toEqual([agreement]);

    const container = await renderView(
      <SummaryInsightsView content={restored} status="draft" />
    );
    expect(container.textContent).toContain(agreement);
    expect(container.textContent).not.toContain("No commitment was recorded.");
  });
});
