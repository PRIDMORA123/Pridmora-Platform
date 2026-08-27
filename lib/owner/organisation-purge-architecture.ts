/**
 * DATA-LIFECYCLE DL-07 — purge architecture specification.
 *
 * Non-destructive. Does not purge tenant data, delete Storage, delete Auth
 * users, create certificates, or expose a purge API.
 *
 * Future DL-08 must implement against this allowlist and these predicates.
 * Unknown tenant tables fail closed.
 */

export const ORGANISATION_PURGE_MUST_NEVER_DELETE_AUTH_USERS = true;

export const FORBIDDEN_AUTH_USER_DELETION_APIS = [
  "auth.admin.deleteUser",
  "auth.admin.deleteUserById",
] as const;

export const COMMERCIAL_LIVE_TABLES = [
  "organisation_subscriptions",
  "organisation_payment_methods",
  "invoices",
  "purchase_orders",
  "organisation_contracts",
  "organisation_trials",
] as const;

export const RETAINED_SURVIVAL_TABLES = [
  "retained_organisation_commercial_records",
  "organisation_deletion_runs",
] as const;

export const APPLICATION_PURGE_CLAIM = "APPLICATION DATA PURGED";
export const COMPLETE_ERASURE_CLAIM = "COMPLETE ERASURE CONFIRMED";

export const MIGRATION_REVIEW_ATTRIBUTABLE_TABLES = ["clients", "sessions"] as const;

export type MigrationReviewAttributionResult =
  | "attributed"
  | "not_attributed"
  | "ambiguous"
  | "unknown_table";

export type MigrationReviewAttributionBasis =
  | "source_organisation_id"
  | "session_client_organisation_id"
  | "single_org_assignment";

export type MigrationReviewAttribution = {
  result: MigrationReviewAttributionResult;
  basis?: MigrationReviewAttributionBasis;
  reason: string;
};

/**
 * Attribute a migration-review row without reading details JSON.
 * details is accepted only to prove callers must not use it.
 */
export function attributeMigrationReviewRecord(input: {
  tableName: string;
  recordId: string;
  targetOrganisationId: string;
  details?: Record<string, unknown>;
  sourceClient?: { id: string; organisationId: string | null } | null;
  sourceSession?: {
    id: string;
    organisationId: string | null;
    clientId: string;
  } | null;
  sessionClient?: { id: string; organisationId: string | null } | null;
  activeAssignmentOrganisationIds: string[];
}): MigrationReviewAttribution {
  void input.details;
  const target = input.targetOrganisationId;
  const uniqueAssignmentOrgs = [
    ...new Set(input.activeAssignmentOrganisationIds.filter(Boolean)),
  ];

  if (
    !(MIGRATION_REVIEW_ATTRIBUTABLE_TABLES as readonly string[]).includes(
      input.tableName
    )
  ) {
    return {
      result: "unknown_table",
      reason: `table_name ${input.tableName} is not an attributed migration-review source.`,
    };
  }

  if (input.tableName === "clients") {
    const client = input.sourceClient;
    if (!client || client.id !== input.recordId) {
      return {
        result: "not_attributed",
        reason: "Review record_id does not resolve to a clients row.",
      };
    }
    return attributeByOrgAndAssignments({
      sourceOrganisationId: client.organisationId,
      targetOrganisationId: target,
      assignmentOrgIds: uniqueAssignmentOrgs,
    });
  }

  const session = input.sourceSession;
  if (!session || session.id !== input.recordId) {
    return {
      result: "not_attributed",
      reason: "Review record_id does not resolve to a sessions row.",
    };
  }
  if (
    session.organisationId &&
    input.sessionClient?.organisationId &&
    session.organisationId !== input.sessionClient.organisationId
  ) {
    const involvesTarget =
      session.organisationId === target ||
      input.sessionClient.organisationId === target;
    if (!involvesTarget) {
      return {
        result: "not_attributed",
        reason:
          "Session and client organisations disagree and neither is the target.",
      };
    }
    return {
      result: "ambiguous",
      reason: "Session organisation_id disagrees with client organisation_id.",
    };
  }
  const sourceOrganisationId =
    session.organisationId ?? input.sessionClient?.organisationId ?? null;
  return attributeByOrgAndAssignments({
    sourceOrganisationId,
    targetOrganisationId: target,
    assignmentOrgIds: uniqueAssignmentOrgs,
    clientOrganisationFallback: Boolean(
      !session.organisationId && input.sessionClient?.organisationId
    ),
  });
}

function attributeByOrgAndAssignments(input: {
  sourceOrganisationId: string | null;
  targetOrganisationId: string;
  assignmentOrgIds: string[];
  clientOrganisationFallback?: boolean;
}): MigrationReviewAttribution {
  if (input.sourceOrganisationId === input.targetOrganisationId) {
    return {
      result: "attributed",
      basis: input.clientOrganisationFallback
        ? "session_client_organisation_id"
        : "source_organisation_id",
      reason: "Source row organisation_id matches the target organisation.",
    };
  }
  if (
    input.sourceOrganisationId &&
    input.sourceOrganisationId !== input.targetOrganisationId
  ) {
    return {
      result: "not_attributed",
      reason: "Source row belongs to a different organisation.",
    };
  }
  if (input.assignmentOrgIds.length > 1) {
    if (!input.assignmentOrgIds.includes(input.targetOrganisationId)) {
      return {
        result: "not_attributed",
        reason:
          "NULL organisation_id source has active assignments in other organisations only.",
      };
    }
    return {
      result: "ambiguous",
      reason: "Active assignments exist in more than one organisation.",
    };
  }
  if (
    input.assignmentOrgIds.length === 1 &&
    input.assignmentOrgIds[0] === input.targetOrganisationId
  ) {
    return {
      result: "attributed",
      basis: "single_org_assignment",
      reason: "NULL organisation_id source is assigned only to the target organisation.",
    };
  }
  return {
    result: "not_attributed",
    reason:
      "NULL organisation_id source has no single-organisation assignment to the target.",
  };
}

