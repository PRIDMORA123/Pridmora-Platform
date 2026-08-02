import type { ReportType } from "@/lib/reports/types";

const reportOptions = [
  {
    type: "progress_snapshot",
    title: "Progress Snapshot",
    description:
      "A concise one-page summary of current progress, evidence and next priorities.",
  },
  {
    type: "development_report",
    title: "Development Report",
    description:
      "A complete narrative of the coaching purpose, development journey and evidence of progress.",
  },
  {
    type: "impact_summary",
    title: "Impact Summary",
    description:
      "A carefully limited sponsor summary focused on participation, agreed outcomes and associated indicators.",
  },
] satisfies Array<{
  type: ReportType;
  title: string;
  description: string;
}>;

export function ReportTypeSelection({
  onSelect,
}: {
  onSelect: (type: ReportType) => void;
}) {
  return (
    <div className="report-type-grid">
      {reportOptions.map(report => (
        <button
          type="button"
          className="report-type-card"
          key={report.type}
          onClick={() => onSelect(report.type)}
        >
          <span className="report-type-card-mark" aria-hidden="true" />
          <strong>{report.title}</strong>
          <span>{report.description}</span>
          <small>Create report</small>
        </button>
      ))}
    </div>
  );
}
