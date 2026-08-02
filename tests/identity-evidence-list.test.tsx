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
    expect(evidenceTypeLabel("commitment")).toBe("Commitment");
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

  it("renders structured rows with View evidence actions", () => {
    act(() => {
      root.render(
        <IdentityEvidenceList
          items={[
            {
              id: "1",
              typeLabel: "Development observation",
              sessionLabel: "Session 1",
              dateLabel: "1 August 2026",
              href: "#evidence-1",
            },
            {
              id: "2",
              typeLabel: "Approved summary",
              sessionLabel: "Session 2",
              dateLabel: "18 August 2026",
              href: "#evidence-2",
            },
          ]}
        />
      );
    });

    expect(container.textContent).toContain("Development observation");
    expect(container.textContent).toContain("Session 1 · 1 August 2026");
    expect(container.textContent).toContain("Approved summary");
    expect(container.querySelectorAll(".identity-evidence-list__action").length).toBe(
      2
    );
    expect(container.querySelector("a.identity-text-action")).not.toBeNull();
    expect(container.querySelector('a[style*="purple"]')).toBeNull();
  });

  it("removes duplicate evidence rows", () => {
    const items = dedupeEvidenceItems([
      {
        id: "a",
        typeLabel: "Commitment",
        sessionLabel: "Session 2",
        dateLabel: "18 August 2026",
        href: "#c",
      },
      {
        id: "b",
        typeLabel: "Commitment",
        sessionLabel: "Session 2",
        dateLabel: "18 August 2026",
        href: "#c",
      },
    ]);
    expect(items).toHaveLength(1);
  });
});
