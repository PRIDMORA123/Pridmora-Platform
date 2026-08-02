export type SummaryInsightItemProps = {
  title: string;
  description: string;
};

export function SummaryInsightItem({
  title,
  description,
}: SummaryInsightItemProps) {
  return (
    <article className="summary-insight-item">
      <h3 className="summary-insight-item__title">{title}</h3>
      {description.trim() ? (
        <p className="summary-insight-item__description">{description}</p>
      ) : null}
    </article>
  );
}
