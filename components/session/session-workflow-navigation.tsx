"use client";

import {
  SESSION_WORKFLOW_STAGES,
  unavailableStageExplanation,
  type SessionStageAvailability,
  type SessionWorkflowStage,
} from "@/lib/session/session-workflow";

export type SessionWorkflowNavigationProps = {
  currentStage: SessionWorkflowStage;
  getAvailability: (stage: SessionWorkflowStage) => SessionStageAvailability;
  onNavigate: (stage: SessionWorkflowStage) => void;
};

export function SessionWorkflowNavigation({
  currentStage,
  getAvailability,
  onNavigate,
}: SessionWorkflowNavigationProps) {
  return (
    <nav
      className="session-workflow-nav"
      aria-label="Session progress"
    >
      <ol className="session-workflow-nav__list">
        {SESSION_WORKFLOW_STAGES.map((stage, index) => {
          const availability = getAvailability(stage.id);
          const isCurrent = availability === "current";
          const isUnavailable = availability === "unavailable";
          const explanation = unavailableStageExplanation(stage.id);

          return (
            <li
              key={stage.id}
              className={[
                "session-workflow-nav__item",
                `is-${availability}`,
              ].join(" ")}
            >
              {index > 0 ? (
                <span className="session-workflow-nav__rule" aria-hidden="true" />
              ) : null}

              <button
                type="button"
                className="session-workflow-nav__button"
                aria-current={isCurrent ? "step" : undefined}
                aria-disabled={isUnavailable || undefined}
                disabled={isUnavailable}
                title={isUnavailable ? explanation : stage.label}
                onClick={() => {
                  if (isUnavailable) return;
                  onNavigate(stage.id);
                }}
              >
                <span className="session-workflow-nav__marker" aria-hidden="true">
                  {availability === "completed" ? "✓" : index + 1}
                </span>
                <span className="session-workflow-nav__labels">
                  <span className="session-workflow-nav__label">
                    {stage.label}
                  </span>
                  <span className="session-workflow-nav__short">
                    {stage.shortLabel}
                  </span>
                  <span className="session-workflow-nav__state">
                    {availability === "current"
                      ? "Current"
                      : availability === "completed"
                        ? "Completed"
                        : availability === "available"
                          ? "Available"
                          : "Unavailable"}
                  </span>
                </span>
              </button>

              {isUnavailable ? (
                <span className="sr-only">{explanation}</span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
