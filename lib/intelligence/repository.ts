import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiInterpretationParsed } from "@/lib/intelligence/schema";
import {
  rowToEvidence,
  rowToIntelligenceItem,
  rowToQuestion,
  rowToReview,
  rowToSignal,
  type IntelligenceEvidenceRow,
  type IntelligenceItemRow,
  type PersonProgressSignalRow,
  type QuestionInsightRow,
  type SessionIntelligenceReviewRow,
} from "@/lib/intelligence/map";
import type {
  ConfidenceLabel,
  IntelligenceCategory,
  IntelligenceEvidence,
  IntelligenceItem,
  IntelligenceStatus,
  PersonProgressSignal,
  QuestionInsight,
  SessionIntelligenceReview,
} from "@/lib/intelligence/types";
import { buildIntelligenceSnapshot } from "@/lib/intelligence/snapshot";
import {
  IntelligenceMigrationRequiredError,
  isMissingIntelligenceSchema,
} from "@/lib/intelligence/errors";
import {
  logSupabaseError,
  toSupabaseDbError,
} from "@/lib/supabase/errors";

function throwDb(
  error: { message: string; code?: string; details?: string; hint?: string },
  status: number | undefined,
  operation: string
): never {
  const dbError = toSupabaseDbError(error, { status: status ?? null, operation });
  logSupabaseError(operation, dbError, status ?? null);
  if (isMissingIntelligenceSchema(dbError)) {
    throw new IntelligenceMigrationRequiredError();
  }
  throw dbError;
}

async function writeAudit(
  supabase: SupabaseClient,
  userId: string,
  entityType: string,
  entityId: string,
  action: string,
  previousValue: unknown = null,
  newValue: unknown = null
): Promise<void> {
  const { error } = await supabase.from("intelligence_audit_log").insert({
    user_id: userId,
    entity_type: entityType,
    entity_id: entityId,
    action,
    previous_value: previousValue,
    new_value: newValue,
  });
  if (error) {
    // Audit failure must not block coaching workflows.
    logSupabaseError("intelligence_audit_log.insert", error, null);
  }
}

async function loadEvidenceForItems(
  supabase: SupabaseClient,
  userId: string,
  itemIds: string[]
): Promise<Map<string, IntelligenceEvidence[]>> {
  const map = new Map<string, IntelligenceEvidence[]>();
  if (itemIds.length === 0) return map;

  const { data, error } = await supabase
    .from("intelligence_evidence")
    .select("*")
    .eq("user_id", userId)
    .in("intelligence_item_id", itemIds)
    .order("created_at", { ascending: true });

  if (error) throwDb(error, undefined, "intelligence_evidence.select");

  for (const row of (data ?? []) as IntelligenceEvidenceRow[]) {
    const evidence = rowToEvidence(row);
    const list = map.get(evidence.intelligenceItemId) ?? [];
    list.push(evidence);
    map.set(evidence.intelligenceItemId, list);
  }
  return map;
}

export async function listIntelligenceForClient(
  supabase: SupabaseClient,
  userId: string,
  clientId: string,
  options?: { includeRejected?: boolean }
): Promise<IntelligenceItem[]> {
  let query = supabase
    .from("intelligence_items")
    .select("*")
    .eq("user_id", userId)
    .eq("client_id", clientId)
    .order("updated_at", { ascending: false });

  if (!options?.includeRejected) {
    query = query.neq("status", "rejected");
  }

  const { data, error } = await query;
  if (error) throwDb(error, undefined, "intelligence_items.select");

  const rows = (data ?? []) as IntelligenceItemRow[];
  const evidenceMap = await loadEvidenceForItems(
    supabase,
    userId,
    rows.map(row => row.id)
  );

  return rows.map(row =>
    rowToIntelligenceItem(row, evidenceMap.get(row.id) ?? [])
  );
}

