import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canTransitionCoachingMoment,
  coachingMomentEvidenceCanonicalKey,
  isSavedCoachingMoment,
  type CoachingMoment,
  type CoachingMomentGuidance,
  type CoachingMomentInsight,
  type CoachingMomentInsightStatus,
  type CoachingMomentStatus,
  type CoachingMomentType,
} from "@/lib/coaching-moments/coaching-moment";
import {
  coachingMomentUpdateToRow,
  rowToCoachingMoment,
  type CoachingMomentRow,
  type CoachingMomentUpdate,
} from "@/lib/coaching-moments/map";

export class CoachingMomentError extends Error {
  constructor(
    message: string,
    readonly code:
      | "not_found"
      | "archived"
      | "invalid_transition"
      | "validation"
      | "conflict"
  ) {
    super(message);
    this.name = "CoachingMomentError";
  }
}

async function assertActiveRelationship(
  supabase: SupabaseClient,
  clientId: string,
  coachId: string
): Promise<{ name: string; organisation: string | null; role: string | null }> {
  const { data, error } = await supabase
    .from("clients")
    .select("id, name, organisation, role, status, archived_at")
    .eq("id", clientId)
    .eq("coach_id", coachId)
    .maybeSingle();

  if (error || !data) {
    throw new CoachingMomentError("Resource not found.", "not_found");
  }

  if (data.status === "Archived" || data.archived_at) {
    throw new CoachingMomentError(
      "This relationship is archived.",
      "archived"
    );
  }

  return {
    name: String(data.name ?? ""),
    organisation: data.organisation ? String(data.organisation) : null,
    role: data.role ? String(data.role) : null,
  };
}

export async function getCoachingMoment(
  supabase: SupabaseClient,
  input: { momentId: string; coachId: string; clientId?: string }
): Promise<CoachingMoment | null> {
  let query = supabase
    .from("coaching_moments")
    .select("*")
    .eq("id", input.momentId)
    .eq("coach_id", input.coachId);

  if (input.clientId) {
    query = query.eq("client_id", input.clientId);
  }

  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;
  return rowToCoachingMoment(data as CoachingMomentRow);
}

