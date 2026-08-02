import type {
  ConfidenceLabel,
  EvidenceType,
  IntelligenceCategory,
  IntelligenceEvidence,
  IntelligenceItem,
  IntelligenceStatus,
  PersonProgressSignal,
  QuestionInsight,
  QuestionSource,
  ReviewStatus,
  SessionIntelligenceReview,
  SignalDirection,
} from "@/lib/intelligence/types";

export type IntelligenceItemRow = {
  id: string;
  user_id: string;
  client_id: string;
  category: string;
  title: string;
  description: string | null;
  status: string;
  confidence_score: number | null;
  confidence_label: string | null;
  source_type: string | null;
  first_identified_at: string | null;
  last_updated_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  is_locked: boolean;
  coach_notes: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type IntelligenceEvidenceRow = {
  id: string;
  intelligence_item_id: string;
  session_id: string | null;
  user_id: string;
  evidence_text: string;
  evidence_type: string | null;
  source_excerpt: string | null;
  occurred_at: string | null;
  created_at: string;
  created_by: string | null;
  is_redacted: boolean;
};

export type SessionIntelligenceReviewRow = {
  id: string;
  session_id: string;
  user_id: string;
  client_id: string;
  review_status: string;
  generated_at: string | null;
  reviewed_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type QuestionInsightRow = {
  id: string;
  user_id: string;
  client_id: string;
  session_id: string | null;
  question_text: string;
  question_type: string | null;
  source: string | null;
  effectiveness_rating: number | null;
  coach_notes: string | null;
  created_at: string;
};

export type PersonProgressSignalRow = {
  id: string;
  user_id: string;
  client_id: string;
  session_id: string | null;
  signal_name: string;
  direction: string | null;
  score: number | null;
  coach_validated: boolean;
  evidence_summary: string | null;
  recorded_at: string;
};

export function rowToEvidence(row: IntelligenceEvidenceRow): IntelligenceEvidence {
  return {
    id: row.id,
    intelligenceItemId: row.intelligence_item_id,
    sessionId: row.session_id,
    userId: row.user_id,
    evidenceText: row.evidence_text,
    evidenceType: (row.evidence_type as EvidenceType | null) ?? null,
    sourceExcerpt: row.source_excerpt,
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
    createdBy: row.created_by,
    isRedacted: Boolean(row.is_redacted),
    sessionUnavailable: row.session_id == null && Boolean(row.created_at),
  };
}

export function rowToIntelligenceItem(
  row: IntelligenceItemRow,
  evidence: IntelligenceEvidence[] = []
): IntelligenceItem {
  return {
    id: row.id,
    userId: row.user_id,
    clientId: row.client_id,
    category: row.category as IntelligenceCategory,
    title: row.title,
    description: row.description ?? "",
    status: row.status as IntelligenceStatus,
    confidenceScore:
      row.confidence_score == null ? null : Number(row.confidence_score),
    confidenceLabel: (row.confidence_label as ConfidenceLabel | null) ?? null,
    sourceType: row.source_type,
    firstIdentifiedAt: row.first_identified_at,
    lastUpdatedAt: row.last_updated_at,
    approvedAt: row.approved_at,
    approvedBy: row.approved_by,
    isLocked: Boolean(row.is_locked),
    coachNotes: row.coach_notes ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
    evidence,
    evidenceCount: evidence.length,
  };
}

export function rowToReview(row: SessionIntelligenceReviewRow): SessionIntelligenceReview {
  return {
    id: row.id,
    sessionId: row.session_id,
    userId: row.user_id,
    clientId: row.client_id,
    reviewStatus: row.review_status as ReviewStatus,
    generatedAt: row.generated_at,
    reviewedAt: row.reviewed_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToQuestion(row: QuestionInsightRow): QuestionInsight {
  return {
    id: row.id,
    userId: row.user_id,
    clientId: row.client_id,
    sessionId: row.session_id,
    questionText: row.question_text,
    questionType: row.question_type,
    source: (row.source as QuestionSource | null) ?? null,
    effectivenessRating: row.effectiveness_rating,
    coachNotes: row.coach_notes ?? "",
    createdAt: row.created_at,
  };
}

export function rowToSignal(row: PersonProgressSignalRow): PersonProgressSignal {
  return {
    id: row.id,
    userId: row.user_id,
    clientId: row.client_id,
    sessionId: row.session_id,
    signalName: row.signal_name,
    direction: (row.direction as SignalDirection | null) ?? null,
    score: row.score == null ? null : Number(row.score),
    coachValidated: Boolean(row.coach_validated),
    evidenceSummary: row.evidence_summary ?? "",
    recordedAt: row.recorded_at,
  };
}