export async function listApprovedIntelligenceForClient(
  supabase: SupabaseClient,
  userId: string,
  clientId: string
): Promise<IntelligenceItem[]> {
  const items = await listIntelligenceForClient(supabase, userId, clientId);
  return items.filter(item => item.status === "approved" && !item.archivedAt);
}

export async function getIntelligenceItem(
  supabase: SupabaseClient,
  userId: string,
  itemId: string
): Promise<IntelligenceItem | null> {
  const { data, error } = await supabase
    .from("intelligence_items")
    .select("*")
    .eq("user_id", userId)
    .eq("id", itemId)
    .maybeSingle();

  if (error) throwDb(error, undefined, "intelligence_items.get");
  if (!data) return null;

  const evidenceMap = await loadEvidenceForItems(supabase, userId, [itemId]);
  return rowToIntelligenceItem(
    data as IntelligenceItemRow,
    evidenceMap.get(itemId) ?? []
  );
}

export async function listGlobalIntelligence(
  supabase: SupabaseClient,
  userId: string
): Promise<{
  awaitingReview: IntelligenceItem[];
  recentlyApproved: IntelligenceItem[];
  questions: QuestionInsight[];
}> {
  const [{ data: proposed, error: proposedError }, { data: approved, error: approvedError }, { data: questions, error: questionsError }] =
    await Promise.all([
      supabase
        .from("intelligence_items")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "proposed")
        .order("updated_at", { ascending: false })
        .limit(40),
      supabase
        .from("intelligence_items")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "approved")
        .order("approved_at", { ascending: false })
        .limit(40),
      supabase
        .from("question_insights")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(40),
    ]);

  if (proposedError) throwDb(proposedError, undefined, "intelligence_items.proposed");
  if (approvedError) throwDb(approvedError, undefined, "intelligence_items.approved");
  if (questionsError) throwDb(questionsError, undefined, "question_insights.select");

  const proposedRows = (proposed ?? []) as IntelligenceItemRow[];
  const approvedRows = (approved ?? []) as IntelligenceItemRow[];
  const allIds = [...proposedRows, ...approvedRows].map(row => row.id);
  const evidenceMap = await loadEvidenceForItems(supabase, userId, allIds);

  return {
    awaitingReview: proposedRows.map(row =>
      rowToIntelligenceItem(row, evidenceMap.get(row.id) ?? [])
    ),
    recentlyApproved: approvedRows.map(row =>
      rowToIntelligenceItem(row, evidenceMap.get(row.id) ?? [])
    ),
    questions: ((questions ?? []) as QuestionInsightRow[]).map(rowToQuestion),
  };
}

export async function getOrCreateSessionReview(
  supabase: SupabaseClient,
  userId: string,
  clientId: string,
  sessionId: string
): Promise<SessionIntelligenceReview> {
  // One review per session (unique on session_id). Always return the existing
  // row when present — never insert a second review.
  const { data: existing, error: existingError } = await supabase
    .from("session_intelligence_reviews")
    .select("*")
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .maybeSingle();

  if (existingError) throwDb(existingError, undefined, "session_intelligence_reviews.get");
  if (existing) return rowToReview(existing as SessionIntelligenceReviewRow);

  // Upsert with ignoreDuplicates so concurrent load/retry/interpret races
  // cannot violate session_intelligence_reviews_session_unique, and so we
  // never overwrite an existing review_status (e.g. in_review / completed).
  const { data, error } = await supabase
    .from("session_intelligence_reviews")
    .upsert(
      {
        session_id: sessionId,
        user_id: userId,
        client_id: clientId,
        review_status: "pending",
      },
      { onConflict: "session_id", ignoreDuplicates: true }
    )
    .select("*")
    .maybeSingle();

  if (error) throwDb(error, undefined, "session_intelligence_reviews.upsert");
  if (data) return rowToReview(data as SessionIntelligenceReviewRow);

  // ON CONFLICT DO NOTHING returns no row — fetch the winner of the race.
  const { data: raced, error: racedError } = await supabase
    .from("session_intelligence_reviews")
    .select("*")
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .single();

  if (racedError) throwDb(racedError, undefined, "session_intelligence_reviews.get_after_conflict");
  return rowToReview(raced as SessionIntelligenceReviewRow);
}