export function migrationReviewBlocksPurge(attributions: MigrationReviewAttribution[]): {
  blocked: boolean;
  reasons: string[];
} {
  const reasons = attributions
    .filter(item => item.result === "ambiguous" || item.result === "unknown_table")
    .map(item => item.reason);
  return { blocked: reasons.length > 0, reasons };
}

export type PurgeDeletionMode =
  | "explicit"
  | "verified_cascade"
  | "clear_link"
  | "retain"
  | "retain_minimise"
  | "never";

export type PurgeTreatment = "PURGE" | "RETAIN" | "REVIEW" | "NOT_TENANT_DATA";

export type PurgeManifestEntry = {
  table: string;
  ownershipPath: string;
  relationship: "direct" | "indirect";
  fkBehaviour: string;
  deletionOrder: number;
  deletionMode: PurgeDeletionMode;
  verification: string;
  failureCondition: string;
  treatment: PurgeTreatment;
};

/**
 * Authoritative future purge allowlist. Order is explicit-delete sequence
 * (lower first). verified_cascade rows must still be counted as zero after
 * their parent explicit delete.
 */
export const ORGANISATION_PURGE_MANIFEST: readonly PurgeManifestEntry[] = [
  {
    table: "organisation_migration_review",
    ownershipPath: "table_name + record_id joined to clients/sessions; never details JSON",
    relationship: "indirect",
    fkBehaviour: "No FK",
    deletionOrder: 10,
    deletionMode: "explicit",
    verification: "count attributed rows for this org = 0",
    failureCondition: "ambiguous or unknown_table attributions remain",
    treatment: "PURGE",
  },
  {
    table: "development_evidence_ai_usage",
    ownershipPath: "organisation_id; also evidence_id → development_evidence",
    relationship: "direct",
    fkBehaviour: "organisation_id CASCADE",
    deletionOrder: 20,
    deletionMode: "explicit",
    verification: "count organisation_id = org = 0",
    failureCondition: "rows remain",
    treatment: "PURGE",
  },
  {
    table: "development_evidence_audit_log",
    ownershipPath: "organisation_id",
    relationship: "direct",
    fkBehaviour: "organisation_id CASCADE",
    deletionOrder: 21,
    deletionMode: "explicit",
    verification: "count organisation_id = org = 0",
    failureCondition: "rows remain",
    treatment: "PURGE",
  },
  {
    table: "development_evidence_links",
    ownershipPath: "organisation_id; evidence_id",
    relationship: "direct",
    fkBehaviour: "organisation_id CASCADE",
    deletionOrder: 22,
    deletionMode: "explicit",
    verification: "count organisation_id = org = 0",
    failureCondition: "rows remain",
    treatment: "PURGE",
  },
  {
    table: "development_evidence_observations",
    ownershipPath: "organisation_id; evidence_id",
    relationship: "direct",
    fkBehaviour: "organisation_id CASCADE",
    deletionOrder: 23,
    deletionMode: "explicit",
    verification: "count organisation_id = org = 0",
    failureCondition: "rows remain",
    treatment: "PURGE",
  },
  {
    table: "development_evidence_documents",
    ownershipPath: "organisation_id + storage_path",
    relationship: "direct",
    fkBehaviour: "organisation_id CASCADE",
    deletionOrder: 24,
    deletionMode: "explicit",
    verification: "count organisation_id = org = 0; captured paths removed later",
    failureCondition: "rows remain or storage_path list not captured first",
    treatment: "PURGE",
  },
  {
    table: "development_evidence",
    ownershipPath: "organisation_id; client_id CASCADE",
    relationship: "direct",
    fkBehaviour: "organisation_id CASCADE; client_id CASCADE",
    deletionOrder: 25,
    deletionMode: "explicit",
    verification: "count organisation_id = org = 0",
    failureCondition: "rows remain",
    treatment: "PURGE",
  },
  {
    table: "intelligence_audit_log",
    ownershipPath: "organisation_id; also user/entity",
    relationship: "direct",
    fkBehaviour: "organisation_id NO ACTION",
    deletionOrder: 30,
    deletionMode: "explicit",
    verification: "count organisation_id = org = 0",
    failureCondition: "rows remain (contains full row JSON)",
    treatment: "PURGE",
  },
  {
    table: "person_progress_signals",
    ownershipPath: "organisation_id; client_id CASCADE; session_id SET NULL",
    relationship: "direct",
    fkBehaviour: "organisation_id NO ACTION",
    deletionOrder: 31,
    deletionMode: "explicit",
    verification: "count organisation_id = org = 0",
    failureCondition: "rows remain",
    treatment: "PURGE",
  },
  {
    table: "question_insights",
    ownershipPath: "organisation_id; client_id CASCADE",
    relationship: "direct",
    fkBehaviour: "organisation_id NO ACTION",
    deletionOrder: 32,
    deletionMode: "explicit",
    verification: "count organisation_id = org = 0",
    failureCondition: "rows remain",
    treatment: "PURGE",
  },
  {
    table: "intelligence_evidence",
    ownershipPath: "organisation_id; client_id CASCADE; session_id SET NULL",
    relationship: "direct",
    fkBehaviour: "organisation_id NO ACTION",
    deletionOrder: 33,
    deletionMode: "explicit",
    verification: "count organisation_id = org = 0",
    failureCondition: "rows remain",
    treatment: "PURGE",
  },
  {
    table: "session_intelligence_reviews",
    ownershipPath: "organisation_id; session_id CASCADE",
    relationship: "direct",
    fkBehaviour: "organisation_id NO ACTION; session CASCADE",
    deletionOrder: 34,
    deletionMode: "explicit",
    verification: "count organisation_id = org = 0",
    failureCondition: "rows remain",
    treatment: "PURGE",
  },
  {
    table: "intelligence_items",
    ownershipPath: "organisation_id; client_id CASCADE",
    relationship: "direct",
    fkBehaviour: "organisation_id NO ACTION",
    deletionOrder: 35,
    deletionMode: "explicit",
    verification: "count organisation_id = org = 0",
    failureCondition: "rows remain",
    treatment: "PURGE",
  },
  {
    table: "coaching_moments",
    ownershipPath: "organisation_id; client_id CASCADE",
    relationship: "direct",
    fkBehaviour: "organisation_id NO ACTION",
    deletionOrder: 40,
    deletionMode: "explicit",
    verification: "count organisation_id = org = 0",
    failureCondition: "rows remain",
    treatment: "PURGE",
  },
  {
    table: "development_updates",
    ownershipPath: "organisation_id; client_id CASCADE; session_id CASCADE",
    relationship: "direct",
    fkBehaviour: "organisation_id NO ACTION",
    deletionOrder: 41,
    deletionMode: "explicit",
    verification: "count organisation_id = org = 0",
    failureCondition: "rows remain",
    treatment: "PURGE",
  },
  {
    table: "development_profiles",
    ownershipPath: "organisation_id; client_id CASCADE",
    relationship: "direct",
    fkBehaviour: "organisation_id NO ACTION",
    deletionOrder: 42,
    deletionMode: "explicit",
    verification: "count organisation_id = org = 0",
    failureCondition: "rows remain",
    treatment: "PURGE",
  },
  {
    table: "development_reports",
    ownershipPath: "organisation_id; client_id CASCADE",
    relationship: "direct",
    fkBehaviour: "organisation_id NO ACTION",
    deletionOrder: 43,
    deletionMode: "explicit",
    verification: "count organisation_id = org = 0",
    failureCondition: "rows remain",
    treatment: "PURGE",
  },
  {
    table: "coaching_reports",
    ownershipPath: "organisation_id; client_id CASCADE",
    relationship: "direct",
    fkBehaviour: "organisation_id NO ACTION",
    deletionOrder: 44,
    deletionMode: "explicit",
    verification: "count organisation_id = org = 0",
    failureCondition: "rows remain",
    treatment: "PURGE",
  },
  {
    table: "client_items",
    ownershipPath: "organisation_id; client_id CASCADE; session_id SET NULL",
    relationship: "direct",
    fkBehaviour: "organisation_id NO ACTION",
    deletionOrder: 45,
    deletionMode: "explicit",
    verification: "count organisation_id = org = 0",
    failureCondition: "rows remain",
    treatment: "PURGE",
  },
  {
    table: "client_private_identities",
    ownershipPath: "organisation_id CASCADE; client_id CASCADE",
    relationship: "direct",
    fkBehaviour: "CASCADE both",
    deletionOrder: 46,
    deletionMode: "explicit",
    verification: "count organisation_id = org = 0",
    failureCondition: "rows remain",
    treatment: "PURGE",
  },
  {
    table: "relationship_assignments",
    ownershipPath: "organisation_id CASCADE; client_id CASCADE",
    relationship: "direct",
    fkBehaviour: "CASCADE",
    deletionOrder: 50,
    deletionMode: "explicit",
    verification: "count organisation_id = org = 0",
    failureCondition: "rows remain",
    treatment: "PURGE",
  },
  {
    table: "sessions_workflow_backup_20260726",
    ownershipPath: "client_id in this organisation's clients",
    relationship: "indirect",
    fkBehaviour: "Legacy table; no org FK",
    deletionOrder: 51,
    deletionMode: "explicit",
    verification: "count client_id in org clients = 0",
    failureCondition: "backup rows remain for org clients",
    treatment: "PURGE",
  },
  {
    table: "sessions",
    ownershipPath: "organisation_id; client_id CASCADE",
    relationship: "direct",
    fkBehaviour: "organisation_id NO ACTION; client CASCADE",
    deletionOrder: 52,
    deletionMode: "explicit",
    verification: "count organisation_id = org = 0 AND count via clients = 0",
    failureCondition: "rows remain or client/org mismatch",
    treatment: "PURGE",
  },
  {
    table: "clients",
    ownershipPath: "organisation_id",
    relationship: "direct",
    fkBehaviour: "organisation_id NO ACTION",
    deletionOrder: 60,
    deletionMode: "explicit",
    verification: "count organisation_id = org = 0",
    failureCondition: "rows remain or NO ACTION blocks parent delete",
    treatment: "PURGE",
  },
  {
    table: "organisation_intelligence_metrics",
    ownershipPath: "snapshot_id → organisation_intelligence_snapshots.organisation_id",
    relationship: "indirect",
    fkBehaviour: "snapshot CASCADE",
    deletionOrder: 70,
    deletionMode: "verified_cascade",
    verification: "count snapshot_id in org snapshots = 0",
    failureCondition: "child rows remain after snapshot delete",
    treatment: "PURGE",
  },
  {
    table: "organisation_intelligence_themes",
    ownershipPath: "snapshot_id → snapshots.organisation_id",
    relationship: "indirect",
    fkBehaviour: "snapshot CASCADE",
    deletionOrder: 71,
    deletionMode: "verified_cascade",
    verification: "count snapshot_id in org snapshots = 0",
    failureCondition: "child rows remain after snapshot delete",
    treatment: "PURGE",
  },
  {
    table: "organisation_intelligence_recommendations",
    ownershipPath: "snapshot_id → snapshots.organisation_id",
    relationship: "indirect",
    fkBehaviour: "snapshot CASCADE",
    deletionOrder: 72,
    deletionMode: "verified_cascade",
    verification: "count snapshot_id in org snapshots = 0",
    failureCondition: "child rows remain after snapshot delete",
    treatment: "PURGE",
  },
  {
    table: "organisation_intelligence_generation_locks",
    ownershipPath: "organisation_id CASCADE",
    relationship: "direct",
    fkBehaviour: "organisation_id CASCADE",
    deletionOrder: 73,
    deletionMode: "explicit",
    verification: "count organisation_id = org = 0",
    failureCondition: "lock row remains",
    treatment: "PURGE",
  },
  {
    table: "organisation_intelligence_snapshots",
    ownershipPath: "organisation_id CASCADE",
    relationship: "direct",
    fkBehaviour: "organisation_id CASCADE",
    deletionOrder: 74,
    deletionMode: "explicit",
    verification: "count organisation_id = org = 0",
    failureCondition: "snapshots remain",
    treatment: "PURGE",
  },
  {
    table: "organisation_framework_capabilities",
    ownershipPath: "organisation_id CASCADE; framework_id CASCADE",
    relationship: "direct",
    fkBehaviour: "CASCADE",
    deletionOrder: 80,
    deletionMode: "explicit",
    verification: "count organisation_id = org = 0",
    failureCondition: "rows remain",
    treatment: "PURGE",
  },
  {
    table: "organisation_frameworks",
    ownershipPath: "organisation_id CASCADE",
    relationship: "direct",
    fkBehaviour: "CASCADE",
    deletionOrder: 81,
    deletionMode: "explicit",
    verification: "count organisation_id = org = 0",
    failureCondition: "rows remain",
    treatment: "PURGE",
  },
  {
    table: "sample_organisation_records",
    ownershipPath: "organisation_id CASCADE",
    relationship: "direct",
    fkBehaviour: "CASCADE",
    deletionOrder: 90,
    deletionMode: "explicit",
    verification: "count organisation_id = org = 0",
    failureCondition: "sample org must have been blocked; if reached, rows remain",
    treatment: "PURGE",
  },
  {
    table: "sample_organisation_installations",
    ownershipPath: "organisation_id CASCADE; source_organisation_id SET NULL",
    relationship: "direct",
    fkBehaviour: "CASCADE / SET NULL",
    deletionOrder: 91,
    deletionMode: "explicit",
    verification: "count organisation_id = org = 0; source refs not this org",
    failureCondition: "org is sample installation or sample source (blocked earlier)",
    treatment: "REVIEW",
  },
  {
    table: "organisation_audit_log",
    ownershipPath: "organisation_id CASCADE",
    relationship: "direct",
    fkBehaviour: "CASCADE",
    deletionOrder: 100,
    deletionMode: "explicit",
    verification: "count organisation_id = org = 0",
    failureCondition: "rows remain",
    treatment: "PURGE",
  },
  {
    table: "organisation_invitations",
    ownershipPath: "organisation_id CASCADE",
    relationship: "direct",
    fkBehaviour: "CASCADE",
    deletionOrder: 110,
    deletionMode: "explicit",
    verification: "count organisation_id = org = 0",
    failureCondition: "rows remain",
    treatment: "PURGE",
  },
  {
    table: "organisation_memberships",
    ownershipPath: "organisation_id CASCADE; user_id → auth.users (users survive)",
    relationship: "direct",
    fkBehaviour: "org CASCADE; user CASCADE from Auth only",
    deletionOrder: 111,
    deletionMode: "explicit",
    verification: "count organisation_id = org = 0; auth.users still exist",
    failureCondition: "memberships remain or Auth users were deleted",
    treatment: "PURGE",
  },
  {
    table: "organisation_subscriptions",
    ownershipPath: "organisation_id CASCADE — live row only after DL-06 copy",
    relationship: "direct",
    fkBehaviour: "CASCADE",
    deletionOrder: 120,
    deletionMode: "explicit",
    verification: "live count = 0 AND retained subscription count unchanged from DL-06",
    failureCondition: "copy not verified or retained count dropped",
    treatment: "PURGE",
  },
  {
    table: "organisation_payment_methods",
    ownershipPath: "organisation_id CASCADE — after DL-06 copy",
    relationship: "direct",
    fkBehaviour: "CASCADE",
    deletionOrder: 121,
    deletionMode: "explicit",
    verification: "live count = 0 AND retained payment_method_masked count unchanged",
    failureCondition: "copy not verified",
    treatment: "PURGE",
  },
  {
    table: "invoices",
    ownershipPath: "organisation_id CASCADE — after DL-06 copy",
    relationship: "direct",
    fkBehaviour: "CASCADE",
    deletionOrder: 122,
    deletionMode: "explicit",
    verification: "live count = 0 AND retained invoice count unchanged",
    failureCondition: "copy not verified",
    treatment: "PURGE",
  },
  {
    table: "purchase_orders",
    ownershipPath: "organisation_id CASCADE — after DL-06 copy",
    relationship: "direct",
    fkBehaviour: "CASCADE",
    deletionOrder: 123,
    deletionMode: "explicit",
    verification: "live count = 0 AND retained purchase_order count unchanged",
    failureCondition: "copy not verified",
    treatment: "PURGE",
  },
  {
    table: "organisation_contracts",
    ownershipPath: "organisation_id CASCADE — after DL-06 copy",
    relationship: "direct",
    fkBehaviour: "CASCADE",
    deletionOrder: 124,
    deletionMode: "explicit",
    verification: "live count = 0 AND retained contract count unchanged",
    failureCondition: "copy not verified",
    treatment: "PURGE",
  },
  {
    table: "organisation_trials",
    ownershipPath: "organisation_id CASCADE — after DL-06 copy",
    relationship: "direct",
    fkBehaviour: "CASCADE",
    deletionOrder: 125,
    deletionMode: "explicit",
    verification: "live count = 0 AND retained trial count unchanged",
    failureCondition: "copy not verified",
    treatment: "PURGE",
  },
  {
    table: "profiles",
    ownershipPath: "current_organisation_id SET NULL; row is the Auth user profile",
    relationship: "direct",
    fkBehaviour: "current_organisation_id SET NULL",
    deletionOrder: 130,
    deletionMode: "clear_link",
    verification: "count current_organisation_id = org = 0; profile rows remain",
    failureCondition: "profile rows deleted",
    treatment: "NOT_TENANT_DATA",
  },
  {
    table: "support_cases",
    ownershipPath: "organisation_id SET NULL after retain_minimise",
    relationship: "direct",
    fkBehaviour: "SET NULL",
    deletionOrder: 140,
    deletionMode: "retain_minimise",
    verification:
      "organisation_id IS NULL; former_organisation_id set; description/resolution_notes empty; subject minimised; cases remain",
    failureCondition: "free text remains or cases deleted without minimise",
    treatment: "RETAIN",
  },
  {
    table: "platform_audit_events",
    ownershipPath: "organisation_id SET NULL after metadata minimise",
    relationship: "direct",
    fkBehaviour: "SET NULL",
    deletionOrder: 141,
    deletionMode: "retain_minimise",
    verification:
      "organisation_id IS NULL; former_organisation_id set; events remain; metadata allowlisted only; entity_id retained only for PLATFORM_AUDIT_ENTITY_ID_RETAIN_TYPES else NULL",
    failureCondition:
      "events deleted, non-allowlisted metadata remains, or entity_id retained outside the fail-closed allowlist",
    treatment: "RETAIN",
  },
  {
    table: "organisations",
    ownershipPath: "id",
    relationship: "direct",
    fkBehaviour: "PK; created_by RESTRICT against Auth delete",
    deletionOrder: 200,
    deletionMode: "explicit",
    verification: "organisations.id absent; former_organisation_id rows remain",
    failureCondition: "NO ACTION children remain; or retained/run rows missing",
    treatment: "PURGE",
  },
  {
    table: "retained_organisation_commercial_records",
    ownershipPath: "former_organisation_id (no organisations FK)",
    relationship: "indirect",
    fkBehaviour: "deletion_run_id RESTRICT; no org FK",
    deletionOrder: 900,
    deletionMode: "never",
    verification: "count for deletion_run_id unchanged from DL-06",
    failureCondition: "any retained row deleted",
    treatment: "RETAIN",
  },
  {
    table: "organisation_deletion_runs",
    ownershipPath: "former_organisation_id (no organisations FK)",
    relationship: "indirect",
    fkBehaviour: "organisation_id SET NULL; no former org FK",
    deletionOrder: 901,
    deletionMode: "never",
    verification: "run row still present; organisation_id may be null",
    failureCondition: "run deleted",
    treatment: "RETAIN",
  },
  {
    table: "organisation_deletion_storage_manifest",
    ownershipPath: "deletion_run_id RESTRICT; former_organisation_id no org FK",
    relationship: "indirect",
    fkBehaviour: "deletion_run_id RESTRICT; no organisations FK",
    deletionOrder: 903,
    deletionMode: "never",
    verification: "captured paths remain as verification metadata; no file content",
    failureCondition: "manifest deleted while run exists, or unbounded bucket delete used",
    treatment: "RETAIN",
  },
  {
    table: "organisation_deletion_certificates",
    ownershipPath: "former_organisation_id; deletion_run_id RESTRICT",
    relationship: "indirect",
    fkBehaviour: "RESTRICT; no org FK",
    deletionOrder: 902,
    deletionMode: "never",
    verification: "created only after verifying stage passes",
    failureCondition: "certificate exists before verification",
    treatment: "RETAIN",
  },
  {
    table: "platform_owners",
    ownershipPath: "user_id → auth.users",
    relationship: "indirect",
    fkBehaviour: "no org FK",
    deletionOrder: 990,
    deletionMode: "never",
    verification: "platform_owners rows unchanged",
    failureCondition: "owner row deleted during org purge",
    treatment: "NOT_TENANT_DATA",
  },
  {
    table: "platform_plans",
    ownershipPath: "global catalogue",
    relationship: "indirect",
    fkBehaviour: "none",
    deletionOrder: 991,
    deletionMode: "never",
    verification: "unchanged",
    failureCondition: "catalogue mutated",
    treatment: "NOT_TENANT_DATA",
  },
  {
    table: "platform_settings",
    ownershipPath: "global; undeletable_organisation_ids may mention org UUID",
    relationship: "indirect",
    fkBehaviour: "none",
    deletionOrder: 992,
    deletionMode: "never",
    verification: "settings remain; optional post-complete UUID scrub is ops",
    failureCondition: "settings table dropped",
    treatment: "NOT_TENANT_DATA",
  },
];

