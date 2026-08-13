/**
 * Manager My Development workspace — aggregates focus, actions, evidence,
 * and maturity signals for the current-org self-development relationship.
 * No new tables; reuses clients, client_items, and development_evidence.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateEvidenceConfidence } from "@/lib/development-evidence/confidence";
import { calculateEvidenceFreshness } from "@/lib/development-evidence/freshness";
import {
  listEvidenceForClient,
  writeEvidenceAudit,
} from "@/lib/development-evidence/repository";
import type {
  DevelopmentEvidenceRecord,
  StructuredEvidence,
} from "@/lib/development-evidence/types";
import {
  buildReflectionPatternInsights,
  patternsSafeForIntelligence,
  type ReflectionPatternInsight,
} from "@/lib/my-development/reflection-patterns";
import { ensureSelfDevelopmentRelationship } from "@/lib/my-development/self-relationship";
import type { ActionStatus, Client, CoachingAction } from "@/lib/types";

export type MyDevelopmentFocusItem = {
  id: string;
  title: string;
};

export type MyDevelopmentEvidenceStatusBucket =
  | "uploaded"
  | "analysing"
  | "ready"
  | "needs_attention";

export type MyDevelopmentEvidenceSummary = {
  id: string;
  title: string;
  evidenceType: string;
  statusBucket: MyDevelopmentEvidenceStatusBucket;
  processingStatus: string;
  reviewStatus: string;
  includeInIntelligence: boolean;
};

export type MyDevelopmentReflectionSummary = {
  id: string;
  title: string;
  evidenceDate: string | null;
  capturedAt: string;
  preview: string;
  /** Concise learning signal from existing observations, when present. */
  whatNoticed: string | null;
  /** Concise next-practice signal from existing observations, when present. */
  practiseNext: string | null;
};

/** Bound overview learning snippets without inventing content. */
export function boundMyDevelopmentLearningSnippet(
  value: string | null | undefined,
  maxChars = 180
): string | null {
  const trimmed = (value ?? "").trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
}

export type MyDevelopmentReflectionDetail = MyDevelopmentReflectionSummary & {
  context: string | null;
  whatHappened: string | null;
  whatNoticed: string | null;
  whatWorked: string | null;
  whatWasDifficult: string | null;
  whatDifferently: string | null;
  practiseNext: string | null;
  anythingElse: string | null;
  sourceSummary: string | null;
};

export type MyDevelopmentMaturity = {
  includedSourceCount: number;
  totalEvidenceCount: number;
  focusCount: number;
  actionCount: number;
  reflectionCount: number;
  confidenceLabel: string;
  headline: string;
  supportCopy: string;
  isEmpty: boolean;
};

export type MyDevelopmentWorkspace = {
  client: Pick<
    Client,
    "id" | "name" | "displayLabel" | "currentFocus" | "isSelfDevelopment"
  >;
  focusItems: MyDevelopmentFocusItem[];
  actions: CoachingAction[];
  evidence: MyDevelopmentEvidenceSummary[];
  reflections: MyDevelopmentReflectionSummary[];
  reflectionPatterns: ReflectionPatternInsight[];
  intelligencePatterns: ReflectionPatternInsight[];
  maturity: MyDevelopmentMaturity;
};

export type MyDevelopmentReflectionInput = {
  title?: string;
  context?: string;
  whatHappened?: string;
  whatNoticed?: string;
  whatWorked?: string;
  whatWasDifficult?: string;
  whatDifferently?: string;
  practiseNext?: string;
  anythingElse?: string;
};

function asActionStatus(value: unknown): ActionStatus {
  if (value === "Open" || value === "In progress" || value === "Complete") {
    return value;
  }
  return "Open";
}

function evidenceStatusBucket(
  item: DevelopmentEvidenceRecord
): MyDevelopmentEvidenceStatusBucket {
  if (item.processingStatus === "failed") return "needs_attention";
  if (
    item.processingStatus === "pending_upload" ||
    item.processingStatus === "uploaded" ||
    item.processingStatus === "extracting"
  ) {
    return "uploaded";
  }
  if (
    item.processingStatus === "extracted" ||
    item.processingStatus === "analysing"
  ) {
    return "analysing";
  }
  if (
    item.reviewStatus === "pending_review" ||
    item.reviewStatus === "in_review"
  ) {
    return "needs_attention";
  }
  return "ready";
}

