/**
 * DATA-LIFECYCLE DL-08 Slice 1 — read-only migration-review attribution.
 *
 * Uses the DL-07 join algorithm (table_name + record_id → clients/sessions).
 * details JSON is never selected and is never attribution authority.
 * Does not delete, update, insert, copy, or purge review rows.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  attributeMigrationReviewRecord,
  MIGRATION_REVIEW_ATTRIBUTABLE_TABLES,
  type MigrationReviewAttribution,
} from "@/lib/owner/organisation-purge-architecture";
import { isUuid } from "@/lib/uuid";

export const MIGRATION_REVIEW_ROW_SELECT = "id, table_name, record_id";
export const MIGRATION_REVIEW_CLIENT_SELECT = "id, organisation_id";
export const MIGRATION_REVIEW_SESSION_SELECT = "id, organisation_id, client_id";
export const MIGRATION_REVIEW_ASSIGNMENT_SELECT = "client_id, organisation_id";

export const MIGRATION_REVIEW_AMBIGUOUS_CODE = "MIGRATION_REVIEW_AMBIGUOUS";
export const MIGRATION_REVIEW_UNKNOWN_TABLE_CODE =
  "MIGRATION_REVIEW_UNKNOWN_TABLE";

export const MIGRATION_REVIEW_DETAILS_NEVER_AUTHORITY_LIMITATION =
  "organisation_migration_review.details JSON is not searched and is never attribution authority; attribution uses table_name + record_id joined to clients and sessions.";

const PAGE_SIZE = 1000;
const IN_CHUNK = 100;
const ATTRIBUTABLE = new Set<string>(MIGRATION_REVIEW_ATTRIBUTABLE_TABLES);

export type MigrationReviewAssessment = {
  attributedCount: number;
  ambiguousCount: number;
  unknownTableCount: number;
  evaluatedRowCount: number;
  counted: boolean;
  error?: string;
  mutatedNothing: true;
  attributions: MigrationReviewAttribution[];
};

function asUuid(value: unknown): string | null {
  return typeof value === "string" && isUuid(value) ? value : null;
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asObjectRows(data: unknown): Record<string, unknown>[] {
  if (!Array.isArray(data)) return [];
  return data.filter(
    (row): row is Record<string, unknown> =>
      typeof row === "object" && row !== null && !Array.isArray(row)
  );
}

async function listSelected(
  supabase: SupabaseClient,
  table: string,
  columns: string
): Promise<{ rows: Record<string, unknown>[]; ok: boolean; error?: string }> {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      return { rows: [], ok: false, error: error.message };
    }
    const page = asObjectRows(data);
    rows.push(...page);
    if (page.length < PAGE_SIZE) {
      return { rows, ok: true };
    }
  }
}

async function listByIds(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  ids: string[]
): Promise<{ rows: Record<string, unknown>[]; ok: boolean; error?: string }> {
  if (ids.length === 0) return { rows: [], ok: true };
  const rows: Record<string, unknown>[] = [];
  for (let index = 0; index < ids.length; index += IN_CHUNK) {
    const chunk = ids.slice(index, index + IN_CHUNK);
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .in("id", chunk);
    if (error) {
      return { rows: [], ok: false, error: error.message };
    }
    rows.push(...asObjectRows(data));
  }
  return { rows, ok: true };
}

async function listActiveAssignments(
  supabase: SupabaseClient,
  clientIds: string[]
): Promise<{
  byClientId: Map<string, string[]>;
  ok: boolean;
  error?: string;
}> {
  const byClientId = new Map<string, string[]>();
  if (clientIds.length === 0) return { byClientId, ok: true };
  for (let index = 0; index < clientIds.length; index += IN_CHUNK) {
    const chunk = clientIds.slice(index, index + IN_CHUNK);
    const { data, error } = await supabase
      .from("relationship_assignments")
      .select(MIGRATION_REVIEW_ASSIGNMENT_SELECT)
      .eq("status", "active")
      .in("client_id", chunk);
    if (error) {
      return { byClientId, ok: false, error: error.message };
    }
    for (const row of asObjectRows(data)) {
      const clientId = asUuid(row.client_id);
      const organisationId = asUuid(row.organisation_id);
      if (!clientId || !organisationId) continue;
      const existing = byClientId.get(clientId) ?? [];
      existing.push(organisationId);
      byClientId.set(clientId, existing);
    }
  }
  return { byClientId, ok: true };
}

/**
 * Authoritative, read-only assessment of organisation_migration_review for one
 * target organisation. Unrelated not_attributed rows are excluded from counts.
 */
