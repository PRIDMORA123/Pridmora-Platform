/**
 * Stage 3.1 — keep relationship Organisation Intelligence free of
 * Manager self-development contamination.
 *
 * Filters aggregate candidates and adjusts counts using known self-development
 * client IDs. Does not change managed-person relationship meaning.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isSelfDevelopmentClientRow } from "@/lib/my-development/self-development-identity";
import type {
  OrganisationIntelligencePeriod,
  OrganisationIntelligenceSourceAggregates,
  ProgressSignalCandidate,
  ThemeCandidate,
} from "@/lib/organisation-intelligence/types";

function filterByRelationshipIds<T extends { relationshipId: string }>(
  rows: T[],
  selfDevelopmentIds: ReadonlySet<string>
): T[] {
  if (selfDevelopmentIds.size === 0) return rows;
  return rows.filter(row => !selfDevelopmentIds.has(row.relationshipId));
}

function clampNonNegative(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}

/**
 * List active self-development client IDs for an organisation.
 * Prefers is_self_development; falls back to role sentinel when column absent.
 */
export async function listSelfDevelopmentClientIdsForOrganisation(
  supabase: SupabaseClient,
  organisationId: string
): Promise<string[]> {
  const orgId = organisationId.trim();
  if (!orgId) return [];

  const withFlag = await supabase
    .from("clients")
    .select("id, role, is_self_development")
    .eq("organisation_id", orgId)
    .is("archived_at", null);

  if (!withFlag.error && withFlag.data) {
    return withFlag.data
      .filter(row =>
        isSelfDevelopmentClientRow({
          is_self_development: row.is_self_development as boolean | null,
          role: row.role as string | null,
        })
      )
      .map(row => String(row.id));
  }

  if (
    withFlag.error &&
    /is_self_development|schema cache|could not find/i.test(withFlag.error.message)
  ) {
    const fallback = await supabase
      .from("clients")
      .select("id, role")
      .eq("organisation_id", orgId)
      .eq("role", "Self development")
      .is("archived_at", null);
    if (fallback.error || !fallback.data) return [];
    return fallback.data.map(row => String(row.id));
  }

  return [];
}

async function countSelfDevelopmentActions(input: {
  supabase: SupabaseClient;
  organisationId: string;
  selfDevelopmentIds: string[];
  periodStart: string;
  periodEnd: string;
  completedOnly?: boolean;
}): Promise<number> {
  if (input.selfDevelopmentIds.length === 0) return 0;

  const start = `${input.periodStart}T00:00:00.000Z`;
  const endDate = new Date(`${input.periodEnd}T00:00:00.000Z`);
  endDate.setUTCDate(endDate.getUTCDate() + 1);
  const end = endDate.toISOString();

  let query = input.supabase
    .from("client_items")
    .select("id", { count: "exact", head: true })
    .eq("organisation_id", input.organisationId)
    .eq("item_type", "action")
    .in("client_id", input.selfDevelopmentIds)
    .gte("created_at", start)
    .lt("created_at", end);

  if (input.completedOnly) {
    // Match RPC: lower(status) in complete/completed — approximate with ilike.
    query = query.or("status.ilike.complete,status.ilike.completed");
  }

  const { count, error } = await query;
  if (error) return 0;
  return count ?? 0;
}

/**
 * Remove self-development relationships from relationship-OI aggregates.
 * Pure candidate filtering; count adjustments use optional measured deltas.
 */
