"use client";

export type RelationshipReportsPreviewModel = {
  progressReportLabel: string;
  approvedSummariesLabel: string;
  developmentSummaryLabel: string;
};

export function RelationshipReportsPreview({
  model,
  onViewReports,
}: {
  model: RelationshipReportsPreviewModel;
  onViewReports: () => void;
}) {
  return (
    <section
      className="relationship-reports-preview relationship-reports-preview--secondary"
      aria-labelledby="reports-title"
    >
      <h2 id="reports-title">Reports</h2>

      <ul className="relationship-reports-preview__list">
        <li>
          <span className="relationship-reports-preview__item-title">
            Relationship progress report
          </span>
          <span className="relationship-reports-preview__item-meta">
            {model.progressReportLabel}
          </span>
        </li>
        <li>
          <span className="relationship-reports-preview__item-title">
            Approved summaries
          </span>
          <span className="relationship-reports-preview__item-meta">
            {model.approvedSummariesLabel}
          </span>
        </li>
        <li>
          <span className="relationship-reports-preview__item-title">
            Development summary
          </span>
          <span className="relationship-reports-preview__item-meta">
            {model.developmentSummaryLabel}
          </span>
        </li>
      </ul>

      <button
        type="button"
        className="identity-button is-secondary"
        onClick={onViewReports}
      >
        View reports
      </button>
    </section>
  );
}

export function buildReportsPreviewModel(input: {
  completedSessionCount: number;
  approvedSummaryCount: number;
  hasDevelopmentSummary: boolean;
  latestSessionNumber?: number | null;
}): RelationshipReportsPreviewModel {
  return {
    progressReportLabel:
      input.latestSessionNumber != null
        ? `Updated after Session ${input.latestSessionNumber}`
        : input.completedSessionCount > 0
          ? "Available when conversations are approved"
          : "Available after conversations begin",
    approvedSummariesLabel:
      input.approvedSummaryCount === 0
        ? "None yet"
        : input.approvedSummaryCount === 1
          ? "1 available"
          : `${input.approvedSummaryCount} available`,
    developmentSummaryLabel: input.hasDevelopmentSummary
      ? "Available"
      : "Forming",
  };
}