export const KNOWN_STORAGE_BUCKETS = [
  {
    bucket: "development-evidence",
    status: "in_use" as const,
    pathPattern: "{organisationId|personal}/{clientId}/{hashPrefix}-{file}",
    authoritativeSource: "development_evidence_documents.storage_path",
  },
  {
    bucket: "documents-openai",
    status: "not_created_in_migrations" as const,
    pathPattern: "n/a",
    authoritativeSource: "supabase/config.toml comment only",
  },
] as const;

export type MinimiseAction = "RETAIN" | "MINIMISE" | "NULL" | "PURGE" | "REVIEW";

export const MINIMISED_SUPPORT_CASE_SUBJECT = "Minimised support case";

export const SUPPORT_CASE_SCHEMA_COLUMNS = [
  "id",
  "organisation_id",
  "former_organisation_id",
  "user_id",
  "category",
  "subject",
  "description",
  "status",
  "priority",
  "assigned_to",
  "resolution_notes",
  "created_by",
  "created_at",
  "updated_at",
] as const;

export const PLATFORM_AUDIT_SCHEMA_COLUMNS = [
  "id",
  "actor_user_id",
  "action",
  "entity_type",
  "entity_id",
  "organisation_id",
  "former_organisation_id",
  "metadata",
  "created_at",
] as const;