export function excludeSelfDevelopmentFromAggregates(
  aggregates: OrganisationIntelligenceSourceAggregates,
  selfDevelopmentIds: ReadonlySet<string>,
  actionDeltas?: {
    actionsTotal?: number;
    actionsCompleted?: number;
    previousActionsTotal?: number;
    previousActionsCompleted?: number;
  }
): OrganisationIntelligenceSourceAggregates {
  if (selfDevelopmentIds.size === 0 && !actionDeltas) {
    return aggregates;
  }

  const themeCandidates = filterByRelationshipIds(
    aggregates.themeCandidates,
    selfDevelopmentIds
  );
  const previousThemeCandidates = filterByRelationshipIds(
    aggregates.previousThemeCandidates,
    selfDevelopmentIds
  );
  const itemThemes = filterByRelationshipIds(
    aggregates.itemThemes,
    selfDevelopmentIds
  );
  const progressSignals = filterByRelationshipIds(
    aggregates.progressSignals,
    selfDevelopmentIds
  ) as ProgressSignalCandidate[];

  const selfDevCount = selfDevelopmentIds.size;

  return {
    ...aggregates,
    activeRelationships: clampNonNegative(
      aggregates.activeRelationships - selfDevCount
    ),
    contributingRelationships: clampNonNegative(
      aggregates.contributingRelationships
    ),
    actionsTotal: clampNonNegative(
      aggregates.actionsTotal - (actionDeltas?.actionsTotal ?? 0)
    ),
    actionsCompleted: clampNonNegative(
      aggregates.actionsCompleted - (actionDeltas?.actionsCompleted ?? 0)
    ),
    previousActionsTotal: clampNonNegative(
      aggregates.previousActionsTotal - (actionDeltas?.previousActionsTotal ?? 0)
    ),
    previousActionsCompleted: clampNonNegative(
      aggregates.previousActionsCompleted -
        (actionDeltas?.previousActionsCompleted ?? 0)
    ),
    themeCandidates,
    previousThemeCandidates,
    itemThemes,
    progressSignals,
  };
}

export async function sanitizeOrganisationIntelligenceAggregates(input: {
  supabase: SupabaseClient;
  organisationId: string;
  period: OrganisationIntelligencePeriod;
  aggregates: OrganisationIntelligenceSourceAggregates;
}): Promise<OrganisationIntelligenceSourceAggregates> {
  // Stage 3.1A: when the hardened RPC already excluded self-development,
  // do not double-subtract counts. Candidate UUID filtering is also unnecessary.
  if (input.aggregates.selfDevelopmentExcluded) {
    return input.aggregates;
  }

  const ids = await listSelfDevelopmentClientIdsForOrganisation(
    input.supabase,
    input.organisationId
  );
  const selfDevelopmentIds = new Set(ids);
  if (selfDevelopmentIds.size === 0) {
    return input.aggregates;
  }

  const [
    actionsTotal,
    actionsCompleted,
    previousActionsTotal,
    previousActionsCompleted,
  ] = await Promise.all([
    countSelfDevelopmentActions({
      supabase: input.supabase,
      organisationId: input.organisationId,
      selfDevelopmentIds: ids,
      periodStart: input.period.periodStart,
      periodEnd: input.period.periodEnd,
    }),
    countSelfDevelopmentActions({
      supabase: input.supabase,
      organisationId: input.organisationId,
      selfDevelopmentIds: ids,
      periodStart: input.period.periodStart,
      periodEnd: input.period.periodEnd,
      completedOnly: true,
    }),
    countSelfDevelopmentActions({
      supabase: input.supabase,
      organisationId: input.organisationId,
      selfDevelopmentIds: ids,
      periodStart: input.aggregates.previousPeriodStart,
      periodEnd: input.aggregates.previousPeriodEnd,
    }),
    countSelfDevelopmentActions({
      supabase: input.supabase,
      organisationId: input.organisationId,
      selfDevelopmentIds: ids,
      periodStart: input.aggregates.previousPeriodStart,
      periodEnd: input.aggregates.previousPeriodEnd,
      completedOnly: true,
    }),
  ]);

  return excludeSelfDevelopmentFromAggregates(input.aggregates, selfDevelopmentIds, {
    actionsTotal,
    actionsCompleted,
    previousActionsTotal,
    previousActionsCompleted,
  });
}

/** Test helper: theme/action candidate arrays contain no self-dev relationship ids. */
export function aggregatesContainSelfDevelopmentRelationship(
  aggregates: OrganisationIntelligenceSourceAggregates,
  selfDevelopmentIds: ReadonlySet<string>
): boolean {
  const arrays: ThemeCandidate[][] = [
    aggregates.themeCandidates,
    aggregates.previousThemeCandidates,
    aggregates.itemThemes,
  ];
  for (const rows of arrays) {
    if (rows.some(row => selfDevelopmentIds.has(row.relationshipId))) {
      return true;
    }
  }
  return aggregates.progressSignals.some(row =>
    selfDevelopmentIds.has(row.relationshipId)
  );
}
