/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { IdentityProcessingState } from "@/components/identity/identity-processing-state";
import { PreparationStatus } from "@/components/prepare/preparation-status";

describe("IdentityProcessingState", () => {
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

  it("exposes polite live region while busy", () => {
    act(() => {
      root.render(
        <IdentityProcessingState
          title="Updating preparation"
          description="Reviewing the latest approved evidence and preparing a new briefing."
          busy
        />
      );
    });

    const region = container.querySelector(".identity-processing-state");
    expect(region?.getAttribute("aria-live")).toBe("polite");
    expect(region?.getAttribute("aria-busy")).toBe("true");
    expect(container.textContent).toContain("Updating preparation");
    expect(container.textContent).toContain(
      "Reviewing the latest approved evidence"
    );
  });

  it("marks complete state as not busy", () => {
    act(() => {
      root.render(
        <IdentityProcessingState
          title="Development updated"
          description="You can continue when ready."
          busy={false}
        />
      );
    });

    const region = container.querySelector(".identity-processing-state");
    expect(region?.getAttribute("aria-busy")).toBe("false");
  });

  it("renders truthful steps without inventing percentages", () => {
    act(() => {
      root.render(
        <IdentityProcessingState
          title="Updating preparation"
          steps={[
            { id: "1", label: "Previous conversations", status: "complete" },
            { id: "2", label: "Commitments", status: "active" },
            { id: "3", label: "Preparing briefing", status: "waiting" },
          ]}
        />
      );
    });

    expect(container.textContent).toContain("Previous conversations");
    expect(container.textContent).toContain("Commitments");
    expect(container.textContent).not.toMatch(/%/);
  });
});

describe("PreparationStatus refresh state", () => {
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

  it("shows an active updating preparation state", () => {
    act(() => {
      root.render(
        <PreparationStatus refreshState="refreshing" hasApprovedEvidence />
      );
    });

    expect(container.textContent).toContain("Updating preparation");
    expect(container.textContent).toContain("approved evidence");
    expect(container.querySelector("[aria-busy='true']")).not.toBeNull();
  });

  it("preserves briefing messaging on failure when saved preparation exists", () => {
    act(() => {
      root.render(
        <PreparationStatus
          refreshState="failed"
          hasApprovedEvidence
          hasSavedPreparation
          onContinueWithExisting={() => undefined}
        />
      );
    });

    expect(container.textContent).toContain(
      "Preparation could not be refreshed safely"
    );
    expect(container.textContent).toContain(
      "existing preparation remains available"
    );
  });

  it("does not claim existing preparation when none is saved", () => {
    act(() => {
      root.render(
        <PreparationStatus refreshState="failed" hasSavedPreparation={false} />
      );
    });

    expect(container.textContent).toContain(
      "Preparation could not be generated right now."
    );
    expect(container.textContent).not.toContain(
      "existing preparation remains available"
    );
  });
});