export async function persistAiProposals(
  supabase: SupabaseClient,
  userId: string,
  clientId: string,
  sessionId: string,
  interpretation: AiInterpretationParsed
): Promise<{
  review: SessionIntelligenceReview;
  items: IntelligenceItem[];
  questions: QuestionInsight[];
  signals: PersonProgressSignal[];
}> {
  const review = await getOrCreateSessionReview(supabase, userId, clientId, sessionId);
  const now = new Date().toISOString();
  const createdItems: IntelligenceItem[] = [];

  for (const proposal of interpretation.proposedInsights) {
    if (proposal.relationshipToExistingInsight.type === "duplicates") {
      continue;
    }

    const relation = proposal.relationshipToExistingInsight;
    const relationNote =
      relation.type !== "new" && relation.existingInsightId
        ? `Related existing insight: ${relation.existingInsightId} (${relation.type}).`
        : "";

    const description =
      relation.type === "supports"
        ? `Emerging insight: evidence suggests this strengthens an existing approved insight. ${proposal.description}`
        : relation.type === "challenges"
          ? `Emerging insight: evidence suggests this challenges an existing approved insight. ${proposal.description}`
          : proposal.description;

    const { data: itemRow, error: itemError } = await supabase
      .from("intelligence_items")
      .insert({
        user_id: userId,
        client_id: clientId,
        category: proposal.category,
        title: proposal.title,
        description,
        status: "proposed",
        confidence_score: proposal.confidenceScore,
        confidence_label: proposal.confidenceLabel,
        source_type: "AI_interpretation",
        first_identified_at: now,
        last_updated_at: now,
        coach_notes: relationNote,
      })
      .select("*")
      .single();

    if (itemError) throwDb(itemError, undefined, "intelligence_items.insert");

    const itemId = (itemRow as IntelligenceItemRow).id;
    for (const evidence of proposal.evidence) {
      const { error: evidenceError } = await supabase.from("intelligence_evidence").insert({
        intelligence_item_id: itemId,
        session_id: sessionId,
        user_id: userId,
        evidence_text: evidence.evidenceText,
        evidence_type: evidence.evidenceType,
        source_excerpt: evidence.sourceExcerpt || null,
        occurred_at: now,
        created_by: "AI_interpretation",
      });
      if (evidenceError) throwDb(evidenceError, undefined, "intelligence_evidence.insert");
    }

    await writeAudit(
      supabase,
      userId,
      "intelligence_item",
      itemId,
      "AI proposal created",
      null,
      itemRow
    );

    const item = await getIntelligenceItem(supabase, userId, itemId);
    if (item) createdItems.push(item);
  }

  const createdQuestions: QuestionInsight[] = [];
  for (const question of interpretation.suggestedQuestions) {
    const { data, error } = await supabase
      .from("question_insights")
      .insert({
        user_id: userId,
        client_id: clientId,
        session_id: sessionId,
        question_text: question.question,
        question_type: "suggested",
        source: "AI_suggested",
        coach_notes: question.reason,
      })
      .select("*")
      .single();
    if (error) throwDb(error, undefined, "question_insights.insert");
    createdQuestions.push(rowToQuestion(data as QuestionInsightRow));
  }

  const createdSignals: PersonProgressSignal[] = [];
  for (const signal of interpretation.developmentSignals) {
    const { data, error } = await supabase
      .from("person_progress_signals")
      .insert({
        user_id: userId,
        client_id: clientId,
        session_id: sessionId,
        signal_name: signal.signalName,
        direction: signal.direction,
        coach_validated: false,
        evidence_summary: signal.evidenceSummary,
        recorded_at: now,
      })
      .select("*")
      .single();
    if (error) throwDb(error, undefined, "person_progress_signals.insert");
    createdSignals.push(rowToSignal(data as PersonProgressSignalRow));
  }

  const { data: reviewRow, error: reviewError } = await supabase
    .from("session_intelligence_reviews")
    .update({
      review_status: "in_review",
      generated_at: now,
    })
    .eq("id", review.id)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (reviewError) throwDb(reviewError, undefined, "session_intelligence_reviews.update");

  return {
    review: rowToReview(reviewRow as SessionIntelligenceReviewRow),
    items: createdItems,
    questions: createdQuestions,
    signals: createdSignals,
  };
}

