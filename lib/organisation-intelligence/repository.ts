import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveOrganisationIntelligencePeriod } from "@/lib/organisation-intelligence/periods";
import type {
  OrganisationIntelligencePeriod,
  OrganisationIntelligenceSourceAggregates,
  ThemeCandidate,
  ProgressSignalCandidate,
} from "@/lib/organisation-intelligence/types";
import type {
  AttentionAreaView,
  CapabilityTrendView,
  CoachingImpactView,
  EvidenceTrace,
  MetricView,
  OrganisationIntelligenceSnapshotView,
  RecommendationView,
  ThemeView,
} from "@/lib/organisation-intelligence/types";
import type { ConfidenceLevel, PeriodPreset } from "@/lib/organisation-intelligence/constants";

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return fallback;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asThemeCandidates(value: unknown): ThemeCandidate[] {
  if (!Array.isArray(value)) return [];
  const rows: ThemeCandidate[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    const themeKey =
      typeof item.themeKey === "string"
        ? item.themeKey
        : typeof item.theme_key === "string"
          ? item.theme_key
          : null;
    const relationshipId =
      typeof item.relationshipId === "string"
        ? item.relationshipId
        : typeof item.relationship_id === "string"
          ? item.relationship_id
          : null;
    if (!themeKey || !relationshipId) continue;
    rows.push({
      themeKey,
      category:
        typeof item.category === "string" ? item.category : null,
      relationshipId,
      sourceType:
        typeof item.sourceType === "string"
          ? item.sourceType
          : typeof item.source_type === "string"
            ? item.source_type
            : "unknown",
      occurredAt:
        typeof item.occurredAt === "string"
          ? item.occurredAt
          : typeof item.occurred_at === "string"
            ? item.occurred_at
            : null,
    });
  }
  return rows;
}

function asProgressSignals(value: unknown): ProgressSignalCandidate[] {
  if (!Array.isArray(value)) return [];
  const rows: ProgressSignalCandidate[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    const signalName =
      typeof item.signalName === "string"
        ? item.signalName
        : typeof item.signal_name === "string"
          ? item.signal_name
          : null;
    const relationshipId =
      typeof item.relationshipId === "string"
        ? item.relationshipId
        : typeof item.relationship_id === "string"
          ? item.relationship_id
          : null;
    if (!signalName || !relationshipId) continue;
    rows.push({
      signalName,
      direction: typeof item.direction === "string" ? item.direction : null,
      relationshipId,
      coachValidated:
        item.coachValidated === true || item.coach_validated === true,
    });
  }
  return rows;
}