export async function listCoachingMoments(
  supabase: SupabaseClient,
  input: {
    clientId: string;
    coachId: string;
    limit?: number;
    includeDiscarded?: boolean;
  }
): Promise<CoachingMoment[]> {
  let query = supabase
    .from("coaching_moments")
    .select("*")
    .eq("client_id", input.clientId)
    .eq("coach_id", input.coachId)
    .is("archived_at", null)
    .order("occurred_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(input.limit ?? 20);

  if (!input.includeDiscarded) {
    query = query.neq("status", "discarded");
  }

  const { data, error } = await query;
  if (error || !data) return [];
  return (data as CoachingMomentRow[]).map(rowToCoachingMoment);
}

export async function listRecentSavedCoachingMoments(
  supabase: SupabaseClient,
  input: { clientId: string; coachId: string; limit?: number }
): Promise<CoachingMoment[]> {
  const { data, error } = await supabase
    .from("coaching_moments")
    .select("*")
    .eq("client_id", input.clientId)
    .eq("coach_id", input.coachId)
    .is("archived_at", null)
    .in("status", ["captured", "complete"])
    .order("occurred_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(input.limit ?? 3);

  if (error || !data) return [];
  return (data as CoachingMomentRow[]).map(rowToCoachingMoment);
}

export async function createDraftCoachingMoment(
  supabase: SupabaseClient,
  input: {
    clientId: string;
    coachId: string;
    situation?: string;
    desiredOutcome?: string | null;
  }
): Promise<CoachingMoment> {
  await assertActiveRelationship(supabase, input.clientId, input.coachId);

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("coaching_moments")
    .insert({
      client_id: input.clientId,
      coach_id: input.coachId,
      created_by: input.coachId,
      status: "draft",
      situation: input.situation?.trim() ?? "",
      desired_outcome: input.desiredOutcome?.trim() || null,
      generated_questions: [],
      insight_status: "not_requested",
      no_commitment_agreed: false,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (error || !data) {
    console.error("[coaching-moments] create draft failed", {
      code: error?.code ?? null,
      relationshipId: input.clientId,
    });
    throw new CoachingMomentError(
      "Unable to create coaching moment.",
      "conflict"
    );
  }

  return rowToCoachingMoment(data as CoachingMomentRow);
}

async function updateMoment(
  supabase: SupabaseClient,
  input: {
    moment: CoachingMoment;
    update: CoachingMomentUpdate;
    requireActive?: boolean;
  }
): Promise<CoachingMoment> {
  if (input.requireActive !== false) {
    await assertActiveRelationship(
      supabase,
      input.moment.clientId,
      input.moment.coachId
    );
  }

  if (
    input.update.status &&
    !canTransitionCoachingMoment(input.moment.status, input.update.status)
  ) {
    throw new CoachingMomentError(
      "This coaching moment cannot move to that state.",
      "invalid_transition"
    );
  }

  const row = coachingMomentUpdateToRow(input.update);
  const { data, error } = await supabase
    .from("coaching_moments")
    .update(row)
    .eq("id", input.moment.id)
    .eq("coach_id", input.moment.coachId)
    .eq("client_id", input.moment.clientId)
    .select("*")
    .maybeSingle();

  if (error || !data) {
    console.error("[coaching-moments] update failed", {
      code: error?.code ?? null,
      momentId: input.moment.id,
      relationshipId: input.moment.clientId,
    });
    throw new CoachingMomentError(
      "Unable to save coaching moment.",
      "conflict"
    );
  }

  return rowToCoachingMoment(data as CoachingMomentRow);
}

export async function savePrepareFields(
  supabase: SupabaseClient,
  input: {
    momentId: string;
    coachId: string;
    situation: string;
    desiredOutcome?: string | null;
  }
): Promise<CoachingMoment> {
  const moment = await getCoachingMoment(supabase, {
    momentId: input.momentId,
    coachId: input.coachId,
  });
  if (!moment) {
    throw new CoachingMomentError("Resource not found.", "not_found");
  }
  if (moment.status !== "draft" && moment.status !== "prepared") {
    throw new CoachingMomentError(
      "Preparation can only be edited before the conversation starts.",
      "invalid_transition"
    );
  }

  const situation = input.situation.trim();
  if (!situation) {
    throw new CoachingMomentError(
      "Describe the conversation you are preparing for.",
      "validation"
    );
  }

  return updateMoment(supabase, {
    moment,
    update: {
      situation,
      desired_outcome: input.desiredOutcome?.trim() || null,
    },
  });
}

export async function applyGuidance(
  supabase: SupabaseClient,
  input: {
    momentId: string;
    coachId: string;
    guidance: CoachingMomentGuidance;
    inferredType: CoachingMomentType;
    fingerprint: string;
  }
): Promise<CoachingMoment> {
  const moment = await getCoachingMoment(supabase, {
    momentId: input.momentId,
    coachId: input.coachId,
  });
  if (!moment) {
    throw new CoachingMomentError("Resource not found.", "not_found");
  }

  // Idempotent: same fingerprint already applied.
  if (
    moment.status === "prepared" &&
    moment.guidanceFingerprint === input.fingerprint
  ) {
    return moment;
  }

  if (moment.status !== "draft" && moment.status !== "prepared") {
    throw new CoachingMomentError(
      "Guidance can only be applied during preparation.",
      "invalid_transition"
    );
  }

  const questions = input.guidance.questions.slice(0, 3);

  return updateMoment(supabase, {
    moment,
    update: {
      status: "prepared",
      inferred_type: input.inferredType,
      generated_intention: input.guidance.intention.trim(),
      generated_opening: input.guidance.opening?.trim() || null,
      generated_questions: questions,
      generated_consideration: input.guidance.consideration?.trim() || null,
      relevant_context: input.guidance.relevantContext ?? null,
      guidance_fingerprint: input.fingerprint,
    },
  });
}

/**
 * Start conversation. Idempotent when already in_progress.
 * Allows draft → in_progress (continue without guidance).
 */
export async function startCoachingMoment(
  supabase: SupabaseClient,
  input: {
    momentId: string;
    coachId: string;
    situation?: string;
    desiredOutcome?: string | null;
  }
): Promise<CoachingMoment> {
  const moment = await getCoachingMoment(supabase, {
    momentId: input.momentId,
    coachId: input.coachId,
  });
  if (!moment) {
    throw new CoachingMomentError("Resource not found.", "not_found");
  }

  if (moment.status === "in_progress") {
    return moment;
  }

  const situation = (input.situation ?? moment.situation).trim();
  if (!situation) {
    throw new CoachingMomentError(
      "Describe the conversation you are preparing for.",
      "validation"
    );
  }

  return updateMoment(supabase, {
    moment,
    update: {
      status: "in_progress",
      situation,
      desired_outcome:
        input.desiredOutcome !== undefined
          ? input.desiredOutcome?.trim() || null
          : moment.desiredOutcome,
      occurred_at: moment.occurredAt ?? new Date().toISOString(),
    },
  });
}

export async function savePrivateNote(
  supabase: SupabaseClient,
  input: { momentId: string; coachId: string; privateNote: string }
): Promise<CoachingMoment> {
  const moment = await getCoachingMoment(supabase, {
    momentId: input.momentId,
    coachId: input.coachId,
  });
  if (!moment) {
    throw new CoachingMomentError("Resource not found.", "not_found");
  }
  if (moment.status !== "in_progress" && moment.status !== "prepared") {
    throw new CoachingMomentError(
      "Private notes can only be updated during the conversation.",
      "invalid_transition"
    );
  }

  return updateMoment(supabase, {
    moment,
    update: { private_note: input.privateNote },
  });
}

/**
 * Save outcome. Idempotent when already captured/complete with same payload fingerprint.
 */
export async function saveCoachingMomentOutcome(
  supabase: SupabaseClient,
  input: {
    momentId: string;
    coachId: string;
    outcomeNotes: string;
    agreedCommitment?: string | null;
    noCommitmentAgreed?: boolean;
    followUp?: string | null;
  }
): Promise<CoachingMoment> {
  const moment = await getCoachingMoment(supabase, {
    momentId: input.momentId,
    coachId: input.coachId,
  });
  if (!moment) {
    throw new CoachingMomentError("Resource not found.", "not_found");
  }

  const outcomeNotes = input.outcomeNotes.trim();
  if (!outcomeNotes) {
    throw new CoachingMomentError(
      "Capture what happened before saving.",
      "validation"
    );
  }

  const noCommitment = Boolean(input.noCommitmentAgreed);
  const agreedCommitment = noCommitment
    ? null
    : input.agreedCommitment?.trim() || null;
  const followUp = input.followUp?.trim() || null;

  if (
    isSavedCoachingMoment(moment.status) &&
    moment.outcomeNotes === outcomeNotes &&
    moment.agreedCommitment === agreedCommitment &&
    moment.noCommitmentAgreed === noCommitment &&
    moment.followUp === followUp
  ) {
    return moment;
  }

  if (
    moment.status !== "in_progress" &&
    moment.status !== "captured" &&
    moment.status !== "complete"
  ) {
    throw new CoachingMomentError(
      "Outcome can only be saved after the conversation starts.",
      "invalid_transition"
    );
  }

  const nextStatus: CoachingMomentStatus =
    moment.status === "complete" ? "complete" : "captured";

  return updateMoment(supabase, {
    moment,
    update: {
      status: nextStatus,
      outcome_notes: outcomeNotes,
      agreed_commitment: agreedCommitment,
      no_commitment_agreed: noCommitment,
      follow_up: followUp,
      occurred_at: moment.occurredAt ?? new Date().toISOString(),
    },
  });
}

export async function completeCoachingMoment(
  supabase: SupabaseClient,
  input: { momentId: string; coachId: string }
): Promise<CoachingMoment> {
  const moment = await getCoachingMoment(supabase, {
    momentId: input.momentId,
    coachId: input.coachId,
  });
  if (!moment) {
    throw new CoachingMomentError("Resource not found.", "not_found");
  }
  if (moment.status === "complete") return moment;
  if (moment.status !== "captured") {
    throw new CoachingMomentError(
      "Complete the outcome capture before finishing.",
      "invalid_transition"
    );
  }

  return updateMoment(supabase, {
    moment,
    update: { status: "complete" },
  });
}

export async function applyInsightDraft(
  supabase: SupabaseClient,
  input: {
    momentId: string;
    coachId: string;
    insight: CoachingMomentInsight;
  }
): Promise<CoachingMoment> {
  const moment = await getCoachingMoment(supabase, {
    momentId: input.momentId,
    coachId: input.coachId,
  });
  if (!moment) {
    throw new CoachingMomentError("Resource not found.", "not_found");
  }
  if (!isSavedCoachingMoment(moment.status)) {
    throw new CoachingMomentError(
      "Save the coaching moment before creating an insight.",
      "invalid_transition"
    );
  }

  return updateMoment(supabase, {
    moment,
    update: {
      status: moment.status === "captured" ? "complete" : moment.status,
      generated_insight: input.insight,
      insight_status: "draft",
    },
  });
}

export async function reviewInsight(
  supabase: SupabaseClient,
  input: {
    momentId: string;
    coachId: string;
    decision: "accepted" | "edited" | "discarded";
    insight?: CoachingMomentInsight | null;
  }
): Promise<CoachingMoment> {
  const moment = await getCoachingMoment(supabase, {
    momentId: input.momentId,
    coachId: input.coachId,
  });
  if (!moment) {
    throw new CoachingMomentError("Resource not found.", "not_found");
  }

  const insightStatus: CoachingMomentInsightStatus = input.decision;
  const generatedInsight =
    input.decision === "discarded"
      ? null
      : input.insight ?? moment.generatedInsight;

  if (input.decision !== "discarded" && !generatedInsight?.summary?.trim()) {
    throw new CoachingMomentError(
      "Insight content is required to keep it.",
      "validation"
    );
  }

  return updateMoment(supabase, {
    moment,
    update: {
      status: moment.status === "captured" ? "complete" : moment.status,
      generated_insight: generatedInsight,
      insight_status: insightStatus,
    },
  });
}

export async function discardCoachingMoment(
  supabase: SupabaseClient,
  input: { momentId: string; coachId: string }
): Promise<CoachingMoment> {
  const moment = await getCoachingMoment(supabase, {
    momentId: input.momentId,
    coachId: input.coachId,
  });
  if (!moment) {
    throw new CoachingMomentError("Resource not found.", "not_found");
  }
  if (moment.status === "discarded") return moment;
  if (moment.status === "complete") {
    throw new CoachingMomentError(
      "Completed coaching moments cannot be discarded.",
      "invalid_transition"
    );
  }

  return updateMoment(supabase, {
    moment,
    update: { status: "discarded" },
    requireActive: false,
  });
}

/**
 * Build one authorised evidence point for pattern recognition.
 * Raw outcome + optional accepted insight share one canonical key.
 */
export function coachingMomentToEvidencePoint(moment: CoachingMoment): {
  sourceType: "coaching_moment";
  sourceId: string;
  relationshipId: string;
  sourceDate: string | null;
  content: string;
  excerpt: string;
  isPrivate: false;
  isApproved: boolean;
  canonicalKey: string;
} | null {
  if (!isSavedCoachingMoment(moment.status)) return null;

  const parts = [
    moment.outcomeNotes?.trim(),
    !moment.noCommitmentAgreed ? moment.agreedCommitment?.trim() : null,
    moment.followUp?.trim(),
  ].filter(Boolean) as string[];

  // Accepted / edited insight may refine wording but does not add a second point.
  if (
    (moment.insightStatus === "accepted" || moment.insightStatus === "edited") &&
    moment.generatedInsight?.summary
  ) {
    parts.unshift(moment.generatedInsight.summary.trim());
  }

  if (parts.length === 0) return null;

  const content = parts.join("\n");
  return {
    sourceType: "coaching_moment",
    sourceId: moment.id,
    relationshipId: moment.clientId,
    sourceDate: moment.occurredAt || moment.updatedAt,
    content,
    excerpt: content.slice(0, 160),
    isPrivate: false,
    isApproved:
      moment.insightStatus === "accepted" ||
      moment.insightStatus === "edited" ||
      moment.insightStatus === "not_requested" ||
      moment.insightStatus === "discarded",
    canonicalKey: coachingMomentEvidenceCanonicalKey(moment.id),
  };
}