export async function updateIntelligenceItem(
  supabase: SupabaseClient,
  userId: string,
  itemId: string,
  patch: {
    title?: string;
    description?: string;
    category?: IntelligenceCategory;
    status?: IntelligenceStatus;
    confidenceLabel?: ConfidenceLabel | null;
    confidenceScore?: number | null;
    coachNotes?: string;
    isLocked?: boolean;
    archivedAt?: string | null;
  }
): Promise<IntelligenceItem> {
  const previous = await getIntelligenceItem(supabase, userId, itemId);
  if (!previous) throw new Error("Intelligence item not found.");
  if (previous.isLocked && patch.status !== "archived" && patch.isLocked !== false) {
    throw new Error("This insight is locked and cannot be edited.");
  }

  const now = new Date().toISOString();
  const update: Record<string, unknown> = {
    last_updated_at: now,
  };

  if (patch.title !== undefined) update.title = patch.title;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.category !== undefined) update.category = patch.category;
  if (patch.confidenceLabel !== undefined) update.confidence_label = patch.confidenceLabel;
  if (patch.confidenceScore !== undefined) update.confidence_score = patch.confidenceScore;
  if (patch.coachNotes !== undefined) update.coach_notes = patch.coachNotes;
  if (patch.isLocked !== undefined) update.is_locked = patch.isLocked;
  if (patch.archivedAt !== undefined) update.archived_at = patch.archivedAt;

  if (patch.status !== undefined) {
    update.status = patch.status;
    if (patch.status === "approved") {
      update.approved_at = now;
      update.approved_by = userId;
      update.archived_at = null;
    }
    if (patch.status === "rejected") {
      update.approved_at = null;
      update.approved_by = null;
    }
    if (patch.status === "archived") {
      update.archived_at = now;
    }
  }

  const { data, error } = await supabase
    .from("intelligence_items")
    .update(update)
    .eq("id", itemId)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) throwDb(error, undefined, "intelligence_items.update");

  let action = "insight edited";
  if (patch.status === "approved") action = "insight approved";
  if (patch.status === "rejected") action = "insight rejected";
  if (patch.isLocked === true) action = "insight locked";
  if (patch.confidenceLabel !== undefined || patch.confidenceScore !== undefined) {
    action = patch.status ? action : "confidence changed";
  }

  await writeAudit(
    supabase,
    userId,
    "intelligence_item",
    itemId,
    action,
    previous,
    data
  );

  if (patch.status === "approved") {
    await applyRelatedInsightOnApprove(supabase, userId, previous);
  }

  const evidenceMap = await loadEvidenceForItems(supabase, userId, [itemId]);
  return rowToIntelligenceItem(
    data as IntelligenceItemRow,
    evidenceMap.get(itemId) ?? []
  );
}

/**
 * When a proposed supports/challenges item is approved, attach its evidence
 * to the related approved insight without inventing new claims.
 */
