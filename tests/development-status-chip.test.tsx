/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEVELOPMENT_STATUS_LABELS,
  DevelopmentStatusChip,
  type DevelopmentStatus,
} from "@/components/identity/development-status-chip";

describe("DevelopmentStatusChip", () => {
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

  it("renders all four status labels", () => {
    const statuses = Object.keys(
      DEVELOPMENT_STATUS_LABELS
    ) as DevelopmentStatus[];

    for (const status of statuses) {
      act(() => {
        root.render(<DevelopmentStatusChip status={status} />);
      });
      const chip = container.querySelector(".identity-development-status");
      expect(chip).not.toBeNull();
      expect(chip?.textContent).toBe(DEVELOPMENT_STATUS_LABELS[status]);
      expect(chip?.getAttribute("data-status")).toBe(status);
      expect(chip?.getAttribute("aria-label")).toContain(
        DEVELOPMENT_STATUS_LABELS[status]
      );
    }
  });

  it("uses nowrap horizontal pill classes — not circular", () => {
    act(() => {
      root.render(<DevelopmentStatusChip status="developing" />);
    });
    const chip = container.querySelector(
      ".identity-development-status"
    ) as HTMLElement;
    expect(chip.className).toContain("identity-development-status");
    expect(chip.className).not.toMatch(/circle|round-badge/);
    expect(chip.textContent).toBe("Developing");
  });

  it("keeps long accessible text on a single chip element", () => {
    act(() => {
      root.render(<DevelopmentStatusChip status="strengthening" />);
    });
    const chip = container.querySelector(".identity-development-status");
    expect(chip?.textContent).toBe("Strengthening");
    expect(chip?.childElementCount).toBe(0);
  });
});
