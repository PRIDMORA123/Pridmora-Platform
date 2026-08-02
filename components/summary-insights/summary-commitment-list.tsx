export type SummaryCommitmentListProps = {
  commitments: string[];
  emptyLabel?: string;
};

export function SummaryCommitmentList({
  commitments,
  emptyLabel = "No commitment was recorded.",
}: SummaryCommitmentListProps) {
  if (commitments.length === 0) {
    return <p className="summary-insights-empty">{emptyLabel}</p>;
  }

  return (
    <ul className="summary-commitment-list">
      {commitments.map((commitment, index) => (
        <li key={`${index}-${commitment}`}>{commitment}</li>
      ))}
    </ul>
  );
}