async function applyRelatedInsightOnApprove(
  supabase: SupabaseClient,
  userId: string,
  proposed: IntelligenceItem
): Promise<void> {
  const match = proposed.coachNotes.match(
    /Related existing insight:\s*([0-9a-f-]{36})\s*\((supports|challenges)\)/i
  );
  if (!match) return;

  const relatedId = match[1];
  const relationType = match[2]?.toLowerCase();
  const related = await getIntelligenceItem(supabase, userId, relatedId);
  if (!related || related.status !== "approved" || related.isLocked) return;

  const now = new Date().toISOString();
  for (const evidence of proposed.evidence) {
    const { error } = await supabase.from("intelligence_evidence").insert({
      intelligence_item_id: related.id,
      session_id: evidence.sessionId,
      user_id: userId,
      evidence_text: evidence.evidenceText,
      evidence_type: evidence.evidenceType ?? "coach_observation",
      source_excerpt: evidence.sourceExcerpt,
      occurred_at: evidence.occurredAt ?? now,
      created_by: "coach_validation",
    });
    if (error) throwDb(error, undefined, "intelligence_evidence.relate");
  }

  const nextScore = Math.min(
    100,
    Math.max(related.confidenceScore ?? 0, proposed.confidenceScore ?? 0) +
      (relationType === "supports" ? 5 : 0)
  );
  let nextLabel = related.confidenceLabel ?? proposed.confidenceLabel;
  if (relationType === "supports") {
    if ((related.evidenceCount ?? 0) + proposed.evidenceCount >= 3) {
      nextLabel = "supported";
    }
    if ((related.evidenceCount ?? 0) + proposed.evidenceCount >= 5) {
      nextLabel = "strongly supported";
    }
  }

  const { data, error } = await supabase
    .from("intelligence_items")
    .update({
      last_updated_at: now,
      confidence_score: nextScore,
      confidence_label: nextLabel,
      description:
        relationType === "challenges"
          ? `${related.description}\n\nCoach-validated challenge from a later conversation: ${proposed.description}`
          : related.description,
    })
    .eq("id", related.id)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) throwDb(error, undefined, "intelligence_items.relate_update");

  await writeAudit(
    supabase,
    userId,
    "intelligence_item",
    related.id,
    relationType === "supports" ? "insight strengthened" : "insight challenged",
    related,
    data
  );
}

export async function addEvidence(
  supabase: SupabaseClient,
  userId: string,
  itemId: string,
  input: {
    evidenceText: string;
    evidenceType?: string;
    sourceExcerpt?: string;
    sessionId?: string | null;
  }
): Promise<IntelligenceEvidence> {
  const item = await getIntelligenceItem(supabase, userId, itemId);
  if (!item) throw new Error("Intelligence item not found.");

  const { data, error } = await supabase
    .from("intelligence_evidence")
    .insert({
      intelligence_item_id: itemId,
      session_id: input.sessionId ?? null,
      user_id: userId,
      evidence_text: input.evidenceText,
      evidence_type: input.evidenceType ?? "manual_entry",
      source_excerpt: input.sourceExcerpt ?? null,
      occurred_at: new Date().toISOString(),
      created_by: "coach",
    })
    .select("*")
    .single();

  if (error) throwDb(error, undefined, "intelligence_evidence.insert");

  await supabase
    .from("intelligence_items")
    .update({ last_updated_at: new Date().toISOString() })
    .eq("id", itemId)
    .eq("user_id", userId);

  await writeAudit(
    supabase,
    userId,
    "intelligence_evidence",
    (data as IntelligenceEvidenceRow).id,
    "evidence added",
    null,
    data
  );

  return rowToEvidence(data as IntelligenceEvidenceRow);
}

export async function completeSessionReview(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
  reviewStatus: "approved" | "partially_approved" | "rejected" | "completed"
): Promise<SessionIntelligenceReview> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("session_intelligence_reviews")
    .update({
      review_status: reviewStatus,
      reviewed_at: now,
      completed_at: now,
    })
    .eq("session_id", sessionId)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) throwDb(error, undefined, "session_intelligence_reviews.complete");
  return rowToReview(data as SessionIntelligenceReviewRow);
}

