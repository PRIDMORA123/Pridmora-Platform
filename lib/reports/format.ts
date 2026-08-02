import type { DevelopmentReport } from "@/lib/reports/types";

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const trimmed = value.trim();
  if (!trimmed) return "—";

  const iso = Date.parse(trimmed);
  if (!Number.isNaN(iso)) {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(iso));
  }

  return trimmed;
}

export function formatReportPeriod(report: Pick<
  DevelopmentReport,
  "reportingPeriodStart" | "reportingPeriodEnd"
>): string {
  const start = formatDate(report.reportingPeriodStart);
  const end = formatDate(report.reportingPeriodEnd);
  if (start === "—" && end === "—") return "Reporting period not set";
  if (start === "—") return `To ${end}`;
  if (end === "—") return `From ${start}`;
  if (start === end) return start;
  return `${start} – ${end}`;
}
