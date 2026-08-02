import {
  REPORT_AUDIENCE_LABELS,
  REPORT_STATUS_LABELS,
  REPORT_TYPE_LABELS,
  type DevelopmentReport,
} from "@/lib/reports/types";
import { formatDate, formatReportPeriod } from "@/lib/reports/format";

export function ReportsList({
  reports,
  onOpen,
}: {
  reports: DevelopmentReport[];
  onOpen: (report: DevelopmentReport) => void;
}) {
  if (!reports.length) {
    return (
      <div className="reports-empty-state">
        <h2>No reports created yet</h2>
        <p>
          Create a report when there is reviewed development evidence worth
          sharing.
        </p>
      </div>
    );
  }

  return (
    <section className="reports-list">
      <header>
        <h2>Report history</h2>
      </header>

      {reports.map(report => (
        <ReportListItem key={report.id} report={report} onOpen={onOpen} />
      ))}
    </section>
  );
}

function ReportListItem({
  report,
  onOpen,
}: {
  report: DevelopmentReport;
  onOpen: (report: DevelopmentReport) => void;
}) {
  return (
    <article className="report-list-item">
      <div>
        <strong>{report.title}</strong>
        <span>
          {REPORT_TYPE_LABELS[report.type]} · {formatReportPeriod(report)} ·{" "}
          {REPORT_AUDIENCE_LABELS[report.audience]}
        </span>
        <small>
          {REPORT_STATUS_LABELS[report.status]} · Created{" "}
          {formatDate(report.createdAt)}
        </small>
      </div>

      <button
        type="button"
        className="identity-button identity-button--secondary is-secondary is-sm"
        onClick={() => onOpen(report)}
      >
        Open
      </button>
    </article>
  );
}
