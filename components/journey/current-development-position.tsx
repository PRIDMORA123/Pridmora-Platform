function DevelopmentEvidenceRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="development-evidence-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export type CurrentDevelopmentPositionProps = {
  dateLabel: string;
  headline: string;
  narrative: string;
  evidence: string;
  commitment: string;
  emergingDirection: string;
  empty?: boolean;
  onViewFullNote?: () => void;
};

export function CurrentDevelopmentPosition({
  dateLabel,
  headline,
  narrative,
  evidence,
  commitment,
  emergingDirection,
  empty = false,
  onViewFullNote,
}: CurrentDevelopmentPositionProps) {
  if (empty) {
    return (
      <section className="current-development-position current-development-position--empty">
        <header className="development-position-header">
          <div>
            <p className="journey-eyebrow">Current development position</p>
            <h2>The development story is still forming</h2>
          </div>
        </header>
        <p className="development-position-narrative">
          Approved insights and meaningful changes will appear here as the coaching
          relationship progresses.
        </p>
      </section>
    );
  }

  return (
    <section className="current-development-position">
      <header className="development-position-header">
        <div>
          <p className="journey-eyebrow">Current development position</p>
          <h2>{headline}</h2>
        </div>
        {dateLabel ? <span>{dateLabel}</span> : null}
      </header>

      <p className="development-position-narrative">{narrative}</p>

      {onViewFullNote ? (
        <button
          type="button"
          className="identity-text-action"
          onClick={onViewFullNote}
        >
          Read full development note
        </button>
      ) : null}

      {evidence || commitment || emergingDirection ? (
        <dl className="development-position-evidence">
          {evidence ? (
            <DevelopmentEvidenceRow label="Evidence" value={evidence} />
          ) : null}
          {commitment ? (
            <DevelopmentEvidenceRow label="Current commitment" value={commitment} />
          ) : null}
          {emergingDirection ? (
            <DevelopmentEvidenceRow
              label="Emerging direction"
              value={emergingDirection}
            />
          ) : null}
        </dl>
      ) : null}
    </section>
  );
}
