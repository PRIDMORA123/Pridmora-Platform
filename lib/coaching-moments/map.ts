import {
  parseCoachingMomentStatus,
  parseCoachingMomentType,
  parseInsight,
  parseInsightStatus,
  parseQuestions,
  parseRelevantContext,
  type CoachingMoment,
  type CoachingMomentInsight,
  type CoachingMomentInsightStatus,
  type CoachingMomentRelevantContext,
  type CoachingMomentStatus,
  type CoachingMomentType,
} from "@/lib/coaching-moments/coaching-moment";

export type CoachingMomentRow = {
  id: string;
  client_id: string;
  coach_id: string;
  created_by: string;
  occurred_at: string | null;
  status: string;
  situation: string;
  desired_outcome: string | null;
  inferred_type: string | null;
  generated_intention: string | null;
  generated_opening: string | null;
  generated_questions: unknown;
  generated_consideration: string | null;
  relevant_context: unknown;
  private_note: string | null;
  outcome_notes: string | null;
  agreed_commitment: string | null;
  no_commitment_agreed: boolean | null;
  follow_up: string | null;
  generated_insight: unknown;
  insight_status: string | null;
  guidance_fingerprint: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CoachingMomentInsert = {
  id?: string;
  client_id: string;
  coach_id: string;
  created_by: string;
  occurred_at?: string | null;
  status?: CoachingMomentStatus;
  situation?: string;
  desired_outcome?: string | null;
  inferred_type?: CoachingMomentType | null;
  generated_intention?: string | null;
  generated_opening?: string | null;
  generated_questions?: string[];
  generated_consideration?: string | null;
  relevant_context?: CoachingMomentRelevantContext | null;
  private_note?: string | null;
  outcome_notes?: string | null;
  agreed_commitment?: string | null;
  no_commitment_agreed?: boolean;
  follow_up?: string | null;
  generated_insight?: CoachingMomentInsight | null;
  insight_status?: CoachingMomentInsightStatus;
  guidance_fingerprint?: string | null;
  archived_at?: string | null;
};

export type CoachingMomentUpdate = Partial<{
  occurred_at: string | null;
  status: CoachingMomentStatus;
  situation: string;
  desired_outcome: string | null;
  inferred_type: CoachingMomentType | null;
  generated_intention: string | null;
  generated_opening: string | null;
  generated_questions: string[];
  generated_consideration: string | null;
  relevant_context: CoachingMomentRelevantContext | null;
  private_note: string | null;
  outcome_notes: string | null;
  agreed_commitment: string | null;
  no_commitment_agreed: boolean;
  follow_up: string | null;
  generated_insight: CoachingMomentInsight | null;
  insight_status: CoachingMomentInsightStatus;
  guidance_fingerprint: string | null;
  archived_at: string | null;
  updated_at: string;
}>;

export function rowToCoachingMoment(row: CoachingMomentRow): CoachingMoment {
  return {
    id: row.id,
    relationshipId: row.client_id,
    clientId: row.client_id,
    coachId: row.coach_id,
    createdBy: row.created_by,
    occurredAt: row.occurred_at,
    status: parseCoachingMomentStatus(row.status),
    situation: row.situation ?? "",
    desiredOutcome: row.desired_outcome,
    inferredType: parseCoachingMomentType(row.inferred_type),
    generatedIntention: row.generated_intention,
    generatedOpening: row.generated_opening,
    generatedQuestions: parseQuestions(row.generated_questions),
    generatedConsideration: row.generated_consideration,
    relevantContext: parseRelevantContext(row.relevant_context),
    privateNote: row.private_note ?? "",
    outcomeNotes: row.outcome_notes,
    agreedCommitment: row.agreed_commitment,
    noCommitmentAgreed: Boolean(row.no_commitment_agreed),
    followUp: row.follow_up,
    generatedInsight: parseInsight(row.generated_insight),
    insightStatus: parseInsightStatus(row.insight_status),
    guidanceFingerprint: row.guidance_fingerprint,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function coachingMomentUpdateToRow(
  update: CoachingMomentUpdate
): Record<string, unknown> {
  const row: Record<string, unknown> = {
    updated_at: update.updated_at ?? new Date().toISOString(),
  };

  if (update.occurred_at !== undefined) row.occurred_at = update.occurred_at;
  if (update.status !== undefined) row.status = update.status;
  if (update.situation !== undefined) row.situation = update.situation;
  if (update.desired_outcome !== undefined) {
    row.desired_outcome = update.desired_outcome;
  }
  if (update.inferred_type !== undefined) {
    row.inferred_type = update.inferred_type;
  }
  if (update.generated_intention !== undefined) {
    row.generated_intention = update.generated_intention;
  }
  if (update.generated_opening !== undefined) {
    row.generated_opening = update.generated_opening;
  }
  if (update.generated_questions !== undefined) {
    row.generated_questions = update.generated_questions.slice(0, 3);
  }
  if (update.generated_consideration !== undefined) {
    row.generated_consideration = update.generated_consideration;
  }
  if (update.relevant_context !== undefined) {
    row.relevant_context = update.relevant_context;
  }
  if (update.private_note !== undefined) {
    row.private_note = update.private_note;
  }
  if (update.outcome_notes !== undefined) {
    row.outcome_notes = update.outcome_notes;
  }
  if (update.agreed_commitment !== undefined) {
    row.agreed_commitment = update.agreed_commitment;
  }
  if (update.no_commitment_agreed !== undefined) {
    row.no_commitment_agreed = update.no_commitment_agreed;
  }
  if (update.follow_up !== undefined) row.follow_up = update.follow_up;
  if (update.generated_insight !== undefined) {
    row.generated_insight = update.generated_insight;
  }
  if (update.insight_status !== undefined) {
    row.insight_status = update.insight_status;
  }
  if (update.guidance_fingerprint !== undefined) {
    row.guidance_fingerprint = update.guidance_fingerprint;
  }
  if (update.archived_at !== undefined) row.archived_at = update.archived_at;

  return row;
}
