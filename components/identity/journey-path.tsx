export type JourneyStep = {
  id: string;
  label: string;
  description?: string;
  status: "complete" | "current" | "upcoming";
};

export function IdentityJourneyPath({
  steps,
}: {
  steps: JourneyStep[];
}) {
  return (
    <ol className="identity-journey-path" aria-label="Development journey">
      {steps.map(step => (
        <li
          key={step.id}
          className={`identity-journey-step is-${step.status}`}
          aria-current={step.status === "current" ? "step" : undefined}
        >
          <span className="identity-journey-marker" aria-hidden="true" />

          <div>
            <p className="identity-journey-label">{step.label}</p>

            {step.description ? (
              <p className="identity-supporting">{step.description}</p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
