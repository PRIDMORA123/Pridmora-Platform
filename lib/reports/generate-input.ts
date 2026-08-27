import { developmentReportTaskPrompt } from "@/lib/ai/development-report-prompt";
import { evidenceItemsForProgressSnapshot } from "@/lib/reports/progress-snapshot";
import {
  REPORT_TYPE_LABELS,
  type ReportEvidenceItem,
  type ReportType,
} from "@/lib/reports/types";

export function formatReportingPeriodForGenerate(input: {
  reportingPeriodStart: string | null;
  reportingPeriodEnd: string | null;
}): string {
  return `${input.reportingPeriodStart ?? "not set"} to ${input.reportingPeriodEnd ?? "not set"}`;
}

/**
 * User input sent to the report-draft model. Progress Snapshot receives
 * bounded evidence excerpts; other types keep the selected evidence as stored.
 */
export function buildDevelopmentReportGenerateInput(input: {
  type: ReportType;
  audience: string;
  reportingPeriodStart: string | null;
  reportingPeriodEnd: string | null;
  title: string;
  coacheeName: string;
  evidenceItems: ReportEvidenceItem[];
  coachingPurpose?: string | null;
}): string {
  const evidenceItems =
    input.type === "progress_snapshot"
      ? evidenceItemsForProgressSnapshot(
          input.evidenceItems,
          input.coachingPurpose
        )
      : input.evidenceItems;

  const evidenceBlock = evidenceItems
    .map(
      (item, index) =>
        `${index + 1}. Area: ${item.developmentArea}\nSource: ${item.sourceType}\nEvidence: ${item.evidence}`
    )
    .join("\n\n");

  return [
    developmentReportTaskPrompt(input.type),
    "",
    `coacheeName: ${input.coacheeName}`,
    `Report type: ${REPORT_TYPE_LABELS[input.type]}`,
    `Audience: ${input.audience}`,
    `Reporting period: ${formatReportingPeriodForGenerate(input)}`,
    `Title: ${input.title}`,
    "",
    "Selected approved evidence:",
    evidenceBlock,
  ].join("\n");
}