export function buildMyDevelopmentMaturity(input: {
  focusCount: number;
  actions: CoachingAction[];
  evidence: DevelopmentEvidenceRecord[];
}): MyDevelopmentMaturity {
  const included = input.evidence.filter(
    item =>
      item.includeInIntelligence &&
      !item.deletedAt &&
      item.reviewStatus !== "rejected" &&
      item.reviewStatus !== "excluded"
  );
  const reflectionCount = input.evidence.filter(
    item =>
      item.evidenceType === "personal_reflection" ||
      item.evidenceType === "reflection"
  ).length;
  const confidence = calculateEvidenceConfidence({
    evidence: included.map(item => ({
      id: item.id,
      evidenceType: item.evidenceType,
      sourceType: item.sourceType,
      freshnessClass: item.freshnessClass,
      includeInIntelligence: item.includeInIntelligence,
      reviewStatus: item.reviewStatus,
      independenceKey:
        item.contentHash ||
        item.sourceRecordId ||
        `${item.evidenceType}:${item.title}`,
      hasBehaviouralSpecificity: Boolean(
        item.structuredEvidence.observations?.some(
          observation => observation.behaviouralEvidence?.trim()
        )
      ),
      capabilityKeys: item.capabilityKeys,
      contradictionCount:
        item.structuredEvidence.contradictoryEvidence?.length ?? 0,
    })),
  });

  const isEmpty =
    input.focusCount === 0 &&
    input.actions.length === 0 &&
    input.evidence.length === 0;

  const includedSourceCount = included.length;
  let headline = "Your development picture is beginning to form.";
  let supportCopy =
    "As you add reflections, actions and evidence, your Development Intelligence will become richer.";

  if (isEmpty) {
    headline = "Build your development picture";
    supportCopy =
      "Start with a development focus, a short reflection, or evidence such as a 360 or assessment.";
  } else if (includedSourceCount === 0) {
    headline = "Your development picture is beginning to form.";
    supportCopy =
      "You have started capturing development information. Approved evidence and reflections will appear in Development Intelligence.";
  } else if (includedSourceCount === 1) {
    headline = "Your development picture is beginning to form.";
    supportCopy = "Currently based on 1 source. Add more to strengthen confidence.";
  } else {
    headline = "Your Development Intelligence is taking shape.";
    supportCopy = `Currently based on ${includedSourceCount} sources. Evidence before certainty — treat this as emerging, not complete.`;
  }

  return {
    includedSourceCount,
    totalEvidenceCount: input.evidence.length,
    focusCount: input.focusCount,
    actionCount: input.actions.length,
    reflectionCount,
    confidenceLabel: confidence.label,
    headline,
    supportCopy,
    isEmpty,
  };
}

async function resolveSelfClient(input: {
  supabase: SupabaseClient;
  organisationId: string;
  userId: string;
  fullName: string;
}): Promise<Client> {
  return ensureSelfDevelopmentRelationship(input);
}

export async function loadMyDevelopmentWorkspace(input: {
  supabase: SupabaseClient;
  organisationId: string;
  userId: string;
  fullName: string;
}): Promise<MyDevelopmentWorkspace> {
  const client = await resolveSelfClient(input);

  const [{ data: themeRows }, { data: actionRows }, evidence] =
    await Promise.all([
      input.supabase
        .from("client_items")
        .select("id, title")
        .eq("client_id", client.id)
        .eq("coach_id", input.userId)
        .eq("item_type", "theme")
        .order("created_at", { ascending: true }),
      input.supabase
        .from("client_items")
        .select("id, title, status, event_date, detail, owner, session_id")
        .eq("client_id", client.id)
        .eq("coach_id", input.userId)
        .eq("item_type", "action")
        .order("created_at", { ascending: false }),
      listEvidenceForClient(input.supabase, input.userId, client.id),
    ]);

  const focusItems: MyDevelopmentFocusItem[] = (themeRows ?? [])
    .map(row => ({
      id: String(row.id),
      title: String(row.title ?? "").trim(),
    }))
    .filter(item => item.title);

  // Seed focus from current_focus when no theme items yet.
  if (
    focusItems.length === 0 &&
    client.currentFocus.trim() &&
    client.currentFocus.trim() !== "Personal development record"
  ) {
    focusItems.push({
      id: "current-focus",
      title: client.currentFocus.trim(),
    });
  }

  const actions: CoachingAction[] = (actionRows ?? []).map(row => ({
    id: String(row.id),
    title: String(row.title ?? ""),
    status: asActionStatus(row.status),
    due: row.event_date ? String(row.event_date) : undefined,
    owner: row.owner ? String(row.owner) : undefined,
    notes: row.detail ? String(row.detail) : undefined,
    clientId: client.id,
    sessionId: row.session_id ? String(row.session_id) : null,
  }));

  const evidenceSummary: MyDevelopmentEvidenceSummary[] = evidence.map(item => ({
    id: item.id,
    title: item.title,
    evidenceType: item.evidenceType,
    statusBucket: evidenceStatusBucket(item),
    processingStatus: item.processingStatus,
    reviewStatus: item.reviewStatus,
    includeInIntelligence: item.includeInIntelligence,
  }));

  const reflections = toReflectionSummaries(evidence);
  const reflectionPatterns = buildReflectionPatternInsights(evidence);

  return {
    client: {
      id: client.id,
      name: client.name,
      displayLabel: client.displayLabel,
      currentFocus: client.currentFocus,
      isSelfDevelopment: true,
    },
    focusItems,
    actions,
    evidence: evidenceSummary,
    reflections,
    reflectionPatterns,
    intelligencePatterns: patternsSafeForIntelligence(reflectionPatterns),
    maturity: buildMyDevelopmentMaturity({
      focusCount: focusItems.length,
      actions,
      evidence,
    }),
  };
}