export const SUPPORT_CASE_FIELD_TREATMENT: Record<string, MinimiseAction> = {
  id: "RETAIN",
  organisation_id: "NULL",
  former_organisation_id: "RETAIN",
  user_id: "NULL",
  category: "RETAIN",
  subject: "MINIMISE",
  description: "NULL",
  status: "RETAIN",
  priority: "RETAIN",
  assigned_to: "NULL",
  resolution_notes: "NULL",
  created_by: "NULL",
  created_at: "RETAIN",
  updated_at: "RETAIN",
};

export const PLATFORM_AUDIT_FIELD_TREATMENT: Record<string, MinimiseAction> = {
  id: "RETAIN",
  actor_user_id: "RETAIN",
  action: "RETAIN",
  entity_type: "RETAIN",
  entity_id: "MINIMISE",
  organisation_id: "NULL",
  former_organisation_id: "RETAIN",
  metadata: "MINIMISE",
  created_at: "RETAIN",
};

export const PLATFORM_AUDIT_ENTITY_ID_RETAIN_TYPES = [
  "organisation_deletion_run",
  "support_case",
  "organisation_subscription",
  "invoice",
  "organisation_payment_method",
  "purchase_order",
  "organisation_contract",
  "organisation_trial",
] as const;

export const PLATFORM_AUDIT_METADATA_ALLOWLIST = [
  "deletionRunId",
  "formerOrganisationId",
  "organisationId",
  "instructionReference",
  "runStatus",
  "stage",
  "organisationStatus",
  "previousStatus",
  "permanentDeletionOccurred",
  "alreadyCopied",
  "alreadyMinimised",
  "repaired",
  "category",
  "status",
  "priority",
  "conversionStatus",
  "licenceStatus",
  "previousLicenceStatus",
  "trialConversionStatus",
  "licencePlanName",
  "planCode",
  "methodType",
  "fields",
  "role",
  "aiEnabled",
  "key",
  "licenceEndsAt",
  "previousLicenceEndsAt",
  "sourceCounts",
  "retainedCounts",
  "supportCasesMinimised",
  "auditEventsMinimised",
] as const;

