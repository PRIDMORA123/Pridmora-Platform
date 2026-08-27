/**
 * DATA-LIFECYCLE DL-04 — read-only organisation deletion preflight.
 * Does not freeze, copy, purge, mutate status, or write deletion-foundation rows.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEVELOPMENT_EVIDENCE_STORAGE_BUCKET,
  parseDevelopmentEvidenceStoragePath,
} from "@/lib/development-evidence/storage-path";
import { UNDELETABLE_ORGANISATION_IDS_SETTING_KEY } from "@/lib/owner/organisation-deletion-foundation";
import {
  assessOrganisationMigrationReview,
  MIGRATION_REVIEW_DETAILS_NEVER_AUTHORITY_LIMITATION,
  migrationReviewReviewReasons,
} from "@/lib/owner/organisation-migration-review-attribution";
import { isUuid } from "@/lib/uuid";

export const DELETION_ELIGIBILITY = ["eligible", "blocked", "requires_review"] as const;
export type DeletionEligibility = (typeof DELETION_ELIGIBILITY)[number];

export type DeletionPreflightReason = {
  code: string;
  severity: "block" | "review";
  message: string;
};

export type InventoryDisposition =
  | "delete"
  | "remove_tenant_link"
  | "retain"
  | "retain_minimise"
  | "requires_review"
  | "external_follow_up";

export type InventorySurface = {
  key: string;
  table: string;
  category: string;
  count: number;
  targeting: string;
  disposition: InventoryDisposition;
  counted: boolean;
  optional?: boolean;
  error?: string;
};

export type StorageInventory = {
  bucket: string;
  category: string;
  databaseDocumentCount: number;
  authoritativePathCount: number;
  unparseablePathCount: number;
  foreignPathCount: number;
  prefixObjectCount: number | null;
  prefixListed: boolean;
  ownership: "authoritative" | "requires_review";
  deletedNothing: true;
};

export type SharedUserImpact = {
  userId: string;
  role: string;
  membershipStatus: string;
  otherActiveOrganisationCount: number;
  isPlatformOwner: boolean;
  survivesTenantDeletion: true;
};

export type OrganisationDeletionPreflight = {
  eligibility: DeletionEligibility;
  reasons: DeletionPreflightReason[];
  organisation: {
    id: string;
    name: string;
    organisationType: string;
    status: string;
    licenceStatus: string | null;
  } | null;
  inventory: InventorySurface[];
  storage: StorageInventory;
  commercial: InventorySurface[];
  sharedUsers: {
    membershipCount: number;
    soleTenantUserCount: number;
    sharedTenantUserCount: number;
    platformOwnerMemberCount: number;
    members: SharedUserImpact[];
    authUsersAreNotDeleted: true;
  };
  residuals: Array<{
    location: string;
    attributedCount: number;
    attribution:
      | "authoritative_record_id"
      | "authoritative_join"
      | "not_searched"
      | "ambiguous"
      | "unknown_table";
    disposition: InventoryDisposition;
    reason: string;
  }>;
  deletionFoundation: {
    openRunCount: number;
    certificateCount: number;
    retainedCommercialCount: number;
    wroteNothing: true;
  };
  knownLimitations: string[];
  confidentialityNote: string;
};

const CONFIDENTIALITY_NOTE =
  "Deletion preflight returns counts and operational metadata only. Coaching notes, private notes, reflections, preparation, conversation text, extracted evidence, intelligence content and report bodies are not included.";

const ORG_SCOPED_SURFACES: Array<{
  key: string;
  table: string;
  category: string;
  disposition: InventoryDisposition;
  targeting?: string;
}> = [
  { key: "memberships", table: "organisation_memberships", category: "membership", disposition: "remove_tenant_link" },
  { key: "invitations", table: "organisation_invitations", category: "membership", disposition: "delete" },
  { key: "assignments", table: "relationship_assignments", category: "membership", disposition: "delete" },
  { key: "clients", table: "clients", category: "relationships", disposition: "delete" },
  { key: "sessions", table: "sessions", category: "development", disposition: "delete" },
  { key: "clientItems", table: "client_items", category: "development", disposition: "delete" },
  { key: "privateIdentities", table: "client_private_identities", category: "identity", disposition: "delete" },
  { key: "coachingReports", table: "coaching_reports", category: "reports", disposition: "delete" },
  { key: "developmentReports", table: "development_reports", category: "reports", disposition: "delete" },
  { key: "developmentProfiles", table: "development_profiles", category: "development", disposition: "delete" },
  { key: "developmentUpdates", table: "development_updates", category: "development", disposition: "delete" },
  { key: "coachingMoments", table: "coaching_moments", category: "development", disposition: "delete" },
  { key: "intelligenceItems", table: "intelligence_items", category: "intelligence", disposition: "delete" },
  { key: "intelligenceEvidence", table: "intelligence_evidence", category: "intelligence", disposition: "delete" },
  { key: "sessionIntelligenceReviews", table: "session_intelligence_reviews", category: "intelligence", disposition: "delete" },
  { key: "questionInsights", table: "question_insights", category: "intelligence", disposition: "delete" },
  { key: "personProgressSignals", table: "person_progress_signals", category: "intelligence", disposition: "delete" },
  { key: "intelligenceAuditLog", table: "intelligence_audit_log", category: "audit", disposition: "delete" },
  { key: "developmentEvidence", table: "development_evidence", category: "evidence", disposition: "delete" },
  { key: "developmentEvidenceDocuments", table: "development_evidence_documents", category: "evidence", disposition: "delete" },
  { key: "developmentEvidenceObservations", table: "development_evidence_observations", category: "evidence", disposition: "delete" },
  { key: "developmentEvidenceLinks", table: "development_evidence_links", category: "evidence", disposition: "delete" },
  { key: "developmentEvidenceAuditLog", table: "development_evidence_audit_log", category: "audit", disposition: "delete" },
  { key: "developmentEvidenceAiUsage", table: "development_evidence_ai_usage", category: "usage", disposition: "delete" },
  { key: "organisationFrameworks", table: "organisation_frameworks", category: "frameworks", disposition: "delete" },
  { key: "organisationFrameworkCapabilities", table: "organisation_framework_capabilities", category: "frameworks", disposition: "delete" },
  { key: "organisationIntelligenceSnapshots", table: "organisation_intelligence_snapshots", category: "intelligence", disposition: "delete" },
  { key: "organisationIntelligenceLocks", table: "organisation_intelligence_generation_locks", category: "intelligence", disposition: "delete" },
  { key: "organisationAuditLog", table: "organisation_audit_log", category: "audit", disposition: "delete" },
  { key: "sampleOrganisationRecords", table: "sample_organisation_records", category: "sample", disposition: "delete" },
  { key: "profilesCurrentOrganisation", table: "profiles", category: "membership", disposition: "remove_tenant_link", targeting: "current_organisation_id" },
  { key: "supportCases", table: "support_cases", category: "support", disposition: "retain_minimise" },
  { key: "platformAuditEvents", table: "platform_audit_events", category: "audit", disposition: "retain_minimise" },
];

const COMMERCIAL_SURFACES: Array<{
  key: string;
  table: string;
  disposition: InventoryDisposition;
}> = [
  { key: "subscriptions", table: "organisation_subscriptions", disposition: "retain" },
  { key: "paymentMethods", table: "organisation_payment_methods", disposition: "retain" },
  { key: "invoices", table: "invoices", disposition: "retain" },
  { key: "purchaseOrders", table: "purchase_orders", disposition: "retain" },
  { key: "contracts", table: "organisation_contracts", disposition: "retain" },
  { key: "trials", table: "organisation_trials", disposition: "retain" },
];

const DESCENDANT_ID_TABLES = [
  "clients",
  "sessions",
  "organisation_memberships",
  "organisation_invitations",
  "relationship_assignments",
  "client_items",
  "client_private_identities",
  "coaching_reports",
  "development_reports",
  "development_profiles",
  "development_updates",
  "coaching_moments",
  "intelligence_items",
  "intelligence_evidence",
  "session_intelligence_reviews",
  "question_insights",
  "person_progress_signals",
  "intelligence_audit_log",
  "development_evidence",
  "development_evidence_documents",
  "development_evidence_observations",
  "development_evidence_links",
  "development_evidence_audit_log",
  "development_evidence_ai_usage",
  "organisation_frameworks",
  "organisation_framework_capabilities",
  "organisation_intelligence_snapshots",
  "organisation_audit_log",
  "sample_organisation_records",
  "support_cases",
] as const;

export function parseUndeletableOrganisationIds(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const ids = (value as { ids?: unknown }).ids;
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.filter((id): id is string => typeof id === "string" && isUuid(id)))];
}

export function resolveDeletionEligibility(input: {
  found: boolean;
  organisationType: string | null;
  isSampleInstallation: boolean;
  isUndeletable: boolean;
  inventoryIncomplete: boolean;
  reviewReasons: DeletionPreflightReason[];
}): { eligibility: DeletionEligibility; reasons: DeletionPreflightReason[] } {
  const reasons: DeletionPreflightReason[] = [];

  if (!input.found) {
    reasons.push({
      code: "ORGANISATION_NOT_FOUND",
      severity: "block",
      message: "Organisation was not found.",
    });
    return { eligibility: "blocked", reasons };
  }

  if (input.organisationType === "personal") {
    reasons.push({
      code: "PERSONAL_ORGANISATION",
      severity: "block",
      message: "Personal workspaces are outside the organisation deletion path.",
    });
  }

  if (input.isSampleInstallation) {
    reasons.push({
      code: "SAMPLE_INSTALLATION",
      severity: "block",
      message: "Sample installations must use the sample organisation lifecycle, not organisation deletion.",
    });
  }

  if (input.isUndeletable) {
    reasons.push({
      code: "UNDELETABLE_ORGANISATION",
      severity: "block",
      message: "This organisation ID is listed in undeletable_organisation_ids.",
    });
  }

  if (input.inventoryIncomplete) {
    reasons.push({
      code: "INVENTORY_INCOMPLETE",
      severity: "review",
      message: "Authoritative inventory could not count every required tenant data surface.",
    });
  }

  reasons.push(...input.reviewReasons);

  if (reasons.some(reason => reason.severity === "block")) {
    return { eligibility: "blocked", reasons };
  }
  if (reasons.some(reason => reason.severity === "review")) {
    return { eligibility: "requires_review", reasons };
  }
  return { eligibility: "eligible", reasons };
}

export function classifyEvidenceStoragePath(input: {
  storagePath: string | null | undefined;
  organisationId: string;
  organisationClientIds: ReadonlySet<string>;
}): "authoritative" | "unparseable" | "foreign" {
  const parsed = parseDevelopmentEvidenceStoragePath(input.storagePath);
  if (!parsed) return "unparseable";
  if (parsed.organisationSegment !== input.organisationId) return "foreign";
  if (!input.organisationClientIds.has(parsed.clientId)) return "foreign";
  return "authoritative";
}

function isMissingRelation(message: string): boolean {
  return (
    /could not find the table/i.test(message) ||
    /schema cache/i.test(message) ||
    /does not exist/i.test(message) ||
    /relation .* does not exist/i.test(message)
  );
}

type CountResult = {
  count: number;
  counted: boolean;
  optional?: boolean;
  error?: string;
};

async function countEq(
  supabase: SupabaseClient,
  table: string,
  column: string,
  value: string,
  options?: { optional?: boolean }
): Promise<CountResult> {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq(column, value);

  if (error) {
    if (options?.optional && isMissingRelation(error.message)) {
      return { count: 0, counted: true, optional: true };
    }
    return {
      count: 0,
      counted: false,
      optional: options?.optional,
      error: error.message,
    };
  }
  return { count: count ?? 0, counted: true, optional: options?.optional };
}

async function countIn(
  supabase: SupabaseClient,
  table: string,
  column: string,
  ids: string[],
  options?: { optional?: boolean }
): Promise<CountResult> {
  if (ids.length === 0) return { count: 0, counted: true, optional: options?.optional };
  let total = 0;
  for (let index = 0; index < ids.length; index += 100) {
    const chunk = ids.slice(index, index + 100);
    const { count, error } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true })
      .in(column, chunk);
    if (error) {
      if (options?.optional && isMissingRelation(error.message)) {
        return { count: 0, counted: true, optional: true };
      }
      return {
        count: 0,
        counted: false,
        optional: options?.optional,
        error: error.message,
      };
    }
    total += count ?? 0;
  }
  return { count: total, counted: true, optional: options?.optional };
}

async function listIdsEq(
  supabase: SupabaseClient,
  table: string,
  column: string,
  value: string
): Promise<{ ids: string[]; ok: boolean; error?: string }> {
  const ids: string[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select("id")
      .eq(column, value)
      .range(from, from + pageSize - 1);
    if (error) {
      return { ids: [], ok: false, error: error.message };
    }
    const page = (data ?? [])
      .map(row => (row as { id?: unknown }).id)
      .filter((id): id is string => typeof id === "string" && isUuid(id));
    ids.push(...page);
    if (page.length < pageSize) {
      return { ids, ok: true };
    }
  }
}

async function listStoragePrefixFileCount(
  supabase: SupabaseClient,
  organisationId: string
): Promise<{ count: number | null; listed: boolean; error?: string }> {
  const { data: top, error } = await supabase.storage
    .from(DEVELOPMENT_EVIDENCE_STORAGE_BUCKET)
    .list(organisationId, { limit: 1000, offset: 0 });

  if (error) {
    return { count: null, listed: false, error: error.message };
  }

  const entries = top ?? [];
  if (entries.length >= 1000) {
    return { count: null, listed: false, error: "Storage prefix listing truncated." };
  }

  let files = 0;
  for (const entry of entries) {
    const name = entry.name;
    if (!name) continue;
    const looksLikeFolder = !entry.id || entry.metadata == null;
    if (!looksLikeFolder) {
      files += 1;
      continue;
    }
    const { data: nested, error: nestedError } = await supabase.storage
      .from(DEVELOPMENT_EVIDENCE_STORAGE_BUCKET)
      .list(`${organisationId}/${name}`, { limit: 1000, offset: 0 });
    if (nestedError) {
      return { count: null, listed: false, error: nestedError.message };
    }
    if ((nested ?? []).length >= 1000) {
      return { count: null, listed: false, error: "Storage prefix listing truncated." };
    }
    files += (nested ?? []).filter(item => item.name).length;
  }

  return { count: files, listed: true };
}

export async function loadOrganisationDeletionPreflight(input: {
  supabase: SupabaseClient;
  organisationId: string;
}): Promise<OrganisationDeletionPreflight> {
  const organisationId = input.organisationId;
  const knownLimitations = [
    MIGRATION_REVIEW_DETAILS_NEVER_AUTHORITY_LIMITATION,
    "Backup and external-processor retention cannot be confirmed from this inventory.",
  ];

  const { data: org, error: orgError } = await input.supabase
    .from("organisations")
    .select("id, name, organisation_type, status, licence_status")
    .eq("id", organisationId)
    .maybeSingle();

  if (orgError || !org) {
    const resolved = resolveDeletionEligibility({
      found: false,
      organisationType: null,
      isSampleInstallation: false,
      isUndeletable: false,
      inventoryIncomplete: false,
      reviewReasons: [],
    });
    return emptyPreflight(resolved, knownLimitations);
  }

  const { data: setting } = await input.supabase
    .from("platform_settings")
    .select("value")
    .eq("key", UNDELETABLE_ORGANISATION_IDS_SETTING_KEY)
    .maybeSingle();
  const undeletableIds = parseUndeletableOrganisationIds(setting?.value);
  const isUndeletable = undeletableIds.includes(organisationId);

  const { count: sampleAsOrgCount, error: sampleError } = await input.supabase
    .from("sample_organisation_installations")
    .select("*", { count: "exact", head: true })
    .eq("organisation_id", organisationId);
  const isSampleInstallation = !sampleError && (sampleAsOrgCount ?? 0) > 0;

  const { count: sampleSourceCount, error: sampleSourceError } = await input.supabase
    .from("sample_organisation_installations")
    .select("*", { count: "exact", head: true })
    .eq("source_organisation_id", organisationId);

  const inventory: InventorySurface[] = [];
  const commercial: InventorySurface[] = [];
  const reviewReasons: DeletionPreflightReason[] = [];
  let inventoryIncomplete = false;

  if (sampleError) {
    inventoryIncomplete = true;
    reviewReasons.push({
      code: "SAMPLE_INSTALLATION_LOOKUP_FAILED",
      severity: "review",
      message: "Could not authoritatively determine whether this organisation is a sample installation.",
    });
  }

  if (sampleSourceError) {
    inventoryIncomplete = true;
    reviewReasons.push({
      code: "SAMPLE_SOURCE_LOOKUP_FAILED",
      severity: "review",
      message: "Could not authoritatively determine whether this organisation is a sample pack source.",
    });
  } else if ((sampleSourceCount ?? 0) > 0) {
    reviewReasons.push({
      code: "SAMPLE_SOURCE_ORGANISATION",
      severity: "review",
      message:
        "This organisation is referenced as a sample pack source. Sample installations depend on it; deletion requires explicit source handling.",
    });
  }

  inventory.push({
    key: "organisations",
    table: "organisations",
    category: "organisation",
    count: 1,
    targeting: "id",
    disposition: "delete",
    counted: true,
  });

  for (const surface of ORG_SCOPED_SURFACES) {
    const column = surface.targeting ?? "organisation_id";
    const result = await countEq(input.supabase, surface.table, column, organisationId);
    inventory.push({
      key: surface.key,
      table: surface.table,
      category: surface.category,
      count: result.count,
      targeting: column,
      disposition: surface.disposition,
      counted: result.counted,
      error: result.error,
    });
    if (!result.counted) inventoryIncomplete = true;
  }

  for (const surface of COMMERCIAL_SURFACES) {
    const result = await countEq(
      input.supabase,
      surface.table,
      "organisation_id",
      organisationId
    );
    commercial.push({
      key: surface.key,
      table: surface.table,
      category: "commercial",
      count: result.count,
      targeting: "organisation_id",
      disposition: surface.disposition,
      counted: result.counted,
      error: result.error,
    });
    if (!result.counted) inventoryIncomplete = true;
  }

  const clientIdsResult = await listIdsEq(input.supabase, "clients", "organisation_id", organisationId);
  const sessionIdsResult = await listIdsEq(input.supabase, "sessions", "organisation_id", organisationId);
  const clientsSurface = inventory.find(item => item.key === "clients");
  const sessionsSurface = inventory.find(item => item.key === "sessions");
  if (!clientIdsResult.ok || !sessionIdsResult.ok) {
    inventoryIncomplete = true;
  }
  if (
    clientIdsResult.ok &&
    clientsSurface?.counted &&
    clientIdsResult.ids.length !== clientsSurface.count
  ) {
    inventoryIncomplete = true;
    reviewReasons.push({
      code: "CLIENT_ID_LIST_INCOMPLETE",
      severity: "review",
      message: "Listed client identifiers do not match the authoritative client count.",
    });
  }
  if (
    sessionIdsResult.ok &&
    sessionsSurface?.counted &&
    sessionIdsResult.ids.length !== sessionsSurface.count
  ) {
    inventoryIncomplete = true;
    reviewReasons.push({
      code: "SESSION_ID_LIST_INCOMPLETE",
      severity: "review",
      message: "Listed session identifiers do not match the authoritative session count.",
    });
  }
  const clientIds = clientIdsResult.ids;
  const clientIdSet = new Set(clientIds);

  const sessionsByClient = await countIn(
    input.supabase,
    "sessions",
    "client_id",
    clientIds
  );
  const sessionsByOrg = inventory.find(item => item.key === "sessions");
  if (
    sessionsByClient.counted &&
    sessionsByOrg?.counted &&
    sessionsByClient.count !== sessionsByOrg.count
  ) {
    reviewReasons.push({
      code: "SESSION_TENANT_MISMATCH",
      severity: "review",
      message:
        "Session rows keyed by organisation_id do not match sessions owned by this organisation's clients.",
    });
  }

  const descendantIds = new Set<string>([organisationId, ...clientIds, ...sessionIdsResult.ids]);
  for (const table of DESCENDANT_ID_TABLES) {
    if (table === "clients" || table === "sessions") continue;
    const listed = await listIdsEq(input.supabase, table, "organisation_id", organisationId);
    if (!listed.ok) {
      inventoryIncomplete = true;
      continue;
    }
    for (const id of listed.ids) descendantIds.add(id);
  }

  const snapshotIds = await listIdsEq(
    input.supabase,
    "organisation_intelligence_snapshots",
    "organisation_id",
    organisationId
  );
  if (!snapshotIds.ok) inventoryIncomplete = true;
  for (const child of [
    "organisation_intelligence_metrics",
    "organisation_intelligence_themes",
    "organisation_intelligence_recommendations",
  ] as const) {
    const result = await countIn(input.supabase, child, "snapshot_id", snapshotIds.ids);
    inventory.push({
      key: child,
      table: child,
      category: "intelligence",
      count: result.count,
      targeting: "snapshot_id_in_org_snapshots",
      disposition: "delete",
      counted: result.counted,
      error: result.error,
    });
    if (!result.counted) inventoryIncomplete = true;
  }

  const backup = await countIn(
    input.supabase,
    "sessions_workflow_backup_20260726",
    "client_id",
    clientIds,
    { optional: true }
  );
  inventory.push({
    key: "sessionsWorkflowBackup",
    table: "sessions_workflow_backup_20260726",
    category: "legacy",
    count: backup.count,
    targeting: "client_id_in_org_clients",
    disposition: "delete",
    counted: backup.counted,
    optional: true,
    error: backup.error,
  });
  if (!backup.counted) inventoryIncomplete = true;

  const migrationReview = await assessOrganisationMigrationReview({
    supabase: input.supabase,
    organisationId,
    descendantIds,
  });
  const migrationReviewFailClosed =
    migrationReview.ambiguousCount > 0 || migrationReview.unknownTableCount > 0;
  inventory.push({
    key: "organisationMigrationReview",
    table: "organisation_migration_review",
    category: "legacy",
    count: migrationReview.attributedCount,
    targeting: "authoritative_table_name_record_id_join",
    disposition: migrationReviewFailClosed ? "requires_review" : "delete",
    counted: migrationReview.counted,
    error: migrationReview.error,
  });
  if (!migrationReview.counted) inventoryIncomplete = true;
  reviewReasons.push(...migrationReviewReviewReasons(migrationReview));

  const { data: documentRows, error: documentError } = await input.supabase
    .from("development_evidence_documents")
    .select("id, storage_path")
    .eq("organisation_id", organisationId);

  let authoritativePathCount = 0;
  let unparseablePathCount = 0;
  let foreignPathCount = 0;
  if (documentError) {
    inventoryIncomplete = true;
    reviewReasons.push({
      code: "STORAGE_METADATA_UNAVAILABLE",
      severity: "review",
      message: "Could not read development evidence storage_path metadata.",
    });
  } else {
    for (const row of documentRows ?? []) {
      const classification = classifyEvidenceStoragePath({
        storagePath: (row as { storage_path?: string | null }).storage_path,
        organisationId,
        organisationClientIds: clientIdSet,
      });
      if (classification === "authoritative") authoritativePathCount += 1;
      else if (classification === "unparseable") unparseablePathCount += 1;
      else foreignPathCount += 1;
    }
  }

  const prefix = await listStoragePrefixFileCount(input.supabase, organisationId);
  if (!prefix.listed) {
    reviewReasons.push({
      code: "STORAGE_PREFIX_UNVERIFIED",
      severity: "review",
      message:
        prefix.error ||
        "Organisation storage prefix could not be listed; orphan objects are unproven.",
    });
  } else if (
    prefix.count !== null &&
    prefix.count !== authoritativePathCount &&
    unparseablePathCount === 0 &&
    foreignPathCount === 0
  ) {
    reviewReasons.push({
      code: "STORAGE_PREFIX_COUNT_MISMATCH",
      severity: "review",
      message: "Storage prefix object count does not match authoritative database storage paths.",
    });
  }
  if (unparseablePathCount > 0 || foreignPathCount > 0) {
    reviewReasons.push({
      code: "STORAGE_PATH_NOT_AUTHORITATIVE",
      severity: "review",
      message: "One or more evidence storage paths could not be authoritatively attributed to this organisation.",
    });
  }

  const storage: StorageInventory = {
    bucket: DEVELOPMENT_EVIDENCE_STORAGE_BUCKET,
    category: "development_evidence",
    databaseDocumentCount: documentError ? 0 : (documentRows ?? []).length,
    authoritativePathCount,
    unparseablePathCount,
    foreignPathCount,
    prefixObjectCount: prefix.count,
    prefixListed: prefix.listed,
    ownership:
      unparseablePathCount === 0 &&
      foreignPathCount === 0 &&
      prefix.listed &&
      !documentError
        ? "authoritative"
        : "requires_review",
    deletedNothing: true,
  };

  const { data: memberships, error: membershipError } = await input.supabase
    .from("organisation_memberships")
    .select("user_id, role, status")
    .eq("organisation_id", organisationId);
  if (membershipError) inventoryIncomplete = true;

  const { data: platformOwners } = await input.supabase
    .from("platform_owners")
    .select("user_id")
    .eq("status", "active");
  const platformOwnerIds = new Set(
    (platformOwners ?? [])
      .map(row => (row as { user_id?: unknown }).user_id)
      .filter((id): id is string => typeof id === "string")
  );

  const members: SharedUserImpact[] = [];
  for (const row of memberships ?? []) {
    const userId = (row as { user_id?: unknown }).user_id;
    if (typeof userId !== "string") continue;
    const { count: otherCount, error: otherError } = await input.supabase
      .from("organisation_memberships")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "active")
      .neq("organisation_id", organisationId);
    if (otherError) inventoryIncomplete = true;
    members.push({
      userId,
      role: String((row as { role?: unknown }).role ?? ""),
      membershipStatus: String((row as { status?: unknown }).status ?? ""),
      otherActiveOrganisationCount: otherCount ?? 0,
      isPlatformOwner: platformOwnerIds.has(userId),
      survivesTenantDeletion: true,
    });
  }

  const { count: openRunCount, error: runError } = await input.supabase
    .from("organisation_deletion_runs")
    .select("*", { count: "exact", head: true })
    .eq("former_organisation_id", organisationId)
    .neq("status", "completed")
    .neq("status", "blocked");
  const { count: certificateCount, error: certError } = await input.supabase
    .from("organisation_deletion_certificates")
    .select("*", { count: "exact", head: true })
    .eq("former_organisation_id", organisationId);
  const { count: retainedCount, error: retainedError } = await input.supabase
    .from("retained_organisation_commercial_records")
    .select("*", { count: "exact", head: true })
    .eq("former_organisation_id", organisationId);
  if (runError || certError || retainedError) inventoryIncomplete = true;

  inventory.push({
    key: "sampleInstallationsAsOrg",
    table: "sample_organisation_installations",
    category: "sample",
    count: sampleAsOrgCount ?? 0,
    targeting: "organisation_id",
    disposition: "delete",
    counted: !sampleError,
    error: sampleError?.message,
  });
  inventory.push({
    key: "sampleInstallationsAsSource",
    table: "sample_organisation_installations",
    category: "sample",
    count: sampleSourceCount ?? 0,
    targeting: "source_organisation_id",
    disposition: "remove_tenant_link",
    counted: !sampleSourceError,
    error: sampleSourceError?.message,
  });

  const residuals = [
    {
      location: "organisation_migration_review.attributed",
      attributedCount: migrationReview.counted ? migrationReview.attributedCount : 0,
      attribution: "authoritative_join" as const,
      disposition: "delete" as const,
      reason:
        "Rows attributed by joining table_name + record_id to clients or sessions. Future tenant purge surface for this organisation.",
    },
    {
      location: "organisation_migration_review.ambiguous",
      attributedCount: migrationReview.counted ? migrationReview.ambiguousCount : 0,
      attribution: "ambiguous" as const,
      disposition: "requires_review" as const,
      reason:
        "Rows that could concern this organisation but cannot be attributed without contradiction. Fail closed; not purge-ready.",
    },
    {
      location: "organisation_migration_review.unknown_table",
      attributedCount: migrationReview.counted ? migrationReview.unknownTableCount : 0,
      attribution: "unknown_table" as const,
      disposition: "requires_review" as const,
      reason:
        "Rows whose table_name is not clients or sessions and whose record_id is a descendant of this organisation. Fail closed.",
    },
    {
      location: "organisation_migration_review.details",
      attributedCount: 0,
      attribution: "not_searched" as const,
      disposition: "requires_review" as const,
      reason:
        "details JSON is not searched and is never attribution authority. Unrelated unattributed queue rows are excluded from this organisation.",
    },
  ];

  if (org.licence_status === "suspended" || org.status === "pending_closure") {
    knownLimitations.push(
      "Licence suspended or pending_closure does not by itself make the organisation eligible for deletion."
    );
  }

  const resolved = resolveDeletionEligibility({
    found: true,
    organisationType: String(org.organisation_type ?? ""),
    isSampleInstallation: Boolean(isSampleInstallation),
    isUndeletable,
    inventoryIncomplete,
    reviewReasons,
  });

  return {
    eligibility: resolved.eligibility,
    reasons: resolved.reasons,
    organisation: {
      id: String(org.id),
      name: String(org.name),
      organisationType: String(org.organisation_type ?? ""),
      status: String(org.status ?? ""),
      licenceStatus: (org.licence_status as string | null) ?? null,
    },
    inventory,
    storage,
    commercial,
    sharedUsers: {
      membershipCount: members.length,
      soleTenantUserCount: members.filter(
        member => member.otherActiveOrganisationCount === 0
      ).length,
      sharedTenantUserCount: members.filter(
        member => member.otherActiveOrganisationCount > 0
      ).length,
      platformOwnerMemberCount: members.filter(member => member.isPlatformOwner).length,
      members,
      authUsersAreNotDeleted: true,
    },
    residuals,
    deletionFoundation: {
      openRunCount: openRunCount ?? 0,
      certificateCount: certificateCount ?? 0,
      retainedCommercialCount: retainedCount ?? 0,
      wroteNothing: true,
    },
    knownLimitations,
    confidentialityNote: CONFIDENTIALITY_NOTE,
  };
}

function emptyPreflight(
  resolved: { eligibility: DeletionEligibility; reasons: DeletionPreflightReason[] },
  knownLimitations: string[]
): OrganisationDeletionPreflight {
  return {
    eligibility: resolved.eligibility,
    reasons: resolved.reasons,
    organisation: null,
    inventory: [],
    storage: {
      bucket: DEVELOPMENT_EVIDENCE_STORAGE_BUCKET,
      category: "development_evidence",
      databaseDocumentCount: 0,
      authoritativePathCount: 0,
      unparseablePathCount: 0,
      foreignPathCount: 0,
      prefixObjectCount: null,
      prefixListed: false,
      ownership: "requires_review",
      deletedNothing: true,
    },
    commercial: [],
    sharedUsers: {
      membershipCount: 0,
      soleTenantUserCount: 0,
      sharedTenantUserCount: 0,
      platformOwnerMemberCount: 0,
      members: [],
      authUsersAreNotDeleted: true,
    },
    residuals: [],
    deletionFoundation: {
      openRunCount: 0,
      certificateCount: 0,
      retainedCommercialCount: 0,
      wroteNothing: true,
    },
    knownLimitations,
    confidentialityNote: CONFIDENTIALITY_NOTE,
  };
}
