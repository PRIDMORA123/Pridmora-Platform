/** @vitest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { StageHeader } from "@/components/coaching-journey/stage-header";
import { StageOrientation } from "@/components/coaching-journey/stage-orientation";
import { SessionsLoadError } from "@/components/feedback/sessions-load-error";
import { STAGE_ORIENTATION_COPY } from "@/lib/coaching-journey";

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

describe("StageHeader", () => {
  it("renders a single vertical hierarchy for Summary & Insights", async () => {
    const copy = STAGE_ORIENTATION_COPY.summary_insights;
    const container = await renderView(
      <StageHeader
        eyebrow={copy.eyebrow || "Summary & Insights"}
        title={copy.title}
        description={copy.description}
        optional={copy.optional}
      />
    );

    expect(container.querySelector(".identity-stage-header")).toBeTruthy();
    expect(
      container.querySelector(".identity-stage-header__eyebrow")?.textContent
    ).toBe("Summary & Insights");
    expect(
      container.querySelector(".identity-stage-header__optional")?.textContent
    ).toBe("Optional");
    expect(
      container.querySelector(".identity-stage-header__title")?.textContent
    ).toBe("Carry forward what matters");
    expect(container.textContent).toContain(
      "Review the session record, confirm commitments"
    );

    // Eyebrow, title and description must not live in separate column wrappers.
    expect(
      container.querySelectorAll(".identity-stage-header__content > *").length
    ).toBe(3);
  });

  it("keeps Summary & Insights title wrapping in a single content block", async () => {
    const container = await renderView(
      <StageHeader
        eyebrow="Summary & Insights"
        title="Carry forward what matters"
        description="Review the session record, confirm commitments and decide what should inform the next conversation."
        optional
      />
    );

    const title = container.querySelector(".identity-stage-header__title");
    expect(title?.tagName).toBe("H1");
    expect(title?.parentElement?.className).toContain(
      "identity-stage-header__content"
    );
  });

  it("StageOrientation uses StageHeader composition", async () => {
    const copy = STAGE_ORIENTATION_COPY.summary_insights;
    const container = await renderView(
      <StageOrientation
        eyebrow={copy.eyebrow}
        title={copy.title}
        description={copy.description}
        optional
      />
    );

    expect(container.querySelector("h1")?.textContent).toBe(
      "Carry forward what matters"
    );
    expect(container.querySelector(".identity-stage-header__eyebrow")).toBeTruthy();
  });
});

describe("SessionsLoadError", () => {
  it("shows calm recovery actions without technical details", async () => {
    let retries = 0;
    const container = await renderView(
      <SessionsLoadError
        onRetry={() => {
          retries += 1;
        }}
        onReturn={() => undefined}
      />
    );

    expect(container.textContent).toContain("Sessions could not be loaded");
    expect(container.textContent).toContain(
      "session history could not be retrieved"
    );
    expect(container.textContent).not.toContain("500");
    expect(container.textContent).not.toContain("RLS");

    const retry = container.querySelector("button");
    await act(async () => {
      retry?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(retries).toBe(1);
  });

  it("disables retry while active and announces loading", async () => {
    const container = await renderView(
      <SessionsLoadError
        retrying
        onRetry={() => undefined}
        onReturn={() => undefined}
      />
    );

    const retry = Array.from(container.querySelectorAll("button")).find(button =>
      /trying again/i.test(button.textContent || "")
    );
    expect(retry?.hasAttribute("disabled")).toBe(true);
    expect(container.querySelector("[aria-live='polite']")?.textContent).toContain(
      "Trying again"
    );
  });
});