function isReflectionRecord(item: DevelopmentEvidenceRecord): boolean {
  return (
    item.evidenceType === "personal_reflection" ||
    item.evidenceType === "reflection"
  );
}

function observationValue(
  item: DevelopmentEvidenceRecord,
  titleMatch: RegExp
): string | null {
  const found = (item.structuredEvidence.observations ?? []).find(observation =>
    titleMatch.test(observation.title)
  );
  return found?.description?.trim() || null;
}

export function toReflectionSummaries(
  evidence: DevelopmentEvidenceRecord[]
): MyDevelopmentReflectionSummary[] {
  return evidence
    .filter(item => isReflectionRecord(item) && !item.deletedAt)
    .sort((a, b) => {
      const aDate = a.evidenceDate || a.capturedAt;
      const bDate = b.evidenceDate || b.capturedAt;
      return bDate.localeCompare(aDate) || b.capturedAt.localeCompare(a.capturedAt);
    })
    .map(item => ({
      id: item.id,
      title: item.title,
      evidenceDate: item.evidenceDate,
      capturedAt: item.capturedAt,
      preview: (item.sourceSummary ?? "").slice(0, 160),
      whatNoticed: boundMyDevelopmentLearningSnippet(
        observationValue(item, /noticed/i)
      ),
      practiseNext: boundMyDevelopmentLearningSnippet(
        observationValue(item, /practise next/i)
      ),
    }));
}

export function toReflectionDetail(
  item: DevelopmentEvidenceRecord
): MyDevelopmentReflectionDetail {
  const contextObs = (item.structuredEvidence.observations ?? []).find(o =>
    /context/i.test(o.title)
  );
  return {
    id: item.id,
    title: item.title,
    evidenceDate: item.evidenceDate,
    capturedAt: item.capturedAt,
    preview: (item.sourceSummary ?? "").slice(0, 160),
    whatNoticed: observationValue(item, /noticed/i),
    practiseNext: observationValue(item, /practise next/i),
    context: contextObs?.description?.trim() || null,
    whatHappened: observationValue(item, /what happened/i),
    whatWorked: observationValue(item, /what worked/i),
    whatWasDifficult: observationValue(item, /difficult/i),
    whatDifferently: observationValue(item, /differently/i),
    anythingElse: observationValue(item, /anything else/i),
    sourceSummary: item.sourceSummary,
  };
}

export async function listMyDevelopmentReflections(input: {
  supabase: SupabaseClient;
  organisationId: string;
  userId: string;
  fullName: string;
}): Promise<MyDevelopmentReflectionSummary[]> {
  const client = await resolveSelfClient(input);
  const evidence = await listEvidenceForClient(
    input.supabase,
    input.userId,
    client.id
  );
  return toReflectionSummaries(evidence);
}

export async function getMyDevelopmentReflection(input: {
  supabase: SupabaseClient;
  organisationId: string;
  userId: string;
  fullName: string;
  reflectionId: string;
}): Promise<MyDevelopmentReflectionDetail | null> {
  const client = await resolveSelfClient(input);
  const evidence = await listEvidenceForClient(
    input.supabase,
    input.userId,
    client.id
  );
  const found = evidence.find(
    item =>
      item.id === input.reflectionId &&
      isReflectionRecord(item) &&
      !item.deletedAt
  );
  return found ? toReflectionDetail(found) : null;
}

/**
 * Build theme rows for My Development focus.
 * organisation_id is always taken from the authenticated current organisation
 * (never from browser input).
 */
