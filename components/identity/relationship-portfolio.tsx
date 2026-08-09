export type RelationshipPortfolioItem = {
  id: string;
  name: string;
  role?: string | null;
  organisation?: string | null;
  stage: string;
  nextStep?: string | null;
  lastMeaningfulActivity?: string | null;
};

export function RelationshipPortfolio({
  items,
  onOpen,
  onViewAll,
  title,
  description,
}: {
  items: RelationshipPortfolioItem[];
  onOpen: (id: string) => void;
  onViewAll: () => void;
  title?: string;
  description?: string;
}) {
  return (
    <section
      className="relationship-portfolio"
      aria-labelledby="relationship-portfolio-title"
    >
      <header className="relationship-portfolio-header">
        <div>
          <p className="home-section-eyebrow">People I support</p>
          <h2 id="relationship-portfolio-title">
            {title ?? "Your development relationships"}
          </h2>
          <p>
            {description ??
              "A focused view of your active development relationships."}
          </p>
        </div>

        <button
          type="button"
          className="identity-text-action"
          onClick={onViewAll}
        >
          View all people
        </button>
      </header>

      <div className="relationship-portfolio-grid">
        {items.slice(0, 4).map(item => (
          <button
            type="button"
            className="relationship-portfolio-item"
            key={item.id}
            onClick={() => onOpen(item.id)}
          >
            <span className="relationship-portfolio-top">
              <span>
                <strong>{item.name}</strong>
                {(item.role || item.organisation) && (
                  <small>
                    {[item.role, item.organisation].filter(Boolean).join(" · ")}
                  </small>
                )}
              </span>
              <span className="relationship-open-mark" aria-hidden="true">
                ↗
              </span>
            </span>

            <span className="relationship-portfolio-stage">{item.stage}</span>

            {item.nextStep ? (
              <span className="relationship-portfolio-next">
                <small>Next meaningful step</small>
                <span>{item.nextStep}</span>
              </span>
            ) : null}

            {item.lastMeaningfulActivity ? (
              <span className="relationship-portfolio-activity">
                {item.lastMeaningfulActivity}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </section>
  );
}
