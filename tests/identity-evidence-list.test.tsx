/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  IdentityEvidenceList,
  dedupeEvidenceItems,
  evidenceTypeLabel,
  formatEvidenceDateLabel,
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

  it("renders excerpt before source metadata", () => {
    act(() => {
      root.render(
        <IdentityEvidenceList
          items={[
            {
              id: "1",
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
    expect(text).toContain("She left one decision with her manager.");
    expect(text).toContain("Source: Session 1 · Session notes");
    expect(text.indexOf("She left one decision")).toBeLessThan(
      text.indexOf("Source: Session 1")
    );
    expect(container.textContent).toContain("View full evidence");
  });

  it("renders structured rows with View full evidence actions", () => {
    act(() => {
      root.render(
        <IdentityEvidenceList
          items={[
            {
              id: "1",
              typeLabel: "Development observation",
              sessionLabel: "Session 1",
              dateLabel: "1 August 2026",
              excerpt: "Theme appeared in review.",
            },
            {
              id: "2",
              typeLabel: "Approved summary",
              sessionLabel: "Session 2",
              dateLabel: "18 August 2026",
              excerpt: "Summary confirms the theme.",
            },
          ]}
        />
      );
    });

    expect(container.textContent).toContain("Theme appeared in review.");
    expect(container.textContent).toContain(
      "Source: Session 1 · Development observation"
    );
    expect(container.querySelectorAll(".identity-evidence-list__action").length).toBe(
      2
    );
    expect(container.querySelector("button.identity-text-action")).not.toBeNull();
    expect(container.querySelector('a[style*="purple"]')).toBeNull();
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
