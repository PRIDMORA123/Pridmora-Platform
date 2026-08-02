export type ReportType =
  | "progress_snapshot"
  | "development_report"
  | "impact_summary";

export type ReportAudience = "coachee" | "coach" | "sponsor";

export type ReportStatus = "draft" | "approved";

export type ReportCreationStep = "details" | "evidence" | "review" | "approve";

export type ReportTheme = {
  id: string;
  title: string;
  summary: string;
};

export type ReportEvidenceSourceType =
  | "approved_development_update"
  | "completed_commitment"
  | "approved_reflection"
  | "coach_added"
  | "coaching_purpose"
  | "development_priority";

export type ReportEvidenceItem = {
  id: string;
  developmentArea: string;
  evidence: string;
  sourceType: ReportEvidenceSourceType;
  sourceId?: string | null;
};

export type ReportCommitment = {
  id: string;
  statement: string;
  status: "completed" | "in_progress";
};

export type AssociatedIndicator = {
  id: string;
  name: string;
  baselineValue: string;
  currentValue: string;
  context?: string;
};

export type CoachingImpactMetrics = {
  conversationsCompleted: number;
  reflectionsCompleted: number;
  commitmentsCreated: number;
  commitmentsCompleted: number;
  approvedDevelopmentUpdates: number;
  reportingPeriodStart: string;
  reportingPeriodEnd: string;
};

export type DevelopmentReport = {
  id: string;
  relationshipId: string;
  coachId: string;

  type: ReportType;
  audience: ReportAudience;
  title: string;

  reportingPeriodStart: string | null;
  reportingPeriodEnd: string | null;

  status: ReportStatus;

  coachingPurpose: string | null;
  executiveSummary: string | null;
  progressSummary: string | null;
  developmentThemes: ReportTheme[];
  evidenceItems: ReportEvidenceItem[];
  commitments: ReportCommitment[];
  futurePriorities: string[];
  coachStatement: string | null;

  associatedIndicators: AssociatedIndicator[];
  impactMetrics: CoachingImpactMetrics | null;
  includeCoachStatement: boolean;

  /** Approved report this draft was derived from, if any. */
  parentReportId: string | null;

  confidentialityConfirmedAt: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ReportDetailsForm = {
  type: ReportType;
  title: string;
  audience: ReportAudience;
  reportingPeriodStart: string;
  reportingPeriodEnd: string;
  includeCoachStatement: boolean;
};

export type AvailableEvidenceItem = {
  id: string;
  title: string;
  summary: string;
  sourceLabel: string;
  sourceType: ReportEvidenceSourceType;
  sourceId: string | null;
  developmentArea: string;
  evidence: string;
  suggested: boolean;
};

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  progress_snapshot: "Progress Snapshot",
  development_report: "Development Report",
  impact_summary: "Impact Summary",
};

export const REPORT_AUDIENCE_LABELS: Record<ReportAudience, string> = {
  coachee: "Coachee",
  coach: "Coach",
  sponsor: "Sponsor",
};

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  draft: "Draft",
  approved: "Approved",
};

export function defaultAudienceForType(type: ReportType): ReportAudience {
  if (type === "impact_summary") return "sponsor";
  if (type === "development_report") return "coachee";
  return "coachee";
}

export function defaultTitleForType(type: ReportType, personName: string): string {
  return `${REPORT_TYPE_LABELS[type]} — ${personName}`;
}
