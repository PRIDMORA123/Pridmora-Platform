import { formatDate } from "@/lib/reports/format";
import {
  REPORT_TYPE_LABELS,
  type DevelopmentReport,
} from "@/lib/reports/types";

export function LatestApprovedReport({
  report,
  onOpen,
}: {
  report: DevelopmentReport;
  onOpen: () => void;
}) {
  return (
    <button type="button" className="latest-report-item" onClick={onOpen}>
      <span>
        <small>Latest report</small>
        <strong>{report.title}</strong>
        <span>
          {REPORT_TYPE_LABELS[report.type]} · {formatDate(report.approvedAt)}
        </span>
      </span>
      <span aria-hidden="true">View →</span>
    </button>
  );
}
