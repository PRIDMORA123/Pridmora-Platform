/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { CoachingJourneyNavigation } from "@/components/coaching-journey/coaching-journey-navigation";
import {
  COACHING_JOURNEY_STAGE_IDS,
  type CoachingJourneyStageId,
  type CoachingJourneyStageState,
} from "@/lib/coaching-journey";

function allAvailable(
  current: CoachingJourneyStageId
): Record<CoachingJourneyStageId, CoachingJourneyStageState> {
  return COACHING_JOURNEY_STAGE_IDS.reduce(
    (acc, id) => {
      acc[id] = id === current ? "current" : "available";
      return acc;
    },
    {} as Record<CoachingJourneyStageId, CoachingJourneyStageState>
  );
}

describe("CoachingJourneyNavigation", () => {
  it("renders six stages with coaching journey aria label", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const onNavigate = vi.fn();

    await act(async () => {
      root.render(
        <CoachingJourneyNavigation
          activeStage="current_position"
          stageStates={allAvailable("current_position")}
          onNavigate={onNavigate}
        />
      );
    });

    const nav = container.querySelector('[aria-label="Coaching journey"]');
    expect(nav).toBeTruthy();
    expect(container.textContent).toContain("Current Position");
    expect(container.textContent).toContain("Prepare");
    expect(container.textContent).toContain("Session Notes");
    expect(container.textContent).toContain("Summary & Insights");
    expect(container.textContent).toContain("Development");
    expect(container.textContent).toContain("Reports");
    expect(container.textContent).toContain("Optional");

    const current = container.querySelector('[aria-current="step"]');
    expect(current?.textContent).toContain("Current Position");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("does not navigate unavailable stages", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const onNavigate = vi.fn();
    const states = allAvailable("current_position");
    states.prepare = "unavailable";

    await act(async () => {
      root.render(
        <CoachingJourneyNavigation
          activeStage="current_position"
          stageStates={states}
          onNavigate={onNavigate}
        />
      );
    });

    const disabled = container.querySelector('[aria-disabled="true"]');
    expect(disabled?.textContent).toContain("Prepare");
    expect(onNavigate).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
