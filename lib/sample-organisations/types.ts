/**
 * Sample Organisation installer types and constants.
 *
 * Organisation model:
 * Northbridge Healthcare Trust is created as a separate fictional organisation
 * owned by the installing user. The caller's current organisation is untouched.
 * After install, the user opens the sample via existing organisation switching.
 */

export const SAMPLE_PACK_KEYS = ["northbridge-healthcare"] as const;
export type SamplePackKey = (typeof SAMPLE_PACK_KEYS)[number];

/** User-facing setup estimate for available, confirmation and progress states. */
export const SAMPLE_ORGANISATION_SETUP_ESTIMATE = "Around one minute";

export const SAMPLE_INSTALLATION_STATUSES = [
  "installing",
  "ready",
  "failed",
  "resetting",
  "removing",
  "removed",
  "intelligence_pending",
] as const;
export type SampleInstallationStatus =
  (typeof SAMPLE_INSTALLATION_STATUSES)[number];

export const SAMPLE_INSTALLATION_STAGES = [
  "validating",
  "creating_organisation",
  "creating_relationships",
  "creating_assignments",
  "creating_conversations",
  "creating_actions",
  "creating_development_updates",
  "creating_intelligence",
  "generating_organisation_intelligence",
  "completing_checks",
  "ready",
  "failed",
  "removed",
] as const;
export type SampleInstallationStage =
  (typeof SAMPLE_INSTALLATION_STAGES)[number];

export const SAMPLE_STAGE_LABELS: Record<SampleInstallationStage, string> = {
  validating: "Validating sample pack",
  creating_organisation: "Creating organisation",
  creating_relationships: "Creating relationships",
  creating_assignments: "Creating assignments",
  creating_conversations: "Creating conversations",
  creating_actions: "Creating development actions",
  creating_development_updates: "Creating development updates",
  creating_intelligence: "Creating intelligence evidence",
  generating_organisation_intelligence: "Generating Organisation Intelligence",
  completing_checks: "Completing checks",
  ready: "Ready",
  failed: "Failed",
  removed: "Removed",
};

export const SAMPLE_PROGRESS_STAGES: SampleInstallationStage[] = [
  "validating",
  "creating_organisation",
  "creating_relationships",
  "creating_assignments",
  "creating_conversations",
  "creating_actions",
  "creating_development_updates",
  "creating_intelligence",
  "generating_organisation_intelligence",
  "completing_checks",
];

export const SAMPLE_AUDIT_ACTIONS = [
  "sample_organisation_install_started",
  "sample_organisation_installed",
  "sample_organisation_install_failed",
  "sample_organisation_reset_started",
  "sample_organisation_reset",
  "sample_organisation_removed",
  "sample_organisation_opened",
] as const;
export type SampleAuditAction = (typeof SAMPLE_AUDIT_ACTIONS)[number];

export const SAMPLE_RECORD_TYPES = [
  "organisation",
  "membership",
  "relationship",
  "assignment",
  "session",
  "action",
  "development_profile",
  "development_update",
  "intelligence_item",
  "intelligence_snapshot",
  "private_identity",
] as const;
export type SampleRecordType = (typeof SAMPLE_RECORD_TYPES)[number];

export type SampleExpectedCounts = {
  organisations: number;
  relationships: number;
  standardRelationships: number;
  confidentialRelationships: number;
  sessions: number;
  actions: number;
  developmentUpdates: number;
  intelligenceItems: number;
  organisationIntelligenceSnapshots: number;
};

export type SamplePackManifest = {
  packKey: SamplePackKey | string;
  packVersion: string;
  title: string;
  summary: string;
  locale: string;
  estimatedSetupSeconds: number;
  period: { start: string; end: string; label: string };
  expectedCounts: SampleExpectedCounts;
  features: string[];
  recurringThemes: string[];
  privacy: {
    minimumThemeRelationships: number;
    confidentialIdentityMode: string;
    notes: string;
  };
  files: Record<string, string>;
};

