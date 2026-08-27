import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  APPLICATION_PURGE_CLAIM,
  BACKUP_PROCESSOR_EVIDENCE_CHECKLIST,
  COMMERCIAL_LIVE_TABLES,
  COMPLETE_ERASURE_CLAIM,
  FORBIDDEN_AUTH_USER_DELETION_APIS,
  FUTURE_PURGE_TRANSITIONS,
  KNOWN_STORAGE_BUCKETS,
  ORGANISATION_PURGE_MANIFEST,
  ORGANISATION_PURGE_MUST_NEVER_DELETE_AUTH_USERS,
  OWNER_PURGE_AUTHORISATION,
  PLATFORM_AUDIT_ENTITY_ID_RETAIN_TYPES,
  PLATFORM_AUDIT_FIELD_TREATMENT,
  RETAINED_SURVIVAL_TABLES,
  SUPPORT_CASE_FIELD_TREATMENT,
  attributeMigrationReviewRecord,
  erasureClaim,
  liveCommercialPurgeAllowed,
  migrationReviewBlocksPurge,
} from "@/lib/owner/organisation-purge-architecture";

const root = process.cwd();
const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CLIENT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SESSION_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function read(pathFromRoot: string): string {
  return readFileSync(join(root, pathFromRoot), "utf8");
}

function publicTablesFromMigrations(): string[] {
  const dir = join(root, "supabase/migrations");
  const tables = new Set<string>();
  for (const name of readdirSync(dir).filter(file => file.endsWith(".sql"))) {
    const sql = readFileSync(join(dir, name), "utf8");
    const matches = sql.matchAll(
      /create table if not exists public\.([a-z0-9_]+)/gi
    );
    for (const match of matches) tables.add(match[1]);
  }
  return [...tables].sort();
}

describe("DL-07 migration-review attribution", () => {
  it("never uses details JSON even if it contains another organisation id", () => {
    const result = attributeMigrationReviewRecord({
      tableName: "clients",
      recordId: CLIENT_ID,
      targetOrganisationId: ORG_A,
      details: { organisation_id: ORG_A, coach_id: "spoof" },
      sourceClient: { id: CLIENT_ID, organisationId: ORG_B },
      activeAssignmentOrganisationIds: [],
    });
    expect(result.result).toBe("not_attributed");
    expect(result.reason).toMatch(/different organisation/);
  });

  it("attributes clients by source organisation_id", () => {
    const result = attributeMigrationReviewRecord({
      tableName: "clients",
      recordId: CLIENT_ID,
      targetOrganisationId: ORG_A,
      sourceClient: { id: CLIENT_ID, organisationId: ORG_A },
      activeAssignmentOrganisationIds: [ORG_B],
    });
    expect(result.result).toBe("attributed");
    expect(result.basis).toBe("source_organisation_id");
  });

  it("attributes NULL organisation_id clients only via a single-org assignment", () => {
    const none = attributeMigrationReviewRecord({
      tableName: "clients",
      recordId: CLIENT_ID,
      targetOrganisationId: ORG_A,
      sourceClient: { id: CLIENT_ID, organisationId: null },
      activeAssignmentOrganisationIds: [],
    });
    expect(none.result).toBe("not_attributed");

    const single = attributeMigrationReviewRecord({
      tableName: "clients",
      recordId: CLIENT_ID,
      targetOrganisationId: ORG_A,
      sourceClient: { id: CLIENT_ID, organisationId: null },
      activeAssignmentOrganisationIds: [ORG_A],
    });
    expect(single.result).toBe("attributed");
    expect(single.basis).toBe("single_org_assignment");

    const multi = attributeMigrationReviewRecord({
      tableName: "clients",
      recordId: CLIENT_ID,
      targetOrganisationId: ORG_A,
      sourceClient: { id: CLIENT_ID, organisationId: null },
      activeAssignmentOrganisationIds: [ORG_A, ORG_B],
    });
    expect(multi.result).toBe("ambiguous");
    expect(migrationReviewBlocksPurge([multi]).blocked).toBe(true);

    const otherMulti = attributeMigrationReviewRecord({
      tableName: "clients",
      recordId: CLIENT_ID,
      targetOrganisationId: ORG_A,
      sourceClient: { id: CLIENT_ID, organisationId: null },
      activeAssignmentOrganisationIds: [ORG_B, "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"],
    });
    expect(otherMulti.result).toBe("not_attributed");
    expect(migrationReviewBlocksPurge([otherMulti]).blocked).toBe(false);
  });

  it("attributes sessions via session or client organisation_id and fails closed on mismatch", () => {
    const viaClient = attributeMigrationReviewRecord({
      tableName: "sessions",
      recordId: SESSION_ID,
      targetOrganisationId: ORG_A,
      sourceSession: {
        id: SESSION_ID,
        organisationId: null,
        clientId: CLIENT_ID,
      },
      sessionClient: { id: CLIENT_ID, organisationId: ORG_A },
      activeAssignmentOrganisationIds: [],
    });
    expect(viaClient.result).toBe("attributed");
    expect(viaClient.basis).toBe("session_client_organisation_id");

    const mismatch = attributeMigrationReviewRecord({
      tableName: "sessions",
      recordId: SESSION_ID,
      targetOrganisationId: ORG_A,
      sourceSession: {
        id: SESSION_ID,
        organisationId: ORG_A,
        clientId: CLIENT_ID,
      },
      sessionClient: { id: CLIENT_ID, organisationId: ORG_B },
      activeAssignmentOrganisationIds: [],
    });
    expect(mismatch.result).toBe("ambiguous");

    const foreignMismatch = attributeMigrationReviewRecord({
      tableName: "sessions",
      recordId: SESSION_ID,
      targetOrganisationId: ORG_A,
      sourceSession: {
        id: SESSION_ID,
        organisationId: ORG_B,
        clientId: CLIENT_ID,
      },
      sessionClient: {
        id: CLIENT_ID,
        organisationId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      },
      activeAssignmentOrganisationIds: [],
    });
    expect(foreignMismatch.result).toBe("not_attributed");
    expect(migrationReviewBlocksPurge([foreignMismatch]).blocked).toBe(false);
  });

  it("does not attribute missing source rows", () => {
    const missingClient = attributeMigrationReviewRecord({
      tableName: "clients",
      recordId: CLIENT_ID,
      targetOrganisationId: ORG_A,
      sourceClient: null,
      activeAssignmentOrganisationIds: [ORG_A],
    });
    expect(missingClient.result).toBe("not_attributed");

    const missingSession = attributeMigrationReviewRecord({
      tableName: "sessions",
      recordId: SESSION_ID,
      targetOrganisationId: ORG_A,
      sourceSession: null,
      activeAssignmentOrganisationIds: [ORG_A],
    });
    expect(missingSession.result).toBe("not_attributed");
  });

  it("fails closed for unknown table_name", () => {
    const result = attributeMigrationReviewRecord({
      tableName: "intelligence_items",
      recordId: CLIENT_ID,
      targetOrganisationId: ORG_A,
      activeAssignmentOrganisationIds: [ORG_A],
    });
    expect(result.result).toBe("unknown_table");
    expect(migrationReviewBlocksPurge([result]).blocked).toBe(true);
  });
});