export async function listQuestionsForClient(
  supabase: SupabaseClient,
  userId: string,
  clientId: string
): Promise<QuestionInsight[]> {
  const { data, error } = await supabase
    .from("question_insights")
    .select("*")
    .eq("user_id", userId)
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  if (error) throwDb(error, undefined, "question_insights.select");
  return ((data ?? []) as QuestionInsightRow[]).map(rowToQuestion);
}

export async function saveQuestionInsight(
  supabase: SupabaseClient,
  userId: string,
  input: {
    clientId: string;
    sessionId?: string | null;
    questionText: string;
    source?: string;
    coachNotes?: string;
  }
): Promise<QuestionInsight> {
  const { data, error } = await supabase
    .from("question_insights")
    .insert({
      user_id: userId,
      client_id: input.clientId,
      session_id: input.sessionId ?? null,
      question_text: input.questionText,
      source: input.source ?? "coach",
      coach_notes: input.coachNotes ?? "",
    })
    .select("*")
    .single();

  if (error) throwDb(error, undefined, "question_insights.insert");
  return rowToQuestion(data as QuestionInsightRow);
}

export async function deleteQuestionInsight(
  supabase: SupabaseClient,
  userId: string,
  questionId: string
): Promise<void> {
  const { error } = await supabase
    .from("question_insights")
    .delete()
    .eq("id", questionId)
    .eq("user_id", userId);
  if (error) throwDb(error, undefined, "question_insights.delete");
}

export async function listSignalsForClient(
  supabase: SupabaseClient,
  userId: string,
  clientId: string
): Promise<PersonProgressSignal[]> {
  const { data, error } = await supabase
    .from("person_progress_signals")
    .select("*")
    .eq("user_id", userId)
    .eq("client_id", clientId)
    .order("recorded_at", { ascending: false });

  if (error) throwDb(error, undefined, "person_progress_signals.select");
  return ((data ?? []) as PersonProgressSignalRow[]).map(rowToSignal);
}

export async function listProposedForSession(
  supabase: SupabaseClient,
  userId: string,
  clientId: string,
  sessionId: string
): Promise<{
  review: SessionIntelligenceReview;
  items: IntelligenceItem[];
  questions: QuestionInsight[];
  signals: PersonProgressSignal[];
  snapshot: ReturnType<typeof buildIntelligenceSnapshot>;
}> {
  const review = await getOrCreateSessionReview(supabase, userId, clientId, sessionId);
  const items = await listIntelligenceForClient(supabase, userId, clientId, {
    includeRejected: true,
  });

  const sessionItems = items.filter(item =>
    item.evidence.some(evidence => evidence.sessionId === sessionId) ||
    (item.status === "proposed" && item.sourceType === "AI_interpretation")
  );

  const { data: questionRows, error: questionError } = await supabase
    .from("question_insights")
    .select("*")
    .eq("user_id", userId)
    .eq("client_id", clientId)
    .eq("session_id", sessionId);

  if (questionError) throwDb(questionError, undefined, "question_insights.session");

  const { data: signalRows, error: signalError } = await supabase
    .from("person_progress_signals")
    .select("*")
    .eq("user_id", userId)
    .eq("client_id", clientId)
    .eq("session_id", sessionId);

  if (signalError) throwDb(signalError, undefined, "person_progress_signals.session");

  const allApproved = items.filter(item => item.status === "approved");

  return {
    review,
    items: sessionItems.filter(item => item.status === "proposed"),
    questions: ((questionRows ?? []) as QuestionInsightRow[]).map(rowToQuestion),
    signals: ((signalRows ?? []) as PersonProgressSignalRow[]).map(rowToSignal),
    snapshot: buildIntelligenceSnapshot(allApproved, items),
  };
}

export async function listAuditForItem(
  supabase: SupabaseClient,
  userId: string,
  entityId: string
) {
  const { data, error } = await supabase
    .from("intelligence_audit_log")
    .select("*")
    .eq("user_id", userId)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) throwDb(error, undefined, "intelligence_audit_log.select");
  return data ?? [];
}
