export type JourneyNextStepProps = {
  now: string;
  next: string;
  className?: string;
};

/**
 * Quiet Now / Next guidance — answers “what happens next?”
 * Not a dashboard panel.
 */
export function JourneyNextStep({
  now,
  next,
  className,
}: JourneyNextStepProps) {
  return (
    <aside
      className={["journey-next-step", className].filter(Boolean).join(" ")}
      aria-label="Now and next"
    >
      <p className="journey-next-step__row">
        <span className="journey-next-step__label">Now</span>
        <span className="journey-next-step__value">{now}</span>
      </p>
      <p className="journey-next-step__row">
        <span className="journey-next-step__label">Next</span>
        <span className="journey-next-step__value">{next}</span>
      </p>
    </aside>
  );
}