describe("DL-07 purge manifest allowlist", () => {
  it("classifies every public table from migrations", () => {
    const classified = new Set(ORGANISATION_PURGE_MANIFEST.map(item => item.table));
    const fromSql = publicTablesFromMigrations();
    expect(fromSql.length).toBeGreaterThan(20);
    expect(fromSql.filter(table => !classified.has(table))).toEqual([]);
  });

  it("deletes organisations last among purge rows and never deletes retained/run/auth catalogue", () => {
    const org = ORGANISATION_PURGE_MANIFEST.find(item => item.table === "organisations");
    expect(org?.deletionOrder).toBe(200);
    for (const item of ORGANISATION_PURGE_MANIFEST) {
      if (item.treatment === "PURGE" && item.table !== "organisations") {
        expect(item.deletionOrder).toBeLessThan(200);
      }
    }
    for (const table of RETAINED_SURVIVAL_TABLES) {
      expect(
        ORGANISATION_PURGE_MANIFEST.find(item => item.table === table)?.deletionMode
      ).toBe("never");
    }
    expect(
      ORGANISATION_PURGE_MANIFEST.find(item => item.table === "platform_owners")
        ?.treatment
    ).toBe("NOT_TENANT_DATA");
  });

  it("requires verified commercial copy before live commercial purge", () => {
    expect([...COMMERCIAL_LIVE_TABLES]).toEqual(
      expect.arrayContaining(["invoices", "organisation_subscriptions"])
    );
    expect(
      liveCommercialPurgeAllowed({
        organisationStatus: "pending_closure",
        runStatus: "commercial_copied",
        commercialCopyVerified: true,
        sourceRetainedMatches: true,
        organisationIdMatchesRun: true,
      }).allowed
    ).toBe(true);
    expect(
      liveCommercialPurgeAllowed({
        organisationStatus: "pending_closure",
        runStatus: "frozen",
        commercialCopyVerified: true,
        sourceRetainedMatches: true,
        organisationIdMatchesRun: true,
      }).allowed
    ).toBe(false);
    expect(
      liveCommercialPurgeAllowed({
        organisationStatus: "active",
        runStatus: "commercial_copied",
        commercialCopyVerified: true,
        sourceRetainedMatches: true,
        organisationIdMatchesRun: true,
      }).allowed
    ).toBe(false);
  });
});