export function mapSourceAggregates(
  payload: Record<string, unknown>
): OrganisationIntelligenceSourceAggregates {
  return {
    organisationId: String(payload.organisationId ?? payload.organisation_id ?? ""),
    periodStart: String(payload.periodStart ?? payload.period_start ?? ""),
    periodEnd: String(payload.periodEnd ?? payload.period_end ?? ""),
    previousPeriodStart: String(
      payload.previousPeriodStart ?? payload.previous_period_start ?? ""
    ),
    previousPeriodEnd: String(
      payload.previousPeriodEnd ?? payload.previous_period_end ?? ""
    ),
    activeRelationships: asNumber(payload.activeRelationships ?? payload.active_relationships),
    activePractitioners: asNumber(payload.activePractitioners ?? payload.active_practitioners),
    conversations: asNumber(payload.conversations),
    previousConversations: asNumber(
      payload.previousConversations ?? payload.previous_conversations
    ),
    completedConversations: asNumber(
      payload.completedConversations ?? payload.completed_conversations
    ),
    previousCompletedConversations: asNumber(
      payload.previousCompletedConversations ??
        payload.previous_completed_conversations
    ),
    actionsTotal: asNumber(payload.actionsTotal ?? payload.actions_total),
    actionsCompleted: asNumber(
      payload.actionsCompleted ?? payload.actions_completed
    ),
    previousActionsTotal: asNumber(
      payload.previousActionsTotal ?? payload.previous_actions_total
    ),
    previousActionsCompleted: asNumber(
      payload.previousActionsCompleted ?? payload.previous_actions_completed
    ),
    reflectionsCompleted: asNumber(
      payload.reflectionsCompleted ?? payload.reflections_completed
    ),
    previousReflectionsCompleted: asNumber(
      payload.previousReflectionsCompleted ??
        payload.previous_reflections_completed
    ),
    developmentUpdatesCompleted: asNumber(
      payload.developmentUpdatesCompleted ??
        payload.development_updates_completed
    ),
    previousDevelopmentUpdatesCompleted: asNumber(
      payload.previousDevelopmentUpdatesCompleted ??
        payload.previous_development_updates_completed
    ),
    evidenceItems: asNumber(payload.evidenceItems ?? payload.evidence_items),
    previousEvidenceItems: asNumber(
      payload.previousEvidenceItems ?? payload.previous_evidence_items
    ),
    contributingRelationships: asNumber(
      payload.contributingRelationships ?? payload.contributing_relationships
    ),
    themeCandidates: asThemeCandidates(
      payload.themeCandidates ?? payload.theme_candidates
    ),
    previousThemeCandidates: asThemeCandidates(
      payload.previousThemeCandidates ?? payload.previous_theme_candidates
    ),
    progressSignals: asProgressSignals(
      payload.progressSignals ?? payload.progress_signals
    ),
    itemThemes: asThemeCandidates(payload.itemThemes ?? payload.item_themes),
    hasEarlierPeriodActivity: asBoolean(
      payload.hasEarlierPeriodActivity ?? payload.has_earlier_period_activity
    ),
  };
}

export async function fetchOrganisationIntelligenceSources(
  supabase: SupabaseClient,
  organisationId: string,
  period: OrganisationIntelligencePeriod
): Promise<OrganisationIntelligenceSourceAggregates> {
  const { data, error } = await supabase.rpc(
    "aggregate_organisation_intelligence_sources",
    {
      p_organisation_id: organisationId,
      p_period_start: period.periodStart,
      p_period_end: period.periodEnd,
    }
  );

  if (error) {
    throw new Error(error.message || "Unable to aggregate organisation intelligence.");
  }

  if (!data || typeof data !== "object") {
    throw new Error("Organisation intelligence aggregation returned no data.");
  }

  return mapSourceAggregates(data as Record<string, unknown>);
}

export async function acquireGenerationLock(input: {
  supabase: SupabaseClient;
  organisationId: string;
  userId: string;
  snapshotId: string;
}): Promise<{ ok: true } | { ok: false; reason: "locked" }> {
  const { data: existing } = await input.supabase
    .from("organisation_intelligence_generation_locks")
    .select("organisation_id, locked_at")
    .eq("organisation_id", input.organisationId)
    .maybeSingle();

  if (existing?.locked_at) {
    const lockedAt = new Date(existing.locked_at as string).getTime();
    if (Number.isFinite(lockedAt) && Date.now() - lockedAt < 5 * 60 * 1000) {
      return { ok: false, reason: "locked" };
    }
  }

  const { error } = await input.supabase
    .from("organisation_intelligence_generation_locks")
    .upsert(
      {
        organisation_id: input.organisationId,
        locked_by: input.userId,
        locked_at: new Date().toISOString(),
        snapshot_id: input.snapshotId,
      },
      { onConflict: "organisation_id" }
    );

  if (error) {
    return { ok: false, reason: "locked" };
  }
  return { ok: true };
}

export async function releaseGenerationLock(input: {
  supabase: SupabaseClient;
  organisationId: string;
}): Promise<void> {
  await input.supabase
    .from("organisation_intelligence_generation_locks")
    .delete()
    .eq("organisation_id", input.organisationId);
}

