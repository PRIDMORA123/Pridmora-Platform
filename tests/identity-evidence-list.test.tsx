/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  IdentityEvidenceList,
  dedupeEvidenceItems,
  evidenceClassificationLabel,
  evidenceTypeLabel,
  formatEvidenceDateLabel,
  sortEvidenceItemsChronologically,
  stripLeadingListMarker,
} from "@/components/identity-intelligence/identity-evidence-list";

describe("evidence date formatting", () => {
  it("formats ISO timestamps as UK long dates", () => {
    expect(formatEvidenceDateLabel("2026-08-01T09:23:57.013+00:00")).toBe(
      "1 August 2026"
    );
  });

  it("does not return raw ISO strings", () => {
    const label = formatEvidenceDateLabel("2026-08-18T12:00:00.000Z");
    expect(label).toBeTruthy();
    expect(label).not.toMatch(/T\d{2}:\d{2}/);
    expect(label).not.toContain("+00:00");
  });

  it("labels known source types", () => {
    expect(evidenceTypeLabel("development_observation")).toBe(
      "Development observation"
    );
    expect(evidenceTypeLabel("approved_summary")).toBe("Approved summary");
    expect(evidenceTypeLabel("commitment")).toBe("Commitment / intention");
    expect(evidenceTypeLabel("coaching_moment")).toBe("Development moment");
  });

  it("classifies behavioural vs commitment evidence", () => {
    expect(evidenceClassificationLabel("session_notes")).toBe(
      "Reported behaviour"
    );
    expect(evidenceClassificationLabel("approved_summary")).toBe(
      "Reported behaviour"
    );
    expect(evidenceClassificationLabel("commitment")).toBe(
      "Commitment / intention"
    );
  });

  it("strips a leading list marker for display only", () => {
    expect(stripLeadingListMarker("- Raise concerns earlier")).toBe(
      "Raise concerns earlier"
    );
    expect(stripLeadingListMarker("• Leave one decision")).toBe(
      "Leave one decision"
    );
    expect(stripLeadingListMarker("Keep this wording intact")).toBe(
      "Keep this wording intact"
    );
  });
});

describe("IdentityEvidenceList", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders classification and metadata before body excerpt", () => {
    act(() => {
      root.render(
        <IdentityEvidenceList
          items={[
            {
              id: "1",
              sourceType: "session_notes",
              typeLabel: "Session notes",
              sessionLabel: "Session 1",
              dateLabel: "1 August 2026",
              excerpt: "She left one decision with her manager.",
            },
          ]}
        />
      );
    });

    const text = container.textContent || "";
    expect(text).toContain("Reported behaviour");
    expect(text).toContain("Session 1 · Session notes");
    expect(text).toContain("1 August 2026");
    expect(text).toContain("She left one decision with her manager.");
    expect(text).toContain("View full evidence");

    const classification = container.querySelector(
      ".identity-evidence-list__classification"
    );
    const excerpt = container.querySelector(".identity-evidence-list__excerpt");
    expect(classification).not.toBeNull();
    expect(excerpt).not.toBeNull();
    expect(excerpt?.tagName).toBe("P");
    expect(excerpt?.className).toContain("identity-evidence-list__excerpt");
    expect(container.querySelector("h1, h2, h3, h4")?.textContent).not.toBe(
      "She left one decision with her manager."
    );
    expect(text.indexOf("Reported behaviour")).toBeLessThan(
      text.indexOf("She left one decision")
    );
  });

  it("distinguishes commitment / intention from reported behaviour", () => {
    act(() => {
      root.render(
        <IdentityEvidenceList
          items={[
            {
              id: "1",
              sourceType: "commitment",
              typeLabel: "Commitment / intention",
              sessionLabel: "Session 2",
              dateLabel: "8 August 2026",
              excerpt: "- Will leave one decision with the manager this week.",
            },
          ]}
        />
      );
    });

    expect(container.textContent).toContain("Commitment / intention");
    expect(container.textContent).toContain("Session 2");
    expect(container.textContent).not.toContain("Session 2 · Commitment");
    expect(container.textContent).toContain(
      "Will leave one decision with the manager this week."
    );
    expect(container.textContent).not.toMatch(/-\s*Will leave one decision/);
    expect(
      container.querySelector('[data-evidence-class="commitment"]')
    ).not.toBeNull();
  });

  it("orders evidence chronologically when requested", () => {
    act(() => {
      root.render(
        <IdentityEvidenceList
          chronological
          items={[
            {
              id: "later",
              sourceType: "session_notes",
              typeLabel: "Session notes",
              sessionLabel: "Session 4",
              dateLabel: "30 August 2026",
              sortKey: "2026-08-30",
              excerpt: "Later session note.",
            },
            {
              id: "earlier",
              sourceType: "commitment",
              typeLabel: "Commitment / intention",
              sessionLabel: "Session 1",
              dateLabel: "15 August 2026",
              sortKey: "2026-08-15",
              excerpt: "Earlier commitment.",
            },
          ]}
        />
      );
    });

    const text = container.textContent || "";
    expect(text.indexOf("Earlier commitment.")).toBeLessThan(
      text.indexOf("Later session note.")
    );
  });

  it("keeps sortEvidenceItemsChronologically stable for presentation only", () => {
    const ordered = sortEvidenceItemsChronologically([
      {
        id: "b",
        sortKey: "2026-08-20",
        excerpt: "B",
      },
      {
        id: "a",
        sortKey: "2026-08-10",
        excerpt: "A",
      },
    ]);
    expect(ordered.map(item => item.id)).toEqual(["a", "b"]);
  });

  it("removes duplicate evidence rows", () => {
    const items = dedupeEvidenceItems([
      {
        id: "a",
        typeLabel: "Commitment / intention",
        sessionLabel: "Session 2",
        dateLabel: "18 August 2026",
        excerpt: "Same commitment",
      },
      {
        id: "b",
        typeLabel: "Commitment / intention",
        sessionLabel: "Session 2",
        dateLabel: "18 August 2026",
        excerpt: "Same commitment",
      },
    ]);
    expect(items).toHaveLength(1);
  });
});