describe("DL-07 Auth, Storage, minimise, and claims", () => {
  it("hard-codes that organisation purge never deletes Auth users", () => {
    expect(ORGANISATION_PURGE_MUST_NEVER_DELETE_AUTH_USERS).toBe(true);
    expect(FORBIDDEN_AUTH_USER_DELETION_APIS).toContain("auth.admin.deleteUser");
    const deletionLibs = [
      "lib/owner/organisation-deletion-foundation.ts",
      "lib/owner/organisation-deletion-preflight.ts",
      "lib/owner/organisation-deletion-initiation.ts",
      "lib/owner/organisation-commercial-retention.ts",
      "lib/owner/organisation-purge-architecture.ts",
      "lib/owner/organisation-migration-review-attribution.ts",
      "lib/owner/organisation-retain-minimise.ts",
    ];
    for (const path of deletionLibs) {
      const source = read(path);
      expect(source).not.toMatch(/auth\.admin\.deleteUser\s*\(/);
      expect(source).not.toMatch(/\.deleteUser\s*\(/);
    }
    expect(
      existsSync(join(root, "app/api/owner/organisations/[id]/purge/route.ts"))
    ).toBe(false);
    expect(
      existsSync(join(root, "app/api/owner/organisations/[id]/deletion/route.ts"))
    ).toBe(false);
    const page = read("app/owner/organisations/[id]/page.tsx");
    expect(page).not.toContain("Delete organisation");
    expect(page).not.toMatch(/Permanently delete/i);
  });

  it("treats development-evidence as the only in-use bucket and documents openai as absent", () => {
    expect(KNOWN_STORAGE_BUCKETS[0]?.bucket).toBe("development-evidence");
    expect(KNOWN_STORAGE_BUCKETS[0]?.status).toBe("in_use");
    expect(KNOWN_STORAGE_BUCKETS[1]?.bucket).toBe("documents-openai");
    expect(KNOWN_STORAGE_BUCKETS[1]?.status).toBe("not_created_in_migrations");
    expect(read("lib/development-evidence/storage-path.ts")).toContain(
      "{organisationId|personal}/{clientId}"
    );
  });

  it("nulls support free text and does not purge support or platform audit rows", () => {
    expect(SUPPORT_CASE_FIELD_TREATMENT.description).toBe("NULL");
    expect(SUPPORT_CASE_FIELD_TREATMENT.resolution_notes).toBe("NULL");
    expect(SUPPORT_CASE_FIELD_TREATMENT.subject).toBe("MINIMISE");
    expect(SUPPORT_CASE_FIELD_TREATMENT.user_id).toBe("NULL");
    expect(SUPPORT_CASE_FIELD_TREATMENT.former_organisation_id).toBe("RETAIN");
    expect(SUPPORT_CASE_FIELD_TREATMENT.id).toBe("RETAIN");
    expect(PLATFORM_AUDIT_FIELD_TREATMENT.metadata).toBe("MINIMISE");
    expect(PLATFORM_AUDIT_FIELD_TREATMENT.organisation_id).toBe("NULL");
    expect(PLATFORM_AUDIT_FIELD_TREATMENT.actor_user_id).toBe("RETAIN");
    expect(PLATFORM_AUDIT_FIELD_TREATMENT.entity_id).toBe("MINIMISE");
    expect([...PLATFORM_AUDIT_ENTITY_ID_RETAIN_TYPES]).toEqual([
      "organisation_deletion_run",
      "support_case",
      "organisation_subscription",
      "invoice",
      "organisation_payment_method",
      "purchase_order",
      "organisation_contract",
      "organisation_trial",
    ]);
    expect(
      ORGANISATION_PURGE_MANIFEST.find(item => item.table === "support_cases")
        ?.deletionMode
    ).toBe("retain_minimise");
  });

  it("prevents complete-erasure claims while backup/external follow-up is unknown", () => {
    expect(
      erasureClaim({
        applicationDataPurged: true,
        backupStatus: "unknown",
        externalFollowUpStatus: "unknown",
      })
    ).toBe(APPLICATION_PURGE_CLAIM);
    expect(
      erasureClaim({
        applicationDataPurged: true,
        backupStatus: "passed",
        externalFollowUpStatus: "passed",
      })
    ).toBe(COMPLETE_ERASURE_CLAIM);
    expect(BACKUP_PROCESSOR_EVIDENCE_CHECKLIST.length).toBeGreaterThan(5);
    const completed = FUTURE_PURGE_TRANSITIONS.find(item => item.to === "completed");
    expect(completed?.from).toBe("verifying");
    expect(completed?.prerequisites).toMatch(/certificate/i);
    expect(OWNER_PURGE_AUTHORISATION.forbiddenClientFlags).toEqual(
      expect.arrayContaining(["purgeReady", "eligible"])
    );
    expect(OWNER_PURGE_AUTHORISATION.requiredFields).toEqual(
      expect.arrayContaining(["deletionRunId", "permanentErasureAcknowledged"])
    );
  });
});
