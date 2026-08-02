export const INTELLIGENCE_CATEGORIES = [
  "strength",
  "value",
  "motivator",
  "goal",
  "purpose",
  "limiting_belief",
  "empowering_belief",
  "behaviour_pattern",
  "emotional_pattern",
  "communication_style",
  "decision_style",
  "learning_preference",
  "recurring_theme",
  "development_opportunity",
  "risk_indicator",
  "breakthrough",
  "relationship_observation",
] as const;

export type IntelligenceCategory = (typeof INTELLIGENCE_CATEGORIES)[number];

export const INTELLIGENCE_STATUSES = [
  "proposed",
  "approved",
  "rejected",
  "archived",
] as const;

export type IntelligenceStatus = (typeof INTELLIGENCE_STATUSES)[number];

export const CONFIDENCE_LABELS = [
  "early signal",
  "emerging",
  "supported",
  "strongly supported",
] as const;

export type ConfidenceLabel = (typeof CONFIDENCE_LABELS)[number];

export const EVIDENCE_TYPES = [
  "session_note",
  "coach_observation",
  "client_statement",
  "reflection",
  "commitment",
  "preparation",
  "manual_entry",
  "AI_interpretation",
] as const;

export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

export const REVIEW_STATUSES = [
  "pending",
  "in_review",
  "approved",
  "partially_approved",
  "rejected",
  "completed",
] as const;

export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const QUESTION_SOURCES = [
  "coach",
  "AI_suggested",
  "template",
  "previous_session",
] as const;

export type QuestionSource = (typeof QUESTION_SOURCES)[number];

export const SIGNAL_DIRECTIONS = [
  "improving",
  "stable",
  "declining",
  "unclear",
] as const;

export type SignalDirection = (typeof SIGNAL_DIRECTIONS)[number];

export type IntelligenceEvidence = {
  id: string;
  intelligenceItemId: string;
  sessionId: string | null;
  userId: string;
  evidenceText: string;
  evidenceType: EvidenceType | null;
  sourceExcerpt: string | null;
  occurredAt: string | null;
  createdAt: string;
  createdBy: string | null;
  isRedacted: boolean;
  sessionUnavailable?: boolean;
};

export type IntelligenceItem = {
  id: string;
  userId: string;
  clientId: string;
  category: IntelligenceCategory;
  title: string;
  description: string;
  status: IntelligenceStatus;
  confidenceScore: number | null;
  confidenceLabel: ConfidenceLabel | null;
  sourceType: string | null;
  firstIdentifiedAt: string | null;
  lastUpdatedAt: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  isLocked: boolean;
  coachNotes: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  evidence: IntelligenceEvidence[];
  evidenceCount: number;
};

export type SessionIntelligenceReview = {
  id: string;
  sessionId: string;
  userId: string;
  clientId: string;
  reviewStatus: ReviewStatus;
  generatedAt: string | null;
  reviewedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type QuestionInsight = {
  id: string;
  userId: string;
  clientId: string;
  sessionId: string | null;
  questionText: string;
  questionType: string | null;
  source: QuestionSource | null;
  effectivenessRating: number | null;
  coachNotes: string;
  createdAt: string;
};

export type PersonProgressSignal = {
  id: string;
  userId: string;
  clientId: string;
  sessionId: string | null;
  signalName: string;
  direction: SignalDirection | null;
  score: number | null;
  coachValidated: boolean;
  evidenceSummary: string;
  recordedAt: string;
};

export type IntelligenceAuditEntry = {
  id: string;
  userId: string;
  entityType: string;
  entityId: string;
  action: string;
  previousValue: unknown;
  newValue: unknown;
  createdAt: string;
};

export type RelationshipToExisting = {
  type: "new" | "supports" | "challenges" | "duplicates";
  existingInsightId: string | null;
};

export type ProposedInsightPayload = {
  category: IntelligenceCategory;
  title: string;
  description: string;
  confidenceScore: number;
  confidenceLabel: ConfidenceLabel;
  evidence: Array<{
    evidenceText: string;
    evidenceType: EvidenceType;
    sourceExcerpt: string;
  }>;
  relationshipToExistingInsight: RelationshipToExisting;
};

export type AiInterpretationResult = {
  proposedInsights: ProposedInsightPayload[];
  suggestedQuestions: Array<{
    question: string;
    reason: string;
    relatedInsightIds: string[];
  }>;
  developmentSignals: Array<{
    signalName: string;
    direction: SignalDirection;
    evidenceSummary: string;
  }>;
  nextSessionFocus: {
    title: string;
    reason: string;
  };
};

export type IntelligenceSnapshot = {
  currentDevelopmentFocus: string;
  strongestSupportedStrength: string;
  mostSupportedValue: string;
  primaryRecurringTheme: string;
  nextSuggestedFocus: string;
  awaitingReviewCount: number;
};

export const CATEGORY_SECTIONS: Array<{
  id: string;
  title: string;
  categories: IntelligenceCategory[];
}> = [
  { id: "strengths", title: "Strengths", categories: ["strength"] },
  { id: "values", title: "Values", categories: ["value"] },
  { id: "motivators", title: "Motivators", categories: ["motivator"] },
  {
    id: "beliefs",
    title: "Beliefs",
    categories: ["limiting_belief", "empowering_belief"],
  },
  {
    id: "patterns",
    title: "Patterns",
    categories: [
      "behaviour_pattern",
      "emotional_pattern",
      "communication_style",
      "decision_style",
      "learning_preference",
      "recurring_theme",
    ],
  },
  {
    id: "growth",
    title: "Growth",
    categories: [
      "goal",
      "purpose",
      "development_opportunity",
      "risk_indicator",
      "breakthrough",
    ],
  },
  {
    id: "relationship",
    title: "Relationship insights",
    categories: ["relationship_observation"],
  },
];

export function confidenceLabelDisplay(label: ConfidenceLabel | null | undefined): string {
  if (!label) return "Early signal";
  return label
    .split(" ")
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function statusDisplay(status: IntelligenceStatus): string {
  switch (status) {
    case "proposed":
      return "Requires validation";
    case "approved":
      return "Coach-approved";
    case "rejected":
      return "Rejected";
    case "archived":
      return "Archived";
  }
}
