export type DevelopmentMilestone = {
  id: string;
  dateLabel: string;
  title: string;
  summary: string;
  type: "purpose" | "conversation" | "reflection" | "commitment" | "development";
};

export function DevelopmentPath({
  milestones,
  onViewHistory,
}: {
  milestones: DevelopmentMilestone[];
  onViewHistory: () => void;
}) {
  if (milestones.length === 0) {
    return (
      <section className="development-path development-path--empty">
        <header className="development-path-header">
          <div>
            <p className="journey-eyebrow">Development path</p>
            <h2>The coaching journey has begun</h2>
            <p>
              The agreed coaching purpose and future development milestones will be
              shown here.
            </p>
          </div>
        </header>
      </section>
    );
  }

  return (
    <section className="development-path">
      <header className="development-path-header">
        <div>
          <p className="journey-eyebrow">Development path</p>
          <h2>How the journey has developed</h2>
          <p>Meaningful milestones across the coaching relationship.</p>
        </div>

        {milestones.length > 4 ? (
          <button
            type="button"
            className="identity-text-action"
            onClick={onViewHistory}
          >
            View full records
          </button>
        ) : null}
      </header>

      <ol className="development-timeline">
        {milestones.slice(0, 4).map(milestone => (
          <li className="development-timeline-item" key={milestone.id}>
            <div className="development-timeline-marker" aria-hidden="true">
              <span />
            </div>
            <div className="development-timeline-content">
              <time>{milestone.dateLabel}</time>
              <h3>{milestone.title}</h3>
              <p>{milestone.summary}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