export async function assessOrganisationMigrationReview(input: {
  supabase: SupabaseClient;
  organisationId: string;
  descendantIds: ReadonlySet<string>;
}): Promise<MigrationReviewAssessment> {
  const empty = (
    extra: Partial<MigrationReviewAssessment>
  ): MigrationReviewAssessment => ({
    attributedCount: 0,
    ambiguousCount: 0,
    unknownTableCount: 0,
    evaluatedRowCount: 0,
    counted: false,
    mutatedNothing: true,
    attributions: [],
    ...extra,
  });

  const review = await listSelected(
    input.supabase,
    "organisation_migration_review",
    MIGRATION_REVIEW_ROW_SELECT
  );
  if (!review.ok) {
    return empty({ error: review.error });
  }

  const clientRecordIds: string[] = [];
  const sessionRecordIds: string[] = [];
  for (const row of review.rows) {
    const tableName = asText(row.table_name);
    const recordId = asUuid(row.record_id);
    if (!tableName || !recordId) continue;
    if (tableName === "clients") clientRecordIds.push(recordId);
    if (tableName === "sessions") sessionRecordIds.push(recordId);
  }

  const clientsResult = await listByIds(
    input.supabase,
    "clients",
    MIGRATION_REVIEW_CLIENT_SELECT,
    [...new Set(clientRecordIds)]
  );
  if (!clientsResult.ok) {
    return empty({ error: clientsResult.error });
  }

  const sessionsResult = await listByIds(
    input.supabase,
    "sessions",
    MIGRATION_REVIEW_SESSION_SELECT,
    [...new Set(sessionRecordIds)]
  );
  if (!sessionsResult.ok) {
    return empty({ error: sessionsResult.error });
  }

  const clientsById = new Map<
    string,
    { id: string; organisationId: string | null }
  >();
  for (const row of clientsResult.rows) {
    const id = asUuid(row.id);
    if (!id) continue;
    clientsById.set(id, {
      id,
      organisationId: asUuid(row.organisation_id),
    });
  }

  const sessionsById = new Map<
    string,
    { id: string; organisationId: string | null; clientId: string }
  >();
  const sessionClientIds: string[] = [];
  for (const row of sessionsResult.rows) {
    const id = asUuid(row.id);
    const clientId = asUuid(row.client_id);
    if (!id || !clientId) continue;
    sessionsById.set(id, {
      id,
      organisationId: asUuid(row.organisation_id),
      clientId,
    });
    sessionClientIds.push(clientId);
  }

  const missingSessionClientIds = [...new Set(sessionClientIds)].filter(
    id => !clientsById.has(id)
  );
  if (missingSessionClientIds.length > 0) {
    const extraClients = await listByIds(
      input.supabase,
      "clients",
      MIGRATION_REVIEW_CLIENT_SELECT,
      missingSessionClientIds
    );
    if (!extraClients.ok) {
      return empty({ error: extraClients.error });
    }
    for (const row of extraClients.rows) {
      const id = asUuid(row.id);
      if (!id) continue;
      clientsById.set(id, {
        id,
        organisationId: asUuid(row.organisation_id),
      });
    }
  }

  const assignmentClientIds = [
    ...new Set([...clientRecordIds, ...sessionClientIds]),
  ];
  const assignments = await listActiveAssignments(
    input.supabase,
    assignmentClientIds
  );
  if (!assignments.ok) {
    return empty({ error: assignments.error });
  }

  let attributedCount = 0;
  let ambiguousCount = 0;
  let unknownTableCount = 0;
  const attributions: MigrationReviewAttribution[] = [];

  for (const row of review.rows) {
    const tableName = asText(row.table_name) ?? "";
    const recordId = asText(row.record_id) ?? "";
    if (!ATTRIBUTABLE.has(tableName)) {
      const recordUuid = asUuid(recordId);
      if (recordUuid && input.descendantIds.has(recordUuid)) {
        const attribution = attributeMigrationReviewRecord({
          tableName,
          recordId,
          targetOrganisationId: input.organisationId,
          activeAssignmentOrganisationIds: [],
        });
        unknownTableCount += 1;
        attributions.push(attribution);
      }
      continue;
    }

    const session = tableName === "sessions" ? sessionsById.get(recordId) : undefined;
    const clientIdForAssignments =
      tableName === "clients"
        ? recordId
        : (session?.clientId ?? recordId);
    const attribution = attributeMigrationReviewRecord({
      tableName,
      recordId,
      targetOrganisationId: input.organisationId,
      sourceClient:
        tableName === "clients" ? (clientsById.get(recordId) ?? null) : undefined,
      sourceSession: session ?? null,
      sessionClient: session
        ? (clientsById.get(session.clientId) ?? null)
        : undefined,
      activeAssignmentOrganisationIds:
        assignments.byClientId.get(clientIdForAssignments) ?? [],
    });

    if (attribution.result === "attributed") {
      attributedCount += 1;
      attributions.push(attribution);
      continue;
    }
    if (attribution.result === "ambiguous") {
      ambiguousCount += 1;
      attributions.push(attribution);
      continue;
    }
    if (attribution.result === "unknown_table") {
      const recordUuid = asUuid(recordId);
      if (recordUuid && input.descendantIds.has(recordUuid)) {
        unknownTableCount += 1;
        attributions.push(attribution);
      }
    }
  }

  return {
    attributedCount,
    ambiguousCount,
    unknownTableCount,
    evaluatedRowCount: review.rows.length,
    counted: true,
    mutatedNothing: true,
    attributions,
  };
}

export function migrationReviewReviewReasons(
  assessment: MigrationReviewAssessment
): Array<{ code: string; severity: "review"; message: string }> {
  const reasons: Array<{ code: string; severity: "review"; message: string }> = [];
  if (!assessment.counted) {
    return reasons;
  }
  if (assessment.ambiguousCount > 0) {
    reasons.push({
      code: MIGRATION_REVIEW_AMBIGUOUS_CODE,
      severity: "review",
      message:
        "One or more organisation_migration_review rows that could concern this organisation are ambiguous and cannot be attributed by join.",
    });
  }
  if (assessment.unknownTableCount > 0) {
    reasons.push({
      code: MIGRATION_REVIEW_UNKNOWN_TABLE_CODE,
      severity: "review",
      message:
        "One or more organisation_migration_review rows for this organisation use a table_name that is not clients or sessions.",
    });
  }
  return reasons;
}