export type LiveCommercialPurgePreconditions = {
  organisationStatus: string | null;
  runStatus: string | null;
  commercialCopyVerified: boolean;
  sourceRetainedMatches: boolean;
  organisationIdMatchesRun: boolean;
};

export function liveCommercialPurgeAllowed(
  input: LiveCommercialPurgePreconditions
): { allowed: boolean; reason: string } {
  if (input.organisationStatus !== "pending_closure") {
    return { allowed: false, reason: "Organisation is not pending_closure." };
  }
  if (input.runStatus !== "commercial_copied") {
    return { allowed: false, reason: "Deletion run has not reached commercial_copied." };
  }
  if (!input.commercialCopyVerified || !input.sourceRetainedMatches) {
    return { allowed: false, reason: "Commercial retention copy is not verified." };
  }
  if (!input.organisationIdMatchesRun) {
    return { allowed: false, reason: "Deletion run does not match the organisation." };
  }
  return { allowed: true, reason: "Live commercial rows may be purged after verified copy." };
}

export type FuturePurgeRunStatus =
  | "commercial_copied"
  | "purging"
  | "purged"
  | "storage_cleaning"
  | "verifying"
  | "completed"
  | "failed"
  | "blocked";

export const FUTURE_PURGE_TRANSITIONS: Array<{
  from: FuturePurgeRunStatus;
  to: FuturePurgeRunStatus;
  prerequisites: string;
  operation: string;
  postcondition: string;
  verification: string;
  retry: string;
  failure: string;
  auditEvent: string;
}> = [
  {
    from: "commercial_copied",
    to: "purging",
    prerequisites:
      "Owner authorisation; freeze; verified commercial copy; migration-review not ambiguous; personal/sample/source/undeletable blocked",
    operation: "Lock org+run; begin allowlisted DB deletes. No Storage. No Auth user delete.",
    postcondition: "status=purging; last_error null",
    verification: "Run row locked; no certificate",
    retry: "Idempotent restart from remaining rows",
    failure: "status=failed; no certificate",
    auditEvent: "organisation.purge_started",
  },
  {
    from: "purging",
    to: "purged",
    prerequisites: "All PURGE manifest tables at deletionOrder < 200 count 0; live commercial 0; retained counts unchanged",
    operation: "Delete organisations row last",
    postcondition: "org row gone; run.organisation_id NULL; former_organisation_id set; Auth users remain",
    verification: "org select empty; retained/run present",
    retry: "If org still present, resume purging",
    failure: "status=failed if NO ACTION blocks org delete",
    auditEvent: "organisation.tenant_rows_purged",
  },
  {
    from: "purged",
    to: "storage_cleaning",
    prerequisites: "Captured storage_path list from before DB delete",
    operation: "Remove exact captured paths; then list org prefix",
    postcondition: "status=storage_cleaning then progress",
    verification: "Each captured path gone",
    retry: "Re-remove remaining captured paths (idempotent)",
    failure: "status=failed; prefix remainder or missing capture list",
    auditEvent: "organisation.storage_cleanup_started",
  },
  {
    from: "storage_cleaning",
    to: "verifying",
    prerequisites: "Captured paths gone; org prefix empty or fail-closed remainder documented",
    operation: "Re-count purge tables; Storage prefix; Auth survival; retained survival",
    postcondition: "status=verifying",
    verification: "All verification queries pass",
    retry: "Re-run verification without deleting",
    failure: "status=failed",
    auditEvent: "organisation.purge_verification_started",
  },
  {
    from: "verifying",
    to: "completed",
    prerequisites: "Verification passed; certificate insert allowed only here",
    operation: "Insert immutable certificate; set completed_at",
    postcondition: "status=completed; certificate exists; backup_status may remain unknown",
    verification: "Certificate present; claim is APPLICATION DATA PURGED unless ops evidence",
    retry: "Certificate insert is once-only; run already completed is no-op",
    failure: "Do not complete without certificate insert success",
    auditEvent: "organisation.purge_completed",
  },
  {
    from: "purging",
    to: "failed",
    prerequisites: "DB error or verification mismatch",
    operation: "Record last_error; do not create certificate",
    postcondition: "status=failed",
    verification: "Tenant may be partial; freeze remains",
    retry: "Owner retry from failed → purging if invariants still hold",
    failure: "Stay failed",
    auditEvent: "organisation.purge_failed",
  },
  {
    from: "storage_cleaning",
    to: "failed",
    prerequisites: "Storage remove or prefix check failed",
    operation: "Record last_error; DB already purged",
    postcondition: "status=failed; storage_status=failed",
    verification: "No certificate",
    retry: "Retry storage_cleaning only",
    failure: "Stay failed until prefix clean",
    auditEvent: "organisation.storage_cleanup_failed",
  },
  {
    from: "commercial_copied",
    to: "blocked",
    prerequisites: "Ambiguous migration-review, sample, personal, or undeletable discovered",
    operation: "Do not delete",
    postcondition: "status=blocked",
    verification: "No tenant deletes occurred",
    retry: "Requires human resolution then new eligibility",
    failure: "Stay blocked",
    auditEvent: "organisation.purge_blocked",
  },
];