export function buildMyDevelopmentFocusItemRows(input: {
  clientId: string;
  coachId: string;
  organisationId: string;
  priorities: string[];
}): Array<{
  id: string;
  client_id: string;
  coach_id: string;
  organisation_id: string;
  item_type: "theme";
  title: string;
  detail: null;
  status: null;
  evidence: null;
  event_date: null;
}> {
  const organisationId = input.organisationId.trim();
  if (!organisationId) {
    throw new Error("Organisation is required to save development focus.");
  }
  return input.priorities
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 12)
    .map(title => ({
      id: crypto.randomUUID(),
      client_id: input.clientId,
      coach_id: input.coachId,
      organisation_id: organisationId,
      item_type: "theme" as const,
      title,
      detail: null,
      status: null,
      evidence: null,
      event_date: null,
    }));
}

async function assertSelfClientOrganisation(input: {
  supabase: SupabaseClient;
  clientId: string;
  userId: string;
  organisationId: string;
}): Promise<void> {
  const { data, error } = await input.supabase
    .from("clients")
    .select("id, organisation_id, coach_id")
    .eq("id", input.clientId)
    .eq("coach_id", input.userId)
    .maybeSingle();

  if (error || !data) {
    throw new Error("My Development record not found in this organisation.");
  }

  const clientOrg =
    typeof data.organisation_id === "string" ? data.organisation_id.trim() : "";
  if (!clientOrg || clientOrg !== input.organisationId.trim()) {
    throw new Error(
      "My Development record does not belong to the current organisation."
    );
  }
}

export async function updateMyDevelopmentFocus(input: {
  supabase: SupabaseClient;
  organisationId: string;
  userId: string;
  fullName: string;
  priorities: string[];
}): Promise<MyDevelopmentWorkspace> {
  const client = await resolveSelfClient(input);
  await assertSelfClientOrganisation({
    supabase: input.supabase,
    clientId: client.id,
    userId: input.userId,
    organisationId: input.organisationId,
  });

  const cleaned = input.priorities
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 12);

  await input.supabase
    .from("client_items")
    .delete()
    .eq("client_id", client.id)
    .eq("coach_id", input.userId)
    .eq("organisation_id", input.organisationId)
    .eq("item_type", "theme");

  if (cleaned.length > 0) {
    const rows = buildMyDevelopmentFocusItemRows({
      clientId: client.id,
      coachId: input.userId,
      organisationId: input.organisationId,
      priorities: cleaned,
    });
    const { error } = await input.supabase.from("client_items").insert(rows);
    if (error) {
      throw new Error(error.message || "Unable to save development focus.");
    }
  }

  const summary =
    cleaned.length > 0 ? cleaned.join(" · ") : "Personal development record";
  const { error: focusError } = await input.supabase
    .from("clients")
    .update({
      current_focus: summary,
      updated_at: new Date().toISOString(),
    })
    .eq("id", client.id)
    .eq("organisation_id", input.organisationId)
    .eq("coach_id", input.userId);

  if (focusError) {
    throw new Error(focusError.message || "Unable to update current focus.");
  }

  return loadMyDevelopmentWorkspace(input);
}

function composeReflectionText(input: MyDevelopmentReflectionInput): {
  title: string;
  summary: string;
  structured: StructuredEvidence;
} {
  const fields: Array<{ title: string; value: string; category: string }> = [
    {
      title: "Context",
      value: (input.context ?? "").trim(),
      category: "Context",
    },
    {
      title: "What happened",
      value: (input.whatHappened ?? "").trim(),
      category: "Reflection",
    },
    {
      title: "What I noticed",
      value: (input.whatNoticed ?? "").trim(),
      category: "Reflection",
    },
    {
      title: "What worked",
      value: (input.whatWorked ?? "").trim(),
      category: "Strength signal",
    },
    {
      title: "What was difficult",
      value: (input.whatWasDifficult ?? "").trim(),
      category: "Development theme",
    },
    {
      title: "What I might do differently",
      value: (input.whatDifferently ?? "").trim(),
      category: "Development theme",
    },
    {
      title: "What I want to practise next",
      value: (input.practiseNext ?? "").trim(),
      category: "Development priority",
    },
    {
      title: "Anything else",
      value: (input.anythingElse ?? "").trim(),
      category: "Reflection",
    },
  ].filter(field => field.value);

  if (fields.length === 0) {
    throw new Error("Add at least one reflection note before saving.");
  }

  const observations = fields.map(field => ({
    title: field.title,
    description: field.value,
    category: field.category,
    behaviouralEvidence: field.value,
    developmentImplication:
      field.category === "Development priority" ||
      field.category === "Development theme"
        ? field.value
        : undefined,
    sourceConfidence: "medium" as const,
  }));

  const strengthSignals = fields
    .filter(field => field.category === "Strength signal")
    .map(field => field.value);
  const developmentSignals = fields
    .filter(
      field =>
        field.category === "Development theme" ||
        field.category === "Development priority"
    )
    .map(field => field.value);

  const summary = fields.map(field => `${field.title}: ${field.value}`).join("\n\n");
  const dateLabel = new Date().toISOString().slice(0, 10);
  const customTitle = (input.title ?? "").trim();

  return {
    title: customTitle || `Development reflection · ${dateLabel}`,
    summary,
    structured: {
      observations,
      strengthSignals,
      developmentSignals,
      capabilitySignals: [],
      contradictoryEvidence: [],
      context: [
        "Manager-authored development reflection",
        "One reflection is a single source — not a definitive behavioural conclusion.",
      ],
      limitations: [
        "Treat each reflection as one observation. Recurring themes emerge only across multiple reflections.",
      ],
    },
  };
}

