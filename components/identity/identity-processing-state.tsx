export const AURELIA_WORKING_TITLE = "Aurelia is working…";
export const AURELIA_WORKING_DETAIL =
  "Reviewing the available development information.";

export const AURELIA_WORKING_STAGES = {
  reviewingEvidence: "Reviewing evidence…",
  lookingForPatterns: "Looking for recurring patterns…",
  preparingInsight: "Preparing the development insight…",
} as const;

export type IdentityProcessingStep = {
  id: string;
  label: string;
  status: "waiting" | "active" | "complete";
};

export type IdentityProcessingStateProps = {
  title: string;
  description?: string;
  steps?: IdentityProcessingStep[];
  compact?: boolean;
  /** When false, marks the process as finished for assistive tech. */
  busy?: boolean;
};

/**
 * Canonical active processing surface for preparation refresh and
 * conversation-saved development updates. Truthful stages only — no fake %.
 */
export function IdentityProcessingState({
  title,
  description,
  steps,
  compact = false,
  busy = true,
}: IdentityProcessingStateProps) {
  const hasSteps = Boolean(steps && steps.length > 0);

  return (
    <div
      className={`identity-processing-state${compact ? " is-compact" : ""}`}
      role="status"
      aria-live="polite"
      aria-busy={busy ? "true" : "false"}
    >
      <div className="identity-processing-state__header">
        {busy ? (
          <span
            className="identity-processing-state__indicator"
            aria-hidden="true"
          />
        ) : (
          <span
            className="identity-processing-state__complete-mark"
            aria-hidden="true"
          >
            ✓
          </span>
        )}
        <div className="identity-processing-state__copy">
          <p className="identity-processing-state__title">{title}</p>
          {description ? (
            <p className="identity-processing-state__description">
              {description}
            </p>
          ) : null}
        </div>
      </div>

      {hasSteps ? (
        <ol className="identity-processing-state__steps">
          {steps!.map(step => (
            <li
              key={step.id}
              className="identity-processing-state__step"
              data-status={step.status}
            >
              <span
                className="identity-processing-state__step-mark"
                aria-hidden="true"
              >
                {step.status === "complete"
                  ? "✓"
                  : step.status === "active"
                    ? "●"
                    : "○"}
              </span>
              <span className="identity-processing-state__step-label">
                {step.label}
                {step.status === "active" ? (
                  <span className="sr-only"> (in progress)</span>
                ) : null}
                {step.status === "complete" ? (
                  <span className="sr-only"> (complete)</span>
                ) : null}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