export const POST_PURGE_LIFECYCLE_AUDIT_ACTIONS = [
  "organisation.tenant_rows_purged",
  "organisation.storage_cleanup_verified",
] as const;

export const FUTURE_FINALISATION_AUDIT_ACTIONS = [
  "organisation.purge_completed",
] as const;

export const DELETION_LIFECYCLE_AUDIT_SQL_MINIMISERS = [
  "minimise_platform_audit_entity_id",
  "minimise_platform_audit_metadata",
] as const;

export const FUTURE_FINALISATION_AUDIT_REQUIRES_SLICE2_MINIMISERS = true;

export const WRITE_MINIMISED_DELETION_LIFECYCLE_AUDIT_SQL =
  "write_minimised_deletion_lifecycle_audit";

/**
 * Certificate/finalisation audit rows must be created already
 * minimised via write_minimised_deletion_lifecycle_audit.
 */
export function futureFinalisationAuditSourceIsContracted(source: string): boolean {
  if (!FUTURE_FINALISATION_AUDIT_REQUIRES_SLICE2_MINIMISERS) return false;
  if (!source.includes("organisation.purge_completed")) return true;
  if (!/insert\s+into\s+public\.platform_audit_events/i.test(source)) {
    return true;
  }
  const insertWindows = source.split(/insert\s+into\s+public\.platform_audit_events/i);
  return insertWindows.every((window, index) => {
    if (index === 0) return true;
    if (!window.includes("'organisation.purge_completed'")) return true;
    return DELETION_LIFECYCLE_AUDIT_SQL_MINIMISERS.every(helper =>
      window.includes(helper)
    );
  });
}