export type SampleOrganisationSpec = {
  name: string;
  slugHint: string;
  organisationType: string;
  defaultPreparationStyle: string | null;
  aiEnabled: boolean;
  dataRetentionPolicyLabel: string;
  licence: {
    planName: string;
    seatsPurchased: number;
    status: string;
  };
  description?: string;
};

export type SampleRelationshipSpec = {
  key: string;
  identityMode: "standard" | "confidential";
  name: string;
  displayLabel: string;
  role: string;
  organisationLabel: string;
  email: string;
  currentFocus: string;
  aiNameAllowed: boolean;
  themes: string[];
};

export type SampleAssignmentSpec = {
  relationshipKey: string;
  assignmentRole: "primary" | "co_practitioner" | "cover" | "supervisor";
  assignee: "installing_user";
};

export type SampleSessionSpec = {
  key: string;
  relationshipKey: string;
  sessionNumber: number;
  sessionDate: string;
  displayDate: string;
  displayTime: string;
  startsAt: string;
  status: string;
  title: string;
  durationMinutes: number;
  focus: string;
  preparation: string;
  notes: string;
  privateNotes?: string;
  emergingThemes: string;
  strengthsObserved: string;
  valuesBecomingVisible: string;
  professionalIdentityDevelopment: string;
  agreedActions: string;
  suggestedFocus: string;
  coachReflection: string;
  summary: string;
  aiSummaryApproved: boolean;
  completedAt?: string;
  themeKeys?: string[];
};

export type SampleActionSpec = {
  key: string;
  relationshipKey: string;
  sessionKey: string;
  title: string;
  notes?: string;
  owner?: string;
  status: string;
  due?: string;
  themeKey?: string;
};

export type SampleDevelopmentUpdateSpec = {
  key: string;
  relationshipKey: string;
  sessionKey: string;
  status: string;
  conversationSummary: string;
  hasMeaningfulChanges: boolean;
  proposedChanges: Record<string, unknown>;
  evidenceSummary: Array<Record<string, unknown>>;
  coachNote?: string;
  generatedAt?: string;
  reviewedAt?: string;
  appliedAt?: string;
};

export type SampleIntelligenceItemSpec = {
  key: string;
  relationshipKey: string;
  sessionKey: string;
  category: string;
  title: string;
  description: string;
  status: string;
  confidenceScore: number;
  confidenceLabel: string;
  sourceType: string;
  firstIdentifiedAt?: string;
  approvedAt?: string;
  themeKey?: string;
  evidenceText?: string;
};

export type ValidatedSamplePack = {
  manifest: SamplePackManifest;
  organisation: SampleOrganisationSpec;
  relationships: SampleRelationshipSpec[];
  assignments: SampleAssignmentSpec[];
  sessions: SampleSessionSpec[];
  actions: SampleActionSpec[];
  developmentUpdates: SampleDevelopmentUpdateSpec[];
  intelligenceItems: SampleIntelligenceItemSpec[];
};

export type SampleInstallationCounts = {
  relationships: number;
  sessions: number;
  actions: number;
  developmentUpdates: number;
  intelligenceItems: number;
};

export type SampleInstallationView = {
  id: string;
  organisationId: string;
  sourceOrganisationId: string | null;
  packKey: string;
  packVersion: string;
  status: SampleInstallationStatus;
  stage: SampleInstallationStage;
  stageLabel: string;
  installedBy: string;
  installedByName: string | null;
  installedAt: string | null;
  updatedAt: string;
  counts: SampleInstallationCounts;
  errorSummary: string | null;
  failureCategory: string | null;
  progressPercent: number;
  canRetryIntelligence: boolean;
};

export type SamplePackSummary = {
  packKey: string;
  packVersion: string;
  title: string;
  summary: string;
  features: string[];
  estimatedSetupSeconds: number;
  expectedCounts: SampleExpectedCounts;
  privacyNote: string;
  installation: SampleInstallationView | null;
};
