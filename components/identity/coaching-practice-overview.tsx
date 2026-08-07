export type PracticeOverviewItem = {
  label: string;
  value: number | string;
  supportingText?: string;
};

export type PracticeOverviewMetric = {
  label: string;
  value: number;
  detail?: string;
};

export function CoachingPracticeOverview({
  items,
  eyebrow = "Your priorities",
  title = "Management overview",
  description = "A concise view of your current management and development work.",
}: {
  items: PracticeOverviewItem[];
  eyebrow?: string;
  title?: string;
  description?: string;
}) {
  return (
    <aside className="practice-overview" aria-labelledby="practice-overview-title">
      <header>
        <p className="practice-overview-eyebrow">{eyebrow}</p>
        <h2 id="practice-overview-title">{title}</h2>
        <p>{description}</p>
      </header>

      <div className="practice-overview-list is-metrics-grid" role="list">
        {items.map(item => (
          <div className="practice-overview-item practice-overview-metric" key={item.label} role="listitem">
            <strong>{item.value}</strong>
            <span>{item.label}</span>
            {item.supportingText ? <small>{item.supportingText}</small> : null}
          </div>
        ))}
      </div>

      <p className="practice-overview-principle">Evidence before certainty</p>
    </aside>
  );
}

export function PracticeOverviewCard({
  metrics,
}: {
  metrics: PracticeOverviewMetric[];
}) {
  return (
    <CoachingPracticeOverview
      items={metrics.map(metric => ({
        label: metric.label,
        value: metric.value,
        supportingText: metric.detail,
      }))}
    />
  );
}