export function lifecycleAuditWriteTimeUsesAcceptedMinimisers(source: string): boolean {
  return (
    source.includes(WRITE_MINIMISED_DELETION_LIFECYCLE_AUDIT_SQL) &&
    DELETION_LIFECYCLE_AUDIT_SQL_MINIMISERS.every(helper => source.includes(helper)) &&
    /former_organisation_id is not null/i.test(source)
  );
}

export const OWNER_PURGE_AUTHORISATION = {
  requirePlatformOwnerFirst: true,
  sqlMustCheckAuthUid: true,
  sqlMustCheckIsPlatformOwner: true,
  requiredFields: [
    "confirmationName",
    "deletionRunId",
    "instructionReference",
    "permanentErasureAcknowledged",
  ] as const,
  forbiddenClientFlags: [
    "purgeReady",
    "eligible",
    "commercialCopyComplete",
  ] as const,
  freshPreflightRequired: true,
  neverTrustBrowserBooleans: true,
} as const;

/**
 * Review codes that remain classified review, not block, and do not prevent
 * Slice 3 execution. Backup/external-processor retention stays unconfirmed.
 */
export const TENANT_PURGE_NONBLOCKING_REVIEW_CODES = [
  "BACKUP_EXTERNAL_RETENTION_UNCONFIRMED",
] as const;

