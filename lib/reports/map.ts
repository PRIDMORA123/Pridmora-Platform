import type {
  AssociatedIndicator,
  CoachingImpactMetrics,
  DevelopmentReport,
  ReportAudience,
  ReportCommitment,
  ReportEvidenceItem,
  ReportStatus,
  ReportTheme,
  ReportType,
} from "@/lib/reports/types";

export type DevelopmentReportRow = {
  id: string;
  client_id: string;
  coach_id: string;
  type: string;
  audience: string;
  title: string;
  reporting_period_start: string | null;
  reporting_period_end: string | null;
  status: string;
  coaching_purpose: string | null;
  executive_summary: string | null;
  progress_summary: string | null;
  development_themes: unknown;
  evidence_items: unknown;
  commitments: unknown;
  future_priorities: unknown;
  coach_statement: string | null;
  associated_indicators: unknown;
  impact_metrics: unknown;
  include_coach_statement: boolean | null;
  parent_report_id: string | null;
  confidentiality_confirmed_at: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function rowToDevelopmentReport(row: DevelopmentReportRow): DevelopmentReport {
  return {
    id: row.id,
    relationshipId: row.client_id,
    coachId: row.coach_id,
    type: row.type as ReportType,
    audience: row.audience as ReportAudience,
    title: row.title,
    reportingPeriodStart: row.reporting_period_start,
    reportingPeriodEnd: row.reporting_period_end,
    status: row.status as ReportStatus,
    coachingPurpose: row.coaching_purpose,
    executiveSummary: row.executive_summary,
    progressSummary: row.progress_summary,
    developmentThemes: asArray<ReportTheme>(row.development_themes),
    evidenceItems: asArray<ReportEvidenceItem>(row.evidence_items),
    commitments: asArray<ReportCommitment>(row.commitments),
    futurePriorities: asArray<string>(row.future_priorities).filter(
      item => typeof item === "string"
    ),
    coachStatement: row.coach_statement,
    associatedIndicators: asArray<AssociatedIndicator>(row.associated_indicators),
    impactMetrics: (row.impact_metrics as CoachingImpactMetrics | null) ?? null,
    includeCoachStatement: Boolean(row.include_coach_statement),
    parentReportId: row.parent_report_id,
    confidentialityConfirmedAt: row.confidentiality_confirmed_at,
    approvedAt: row.approved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function developmentReportToRow(
  report: Partial<DevelopmentReport> & {
    relationshipId: string;
    coachId: string;
    type: ReportType;
    audience: ReportAudience;
    title: string;
  }
) {
  return {
    ...(report.id ? { id: report.id } : {}),
    client_id: report.relationshipId,
    coach_id: report.coachId,
    type: report.type,
    audience: report.audience,
    title: report.title,
    reporting_period_start: report.reportingPeriodStart ?? null,
    reporting_period_end: report.reportingPeriodEnd ?? null,
    status: report.status ?? "draft",
    coaching_purpose: report.coachingPurpose ?? null,
    executive_summary: report.executiveSummary ?? null,
    progress_summary: report.progressSummary ?? null,
    development_themes: report.developmentThemes ?? [],
    evidence_items: report.evidenceItems ?? [],
    commitments: report.commitments ?? [],
    future_priorities: report.futurePriorities ?? [],
    coach_statement: report.coachStatement ?? null,
    associated_indicators: report.associatedIndicators ?? [],
    impact_metrics: report.impactMetrics ?? null,
    include_coach_statement: report.includeCoachStatement ?? false,
    parent_report_id: report.parentReportId ?? null,
    confidentiality_confirmed_at: report.confidentialityConfirmedAt ?? null,
    approved_at: report.approvedAt ?? null,
  };
}