export async function insertGeneratingSnapshot(input: {
  supabase: SupabaseClient;
  organisationId: string;
  period: OrganisationIntelligencePeriod;
  userId: string;
  privacyThreshold: number;
}): Promise<string> {
  const { data, error } = await input.supabase
    .from("organisation_intelligence_snapshots")
    .insert({
      organisation_id: input.organisationId,
      period_start: input.period.periodStart,
      period_end: input.period.periodEnd,
      period_key: input.period.preset,
      generated_by: input.userId,
      status: "generating",
      confidence_level: "low",
      privacy_threshold: input.privacyThreshold,
      metadata: {
        comparisonLabel: input.period.comparisonLabel,
        periodLabel: input.period.label,
      },
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Unable to create intelligence snapshot.");
  }
  return data.id as string;
}

export async function persistSnapshotView(input: {
  supabase: SupabaseClient;
  view: OrganisationIntelligenceSnapshotView;
}): Promise<void> {
  const view = input.view;
  const { error: snapshotError } = await input.supabase
    .from("organisation_intelligence_snapshots")
    .update({
      source_relationship_count: view.sourceRelationshipCount,
      source_conversation_count: view.sourceConversationCount,
      source_evidence_count: view.sourceEvidenceCount,
      confidence_level: view.confidenceLevel,
      executive_brief: view.executiveBrief,
      status: view.status,
      restricted_evidence_excluded: view.restrictedEvidenceExcluded,
      privacy_threshold: view.privacyThreshold,
      generated_at: view.generatedAt,
      metadata: {
        period: view.period,
        emptyState: view.emptyState,
        capabilities: view.capabilities,
        attentionAreas: view.attentionAreas,
        coachingImpact: view.coachingImpact,
        evidenceTraces: view.evidenceTraces,
      },
      generation_error: null,
    })
    .eq("id", view.id);

  if (snapshotError) {
    throw new Error(snapshotError.message);
  }

  await input.supabase
    .from("organisation_intelligence_metrics")
    .delete()
    .eq("snapshot_id", view.id);
  await input.supabase
    .from("organisation_intelligence_themes")
    .delete()
    .eq("snapshot_id", view.id);
  await input.supabase
    .from("organisation_intelligence_recommendations")
    .delete()
    .eq("snapshot_id", view.id);

  if (view.metrics.length > 0) {
    const { error } = await input.supabase
      .from("organisation_intelligence_metrics")
      .insert(
        view.metrics.map(metric => ({
          snapshot_id: view.id,
          metric_key: metric.metricKey,
          metric_label: metric.metricLabel,
          metric_value: metric.metricValue,
          previous_value: metric.previousValue,
          direction: metric.direction,
          confidence_level: metric.confidenceLevel,
          evidence_count: metric.evidenceCount,
          relationship_count: metric.relationshipCount,
          suppressed: metric.suppressed,
          metadata: {
            ...metric.metadata,
            displayValue: metric.displayValue,
            comparisonAvailable: metric.comparisonAvailable,
            methodology: metric.methodology ?? null,
          },
        }))
      );
    if (error) throw new Error(error.message);
  }

  if (view.themes.length > 0) {
    const { error } = await input.supabase
      .from("organisation_intelligence_themes")
      .insert(
        view.themes.map(theme => ({
          snapshot_id: view.id,
          theme_key: theme.themeKey,
          theme_label: theme.themeLabel,
          evidence_count: theme.evidenceCount,
          relationship_count: theme.relationshipCount,
          direction: theme.direction,
          confidence_level: theme.confidenceLevel,
          summary: theme.summary,
          suppressed: theme.suppressed,
          related_capabilities: theme.relatedCapabilities,
          evidence_types: theme.evidenceTypes,
          metadata: theme.metadata,
        }))
      );
    if (error) throw new Error(error.message);
  }

  if (view.recommendations.length > 0) {
    const { error } = await input.supabase
      .from("organisation_intelligence_recommendations")
      .insert(
        view.recommendations.map(row => ({
          snapshot_id: view.id,
          priority: row.priority,
          title: row.title,
          rationale: row.rationale,
          recommendation: row.recommendation,
          confidence_level: row.confidenceLevel,
          evidence_count: row.evidenceCount,
          relationship_count: row.relationshipCount,
          status: row.status,
        }))
      );
    if (error) throw new Error(error.message);
  }
}

export async function markSnapshotFailed(input: {
  supabase: SupabaseClient;
  snapshotId: string;
  message: string;
}): Promise<void> {
  await input.supabase
    .from("organisation_intelligence_snapshots")
    .update({
      status: "failed",
      generation_error: input.message.slice(0, 500),
    })
    .eq("id", input.snapshotId);
}

export async function listOrganisationIntelligenceSnapshots(input: {
  supabase: SupabaseClient;
  organisationId: string;
  limit?: number;
}): Promise<
  Array<{
    id: string;
    periodStart: string;
    periodEnd: string;
    periodKey: string;
    generatedAt: string;
    confidenceLevel: ConfidenceLevel;
    status: string;
    sourceRelationshipCount: number;
  }>
> {
  const { data, error } = await input.supabase
    .from("organisation_intelligence_snapshots")
    .select(
      "id, period_start, period_end, period_key, generated_at, confidence_level, status, source_relationship_count"
    )
    .eq("organisation_id", input.organisationId)
    .in("status", ["ready", "failed"])
    .order("generated_at", { ascending: false })
    .limit(input.limit ?? 12);

  if (error) throw new Error(error.message);

  return (data ?? []).map(row => ({
    id: row.id as string,
    periodStart: row.period_start as string,
    periodEnd: row.period_end as string,
    periodKey: row.period_key as string,
    generatedAt: row.generated_at as string,
    confidenceLevel: row.confidence_level as ConfidenceLevel,
    status: row.status as string,
    sourceRelationshipCount: row.source_relationship_count as number,
  }));
}

export async function loadOrganisationIntelligenceSnapshot(input: {
  supabase: SupabaseClient;
  organisationId: string;
  organisationName: string;
  snapshotId?: string | null;
}): Promise<OrganisationIntelligenceSnapshotView | null> {
  let query = input.supabase
    .from("organisation_intelligence_snapshots")
    .select("*")
    .eq("organisation_id", input.organisationId)
    .eq("status", "ready");

  if (input.snapshotId) {
    query = query.eq("id", input.snapshotId);
  } else {
    query = query.order("generated_at", { ascending: false }).limit(1);
  }

  const { data: snapshot, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  if (!snapshot) return null;

  const snapshotId = snapshot.id as string;
  const [metricsResult, themesResult, recommendationsResult] = await Promise.all([
    input.supabase
      .from("organisation_intelligence_metrics")
      .select("*")
      .eq("snapshot_id", snapshotId),
    input.supabase
      .from("organisation_intelligence_themes")
      .select("*")
      .eq("snapshot_id", snapshotId),
    input.supabase
      .from("organisation_intelligence_recommendations")
      .select("*")
      .eq("snapshot_id", snapshotId)
      .order("priority", { ascending: true }),
  ]);

  if (metricsResult.error) throw new Error(metricsResult.error.message);
  if (themesResult.error) throw new Error(themesResult.error.message);
  if (recommendationsResult.error) {
    throw new Error(recommendationsResult.error.message);
  }

  const metadata = (snapshot.metadata ?? {}) as Record<string, unknown>;
  const periodMeta = (metadata.period ?? {}) as Partial<OrganisationIntelligencePeriod>;
  const period = resolveOrganisationIntelligencePeriod({
    preset: (snapshot.period_key as PeriodPreset) || "custom",
    periodStart: snapshot.period_start as string,
    periodEnd: snapshot.period_end as string,
  });

  const metrics: MetricView[] = (metricsResult.data ?? []).map(row => {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    return {
      metricKey: row.metric_key as string,
      metricLabel: row.metric_label as string,
      metricValue:
        row.metric_value == null ? null : Number(row.metric_value),
      previousValue:
        row.previous_value == null ? null : Number(row.previous_value),
      direction: (row.direction as MetricView["direction"]) ?? null,
      confidenceLevel: row.confidence_level as ConfidenceLevel,
      evidenceCount: row.evidence_count as number,
      relationshipCount: (row.relationship_count as number) ?? 0,
      suppressed: Boolean(row.suppressed),
      displayValue:
        typeof meta.displayValue === "string"
          ? meta.displayValue
          : row.metric_value == null
            ? "Not enough evidence to report safely."
            : String(row.metric_value),
      comparisonAvailable: meta.comparisonAvailable === true,
      methodology:
        typeof meta.methodology === "string" ? meta.methodology : undefined,
      metadata: meta,
    };
  });

  const themes: ThemeView[] = (themesResult.data ?? [])
    .filter(row => !row.suppressed)
    .map(row => ({
      themeKey: row.theme_key as string,
      themeLabel: row.theme_label as string,
      evidenceCount: row.evidence_count as number,
      relationshipCount: row.relationship_count as number,
      direction: (row.direction as ThemeView["direction"]) ?? null,
      confidenceLevel: row.confidence_level as ConfidenceLevel,
      summary: (row.summary as string | null) ?? null,
      suppressed: Boolean(row.suppressed),
      relatedCapabilities: (row.related_capabilities as ThemeView["relatedCapabilities"]) ?? [],
      evidenceTypes: (row.evidence_types as string[]) ?? [],
      metadata: (row.metadata as Record<string, unknown>) ?? {},
    }));

  const recommendations: RecommendationView[] = (
    recommendationsResult.data ?? []
  ).map(row => ({
    priority: row.priority as number,
    title: row.title as string,
    rationale: row.rationale as string,
    recommendation: row.recommendation as string,
    confidenceLevel: row.confidence_level as ConfidenceLevel,
    evidenceCount: row.evidence_count as number,
    relationshipCount: (row.relationship_count as number) ?? 0,
    status: row.status as string,
  }));

  return {
    id: snapshotId,
    organisationId: input.organisationId,
    organisationName: input.organisationName,
    period: {
      ...period,
      label:
        typeof periodMeta.label === "string" ? periodMeta.label : period.label,
      comparisonLabel:
        typeof periodMeta.comparisonLabel === "string"
          ? periodMeta.comparisonLabel
          : period.comparisonLabel,
    },
    generatedAt: snapshot.generated_at as string,
    generatedBy: (snapshot.generated_by as string | null) ?? null,
    sourceRelationshipCount: snapshot.source_relationship_count as number,
    sourceConversationCount: snapshot.source_conversation_count as number,
    sourceEvidenceCount: (snapshot.source_evidence_count as number) ?? 0,
    confidenceLevel: snapshot.confidence_level as ConfidenceLevel,
    executiveBrief: (snapshot.executive_brief as string | null) ?? null,
    status: snapshot.status as OrganisationIntelligenceSnapshotView["status"],
    restrictedEvidenceExcluded: Boolean(snapshot.restricted_evidence_excluded),
    privacyThreshold: (snapshot.privacy_threshold as number) ?? 5,
    metrics,
    themes,
    capabilities: (metadata.capabilities as CapabilityTrendView[]) ?? [],
    recommendations,
    attentionAreas: (metadata.attentionAreas as AttentionAreaView[]) ?? [],
    coachingImpact: (metadata.coachingImpact as CoachingImpactView[]) ?? [],
    evidenceTraces: (metadata.evidenceTraces as EvidenceTrace[]) ?? [],
    emptyState: metadata.emptyState === true,
    insufficientEvidenceMessage:
      metadata.emptyState === true
        ? "Organisation Intelligence becomes available when enough anonymised coaching evidence has been recorded to report safely."
        : null,
  };
}
