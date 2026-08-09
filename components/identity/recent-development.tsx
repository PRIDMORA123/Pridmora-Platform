export type RecentDevelopmentItem = {
  id: string;
  personName: string;
  change: string;
  dateLabel: string;
};

export function RecentDevelopment({
  items,
  onOpen,
  description,
}: {
  items: RecentDevelopmentItem[];
  onOpen: (id: string) => void;
  description?: string;
}) {
  return (
    <section
      className="recent-development-panel"
      aria-labelledby="recent-development-title"
    >
      <header>
        <p className="home-section-eyebrow">Recent movement</p>
        <h2 id="recent-development-title">What has changed</h2>
        <p>
          {description ??
            "Recent approved development across your coaching relationships."}
        </p>
      </header>

      {items.length > 0 ? (
        <div className="recent-development-list">
          {items.slice(0, 3).map(item => (
            <button
              type="button"
              className="recent-development-item"
              key={item.id}
              onClick={() => onOpen(item.id)}
            >
              <span className="recent-development-line" aria-hidden="true" />
              <span className="recent-development-content">
                <strong>{item.personName}</strong>
                <span>{item.change}</span>
                <small>{item.dateLabel}</small>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="identity-empty-state identity-empty-state--compact">
          <p>
            Approved development changes will appear here as development
            journeys progress.
          </p>
        </div>
      )}
    </section>
  );
}
