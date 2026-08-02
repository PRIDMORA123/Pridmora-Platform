"use client";

import { useEffect, useRef } from "react";
import {
  COACHING_JOURNEY_STAGES,
  type CoachingJourneyStageId,
  type CoachingJourneyStageState,
} from "@/lib/coaching-journey";

export type CoachingJourneyNavigationProps = {
  activeStage: CoachingJourneyStageId;
  stageStates: Record<CoachingJourneyStageId, CoachingJourneyStageState>;
  onNavigate: (stage: CoachingJourneyStageId) => void;
};

function stageStateLabel(state: CoachingJourneyStageState): string {
  switch (state) {
    case "current":
      return "Current";
    case "completed":
      return "Completed";
    case "available":
      return "Available";
    case "optional":
      return "Optional";
    case "unavailable":
      return "Unavailable";
  }
}

export function CoachingJourneyNavigation({
  activeStage,
  stageStates,
  onNavigate,
}: CoachingJourneyNavigationProps) {
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const current = nav.querySelector<HTMLElement>(
      '[aria-current="step"]'
    );
    if (!current || typeof current.scrollIntoView !== "function") return;
    current.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [activeStage]);

  return (
    <nav
      ref={navRef}
      className="identity-coaching-journey"
      aria-label="Coaching journey"
    >
      <ol className="identity-coaching-journey__list">
        {COACHING_JOURNEY_STAGES.map((stage, index) => {
          const state = stageStates[stage.id];
          const isUnavailable = state === "unavailable";
          const isCurrent = stage.id === activeStage;
          const isCompleted = state === "completed" && !isCurrent;
          const visualState = isCurrent ? "current" : state;

          const content = (
            <>
              <span
                className="identity-coaching-journey__number"
                aria-hidden="true"
                data-completed={isCompleted ? "true" : undefined}
              >
                {isCompleted ? (
                  <span className="identity-coaching-journey__check">✓</span>
                ) : (
                  index + 1
                )}
              </span>
              <span className="identity-coaching-journey__text">
                <span className="identity-coaching-journey__label">
                  {stage.label}
                </span>
                {stage.optional ? (
                  <span className="identity-coaching-journey__optional">
                    Optional
                  </span>
                ) : null}
                <span className="sr-only">
                  {", "}
                  {isCurrent ? "Current" : stageStateLabel(state)}
                </span>
              </span>
            </>
          );

          return (
            <li
              key={stage.id}
              className="identity-coaching-journey__item"
              data-state={visualState}
            >
              {isUnavailable ? (
                <span
                  className="identity-coaching-journey__link"
                  aria-disabled="true"
                >
                  {content}
                </span>
              ) : (
                <button
                  type="button"
                  className="identity-coaching-journey__link"
                  aria-current={isCurrent ? "step" : undefined}
                  onClick={() => onNavigate(stage.id)}
                >
                  {content}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