export async function createMyDevelopmentReflection(input: {
  supabase: SupabaseClient;
  organisationId: string;
  userId: string;
  fullName: string;
  reflection: MyDevelopmentReflectionInput;
}): Promise<{ evidenceId: string; workspace: MyDevelopmentWorkspace }> {
  const client = await resolveSelfClient(input);
  const composed = composeReflectionText(input.reflection);
  const evidenceDate = new Date().toISOString().slice(0, 10);
  const freshnessClass = calculateEvidenceFreshness({
    evidenceType: "personal_reflection",
    evidenceDate,
  });

  const { data: evidenceRow, error: evidenceError } = await input.supabase
    .from("development_evidence")
    .insert({
      organisation_id: input.organisationId,
      client_id: client.id,
      evidence_type: "personal_reflection",
      source_type: "manual_entry",
      title: composed.title,
      evidence_date: evidenceDate,
      captured_by: input.userId,
      processing_status: "ready",
      review_status: "approved",
      include_in_intelligence: true,
      structured_evidence: composed.structured,
      source_summary: composed.summary.slice(0, 2000),
      freshness_class: freshnessClass,
      restricted: false,
      purpose: "Manager development reflection",
      source_label: "My development reflection",
      capability_keys: [],
    })
    .select("*")
    .single();

  if (evidenceError || !evidenceRow) {
    throw new Error(
      evidenceError?.message?.trim() || "Unable to save your reflection."
    );
  }

  const evidenceId = String(evidenceRow.id);
  const observationRows = (composed.structured.observations ?? []).map(
    (observation, index) => ({
      evidence_id: evidenceId,
      organisation_id: input.organisationId,
      client_id: client.id,
      title: observation.title,
      description: observation.description,
      category: observation.category ?? null,
      behavioural_evidence: observation.behaviouralEvidence ?? null,
      development_implication: observation.developmentImplication ?? null,
      source_confidence: observation.sourceConfidence ?? "medium",
      assessment_context: null,
      limitations: null,
      capability_key: null,
      include_in_intelligence: true,
      review_status: "approved",
      sort_order: index,
    })
  );

  if (observationRows.length > 0) {
    const { error: observationError } = await input.supabase
      .from("development_evidence_observations")
      .insert(observationRows);
    if (observationError) {
      throw new Error("Unable to save reflection observations.");
    }
  }

  await writeEvidenceAudit({
    supabase: input.supabase,
    organisationId: input.organisationId,
    clientId: client.id,
    evidenceId,
    actorUserId: input.userId,
    action: "evidence_reviewed",
    metadata: {
      evidenceType: "personal_reflection",
      reviewStatus: "approved",
      includeInIntelligence: true,
      observationCount: observationRows.length,
    },
  });

  const workspace = await loadMyDevelopmentWorkspace(input);
  return { evidenceId, workspace };
}

async function profileFullName(
  supabase: SupabaseClient,
  userId: string,
  emailFallback?: string | null
): Promise<string> {
  const { data } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();
  return (
    (typeof data?.full_name === "string" && data.full_name.trim()) ||
    emailFallback?.split("@")[0] ||
    "My development"
  );
}

export async function resolveMyDevelopmentActor(input: {
  supabase: SupabaseClient;
  organisationId: string;
  userId: string;
  email?: string | null;
}): Promise<{ fullName: string }> {
  return {
    fullName: await profileFullName(
      input.supabase,
      input.userId,
      input.email
    ),
  };
}
