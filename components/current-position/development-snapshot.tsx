export function DevelopmentSnapshotCard({
  summary,
  onViewDevelopment,
}: {
  summary: string;
  onViewDevelopment?: () => void;
}) {
  if (!summary.trim()) return null;

  return (
    <section
      className="identity-development-snapshot"
      aria-labelledby="development-snapshot-heading"
    >
      <h2 id="development-snapshot-heading">Development snapshot</h2>
      <p className="identity-development-snapshot__text">{summary}</p>
      {onViewDevelopment ? (
        <button
          type="button"
          className="secondary"
          onClick={onViewDevelopment}
        >
          View development
        </button>
      ) : null}
    </section>
  );
}
