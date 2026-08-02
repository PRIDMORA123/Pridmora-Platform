/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { StageOrientation } from "@/components/coaching-journey/stage-orientation";
import { JourneyNextStep } from "@/components/coaching-journey/journey-next-step";
import { STAGE_ORIENTATION_COPY } from "@/lib/coaching-journey";

describe("StageOrientation", () => {
  it("renders canonical Prepare copy", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const copy = STAGE_ORIENTATION_COPY.prepare;

    await act(async () => {
      root.render(
        <StageOrientation title={copy.title} description={copy.description} />
      );
    });

    expect(container.querySelector("h1")?.textContent).toBe("Prepare");
    expect(container.textContent).toContain(
      "What matters for this conversation."
    );

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});

describe("JourneyNextStep", () => {
  it("renders Now and Next guidance", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <JourneyNextStep
          now="Session 2 is in progress"
          next="Capture the outcome when the conversation ends"
        />
      );
    });

    expect(container.textContent).toContain("Now");
    expect(container.textContent).toContain("Session 2 is in progress");
    expect(container.textContent).toContain("Next");
    expect(container.textContent).toContain(
      "Capture the outcome when the conversation ends"
    );

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
