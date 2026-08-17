import type {
  DevelopmentEvidenceType,
  EvidenceAuditAction,
  EvidenceConfidenceLevel,
  EvidenceCoverageCategory,
  EvidenceCoverageLevel,
  EvidenceFreshnessClass,
  EvidenceProcessingStatus,
  EvidenceReviewStatus,
  EvidenceSourceType,
  ObservationReviewStatus,
  SourceConfidenceLevel,
} from "@/lib/development-evidence/constants";

export type StructuredEvidenceObservation = {
  title: string;
  description: string;
  category?: string;
  behaviouralEvidence?: string;
  developmentImplication?: string;
  sourceConfidence?: SourceConfidenceLevel;
  assessmentContext?: string;
  limitations?: string;
  capabilityKey?: string;
};

export type StructuredEvidence = {
  observations?: StructuredEvidenceObservation[];
  strengthSignals?: string[];
  developmentSignals?: string[];
  capabilitySignals?: string[];
  contradictoryEvidence?: string[];
  context?: string[];
  limitations?: string[];
};

export type DevelopmentEvidenceRecord = {
  id: string;
  organisationId: string | null;
  clientId: string;
  evidenceType: DevelopmentEvidenceType;
  sourceType: EvidenceSourceType;
  sourceRecordId: string | null;
  title: string;
  evidenceDate: string | null;
  capturedAt: string;
  capturedBy: string | null;
  originalDocumentId: string | null;
  processingStatus: EvidenceProcessingStatus;
  reviewStatus: EvidenceReviewStatus;
  includeInIntelligence: boolean;
  structuredEvidence: StructuredEvidence;
  sourceSummary: string | null;
  freshnessClass: EvidenceFreshnessClass;
  restricted: boolean;
  contentHash: string | null;
  extractionVersion: string | null;
  purpose: string | null;
  sourceLabel: string | null;
  capabilityKeys: string[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type DevelopmentEvidenceObservation = {
  id: string;
  evidenceId: string;
  organisationId: string | null;
  clientId: string;
  title: string;
  description: string;
  category: string | null;
  behaviouralEvidence: string | null;
  developmentImplication: string | null;
  sourceConfidence: SourceConfidenceLevel;
  assessmentContext: string | null;
  limitations: string | null;
  capabilityKey: string | null;
  includeInIntelligence: boolean;
  reviewStatus: ObservationReviewStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type DevelopmentEvidenceDocument = {
  id: string;
  organisationId: string | null;
  clientId: string;
  evidenceId: string | null;
  fileName: string;
  mimeType: string;
  byteSize: number;
  contentHash: string;
  storagePath: string | null;
  extractedText: string | null;
  extractionMethod: string | null;
  extractionVersion: string;
  extractionStatus: "pending" | "extracted" | "failed" | "unsupported";
  uploadedBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type DevelopmentEvidenceLink = {
  id: string;
  organisationId: string | null;
  clientId: string;
  fromEvidenceId: string;
  toEvidenceId: string | null;
  capabilityKey: string | null;
  linkType:
    | "supports"
    | "contradicts"
    | "related_capability"
    | "derived_from"
    | "references";
  label: string | null;
  createdAt: string;
};

export type EvidenceListItem = {
  id: string;
  title: string;
  evidenceType: DevelopmentEvidenceType;
  evidenceTypeLabel: string;
  evidenceDate: string | null;
  sourceLabel: string | null;
  sourceType: EvidenceSourceType;
  capturedByLabel: string | null;
  processingStatus: EvidenceProcessingStatus;
  reviewStatus: EvidenceReviewStatus;
  includeInIntelligence: boolean;
  freshnessClass: EvidenceFreshnessClass;
  freshnessLabel: string;
  restricted: boolean;
  observationCount: number;
  approvedObservationCount: number;
  fileName: string | null;
};

export type EvidenceConfidenceResult = {
  level: EvidenceConfidenceLevel;
  label: string;
  basis: string;
  independentSourceCount: number;
  factors: {
    independentSources: number;
    recentSources: number;
    repeatedBehaviours: number;
    consistencyScore: number;
    humanValidated: boolean;
    contradictionCount: number;
    specificityScore: number;
    relevanceScore: number;
  };
};

export type EvidenceCoverageResult = {
  level: EvidenceCoverageLevel;
  label: string;
  represented: EvidenceCoverageCategory[];
  representedLabels: string[];
  notRepresented: EvidenceCoverageCategory[];
  notRepresentedLabels: string[];
  summary: string;
};

export type CapabilityEvidenceInsight = {
  capabilityKey: string;
  capabilityLabel: string;
  foundationLabels: string[];
  organisationFrameworkLabels: string[];
  currentEvidence: string;
  trend: "strengthening" | "mixed" | "requiring_attention" | "insufficient_evidence";
  confidence: EvidenceConfidenceResult;
  coverage: EvidenceCoverageResult;
  supportingEvidenceIds: string[];
  supportingEvidenceTitles: string[];
  developmentOpportunity: string | null;
  contradictions: string[];
};

export type EvidenceGraphNode = {
  capabilityKey: string;
  capabilityLabel: string;
  relatedCapabilities: string[];
  supportingEvidence: Array<{
    id: string;
    title: string;
    evidenceTypeLabel: string;
    freshnessClass: EvidenceFreshnessClass;
    includeInIntelligence: boolean;
  }>;
  confidence: EvidenceConfidenceLevel;
};

export type DevelopmentIntelligenceEvidenceView = {
  currentPosition: string;
  developmentTrajectory: string;
  capabilities: CapabilityEvidenceInsight[];
  strengthsBeingDemonstrated: string[];
  developmentPriorities: string[];
  evidenceConfidence: EvidenceConfidenceResult;
  evidenceCoverage: EvidenceCoverageResult;
  recentEvidence: EvidenceListItem[];
  missingOrConflicting: string[];
  nextDevelopmentFocus: string;
  graph: EvidenceGraphNode[];
};

export type TeamIntelligenceView = {
  strengtheningCapabilities: string[];
  recurringThemes: string[];
  limitedEvidenceAreas: string[];
  improvingBehaviours: string[];
  conversationsNeedingAttention: string[];
  shareableStrengths: string[];
  aggregatedConfidence: EvidenceConfidenceResult;
  privacyNote: string;
  contributingRelationshipCount: number;
};

export type EvidenceWhyThisPayload = {
  insight: string;
  confidence: EvidenceConfidenceResult;
  coverage: EvidenceCoverageResult;
  freshness: EvidenceFreshnessClass;
  freshnessLabel: string;
  supportingSources: Array<{
    id: string;
    title: string;
    evidenceTypeLabel: string;
    sourceKind: "uploaded" | "conversation" | "reflection" | "other";
    drilldownPath: string | null;
  }>;
  contradictoryEvidence: string[];
  limitations: string[];
  observedBehaviours: string[];
  developmentImplication: string | null;
};

export type EvidenceAuditMetadata = {
  evidenceType?: string;
  reviewStatus?: string;
  processingStatus?: string;
  includeInIntelligence?: boolean;
  observationCount?: number;
  fileName?: string;
  contentHashPrefix?: string;
  storagePathRemoved?: boolean;
  /** Never include raw evidence text. */
  action?: EvidenceAuditAction;
};
