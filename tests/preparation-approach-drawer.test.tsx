/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PreparationApproachDrawer } from "@/components/preparation-approach-drawer";
import { ToastProvider } from "@/components/feedback/toast-provider";
import { preparationApproachScopeCopy } from "@/lib/preparation-style";

vi.mock("@/services/coaching-intelligence", () => ({
  updateRelationshipIntelligenceMode: vi.fn(async ({ mode }) => ({
    client: {
      id: "client-1",
      preparationStyleOverride:
        mode === "manual"
          ? "minimal"
          : mode === "comprehensive"
            ? "enhanced"
            : "guided",
    },
  })),
}));

import { updateRelationshipIntelligenceMode } from "@/services/coaching-intelligence";

describe("PreparationApproachDrawer", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
    vi.stubGlobal(
      "requestAnimationFrame",
      (callback: FrameRequestCallback) => {
        callback(0);
        return 0;
      }
    );
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    document.body.style.overflow = "";
    document.body.style.paddingRight = "";
    document
      .querySelectorAll(".identity-drawer-layer")
      .forEach(node => node.remove());
    vi.unstubAllGlobals();
  });

  it("renders selectable approach cards with Standard recommended", () => {
    act(() => {
      root.render(
        <ToastProvider>
          <PreparationApproachDrawer
            open
            relationshipId="client-1"
            defaultMode="assisted"
            initialMode="comprehensive"
            client={{ name: "Sarah Thompson" }}
            onClose={() => undefined}
            onSaved={() => undefined}
          />
        </ToastProvider>
      );
    });

    const body = document.body;
    expect(body.textContent).toContain("Choose preparation approach");
    expect(body.textContent).toContain(
      "Select how much preparation support you would like for this coaching relationship."
    );
    expect(body.textContent).toContain("Recommended");
    expect(body.textContent).toContain(
      preparationApproachScopeCopy("relationship")
    );

    const radios = Array.from(
      body.querySelectorAll('input[type="radio"][name="preparation-style"]')
    ) as HTMLInputElement[];
    expect(radios).toHaveLength(3);
    expect(radios.map(radio => radio.value)).toEqual([
      "minimal",
      "guided",
      "enhanced",
    ]);
    expect(radios.find(radio => radio.value === "enhanced")?.checked).toBe(
      true
    );

    const assistedLabel = radios
      .find(radio => radio.value === "guided")
      ?.closest("label");
    expect(assistedLabel?.textContent).toContain("Recommended");
  });

  it("supports keyboard selection and saves the stored style value", async () => {
    const onSaved = vi.fn();

    act(() => {
      root.render(
        <ToastProvider>
          <PreparationApproachDrawer
            open
            relationshipId="client-1"
            defaultMode="assisted"
            initialMode="assisted"
            client={{ name: "Sarah Thompson" }}
            onClose={() => undefined}
            onSaved={onSaved}
          />
        </ToastProvider>
      );
    });

    const comprehensive = document.body.querySelector(
      'input[type="radio"][value="enhanced"]'
    ) as HTMLInputElement;

    expect(comprehensive).toBeTruthy();

    act(() => {
      comprehensive.focus();
      comprehensive.dispatchEvent(new Event("change", { bubbles: true }));
      comprehensive.click();
    });

    expect(comprehensive.checked).toBe(true);
    expect(document.body.textContent).toContain(
      "Comprehensive approach selected"
    );

    const save = Array.from(document.body.querySelectorAll("button")).find(
      button => button.textContent === "Save approach"
    ) as HTMLButtonElement;

    await act(async () => {
      save.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(updateRelationshipIntelligenceMode).toHaveBeenCalledWith(
      expect.objectContaining({
        relationshipId: "client-1",
        mode: "comprehensive",
      })
    );
    expect(onSaved).toHaveBeenCalledWith(
      "comprehensive",
      expect.objectContaining({ preparationStyleOverride: "enhanced" })
    );
  });
});