export function reviewCodeBlocksTenantPurgeExecution(code: string): boolean {
  return !(TENANT_PURGE_NONBLOCKING_REVIEW_CODES as readonly string[]).includes(
    code
  );
}

export const TENANT_PURGE_EXPLICIT_TABLES = ORGANISATION_PURGE_MANIFEST.filter(
  item =>
    item.deletionMode === "explicit" &&
    (item.treatment === "PURGE" || item.treatment === "REVIEW")
).map(item => item.table);

export const TENANT_PURGE_CLEAR_LINK_TABLES = ORGANISATION_PURGE_MANIFEST.filter(
  item => item.deletionMode === "clear_link"
).map(item => item.table);

export const TENANT_PURGE_CASCADE_VERIFY_TABLES = ORGANISATION_PURGE_MANIFEST.filter(
  item => item.deletionMode === "verified_cascade"
).map(item => item.table);

export const TENANT_PURGE_PROTECTED_TABLES = ORGANISATION_PURGE_MANIFEST.filter(
  item =>
    item.deletionMode === "never" ||
    item.deletionMode === "retain" ||
    item.deletionMode === "retain_minimise"
).map(item => item.table);

export type TenantPurgeResidualAttributionKind =
  | "organisation_id"
  | "current_organisation_id"
  | "organisation_pk"
  | "snapshot_children"
  | "client_id_in_org_clients"
  | "migration_review_join";

/**
 * Residual verification attribution derived from the accepted manifest.
 * Unknown delete/clear_link surfaces fail closed instead of being skipped.
 */
export function tenantPurgeResidualAttribution(
  entry: PurgeManifestEntry
): TenantPurgeResidualAttributionKind | null {
  if (
    entry.deletionMode === "never" ||
    entry.deletionMode === "retain" ||
    entry.deletionMode === "retain_minimise"
  ) {
    return null;
  }
  if (entry.deletionMode === "clear_link") {
    return "current_organisation_id";
  }
  if (entry.deletionMode === "verified_cascade") {
    return "snapshot_children";
  }
  if (entry.table === "organisations") {
    return "organisation_pk";
  }
  if (entry.table === "organisation_migration_review") {
    return "migration_review_join";
  }
  if (entry.table === "sessions_workflow_backup_20260726") {
    return "client_id_in_org_clients";
  }
  if (
    entry.deletionMode === "explicit" &&
    (entry.ownershipPath.includes("organisation_id") ||
      entry.table === "clients" ||
      entry.table === "sessions")
  ) {
    return "organisation_id";
  }
  throw new Error(
    `Fail closed: no residual verification attribution for ${entry.table}.`
  );
}

export const TENANT_PURGE_RESIDUAL_SURFACES = ORGANISATION_PURGE_MANIFEST.filter(
  item => tenantPurgeResidualAttribution(item) !== null
);

export function tenantPurgeResidualTables(
  kind: TenantPurgeResidualAttributionKind
): string[] {
  return TENANT_PURGE_RESIDUAL_SURFACES.filter(
    item => tenantPurgeResidualAttribution(item) === kind
  )
    .slice()
    .sort((left, right) => left.deletionOrder - right.deletionOrder)
    .map(item => item.table);
}

export const TENANT_PURGE_STAGES = [
  "not_started",
  "storage_manifest_captured",
  "db_purging",
  "db_purged",
  "storage_cleaning",
  "storage_verified",
  "awaiting_certificate",
  "failed",
] as const;

export type TenantPurgeStage = (typeof TENANT_PURGE_STAGES)[number];

export const AUTHORITATIVE_STORAGE_BUCKET = "development-evidence";

export function erasureClaim(input: {
  applicationDataPurged: boolean;
  backupStatus: string;
  externalFollowUpStatus: string;
}): typeof APPLICATION_PURGE_CLAIM | typeof COMPLETE_ERASURE_CLAIM | null {
  if (!input.applicationDataPurged) return null;
  if (
    input.backupStatus === "passed" &&
    (input.externalFollowUpStatus === "passed" ||
      input.externalFollowUpStatus === "not_applicable")
  ) {
    return COMPLETE_ERASURE_CLAIM;
  }
  return APPLICATION_PURGE_CLAIM;
}

export const BACKUP_PROCESSOR_EVIDENCE_CHECKLIST = [
  "Supabase Postgres backup / PITR retention window (dashboard/ops, not this repo)",
  "Supabase Storage delete vs versioning / CDN cache behaviour",
  "Supabase Auth logs and whether Auth email contents are retained by GoTrue/SMTP",
  "Transactional/auth email provider if SMTP is configured outside the repo",
  "OpenAI / model-provider retention beyond application store:false",
  "Vercel (or host) log retention",
  "Payment processor if live external_provider ids exist in production",
] as const;
