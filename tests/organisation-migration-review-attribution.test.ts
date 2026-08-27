import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertOwnerPayloadIsSafe } from "@/lib/owner/privacy";
import {
  assessOrganisationMigrationReview,
  MIGRATION_REVIEW_AMBIGUOUS_CODE,
  MIGRATION_REVIEW_ASSIGNMENT_SELECT,
  MIGRATION_REVIEW_CLIENT_SELECT,
  MIGRATION_REVIEW_DETAILS_NEVER_AUTHORITY_LIMITATION,
  MIGRATION_REVIEW_ROW_SELECT,
  MIGRATION_REVIEW_SESSION_SELECT,
  MIGRATION_REVIEW_UNKNOWN_TABLE_CODE,
  migrationReviewReviewReasons,
} from "@/lib/owner/organisation-migration-review-attribution";
import {
  attributeMigrationReviewRecord,
  migrationReviewBlocksPurge,
  ORGANISATION_PURGE_MUST_NEVER_DELETE_AUTH_USERS,
} from "@/lib/owner/organisation-purge-architecture";
import {
  derivePurgeReadiness,
  PURGE_READINESS_RESULTS,
} from "@/lib/owner/organisation-commercial-retention";

const root = process.cwd();
const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const REVIEW_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_CLIENT = "44444444-4444-4444-8444-444444444444";
const OTHER_SESSION = "55555555-5555-4555-8555-555555555555";
const MISSING_ID = "66666666-6666-4666-8666-666666666666";
const EVIDENCE_ID = "77777777-7777-4777-8777-777777777777";

function read(pathFromRoot: string): string {
  return readFileSync(join(root, pathFromRoot), "utf8");
}

function createTableClient(tables: Record<string, Record<string, unknown>[]>): SupabaseClient {
  return {
    from(table: string) {
      const filters: Array<[string, string, unknown]> = [];
      const builder = {
        select() {
          return builder;
        },
        eq(column: string, value: unknown) {
          filters.push(["eq", column, value]);
          return builder;
        },
        in(column: string, values: unknown) {
          filters.push(["in", column, values]);
          return builder;
        },
        order() {
          return builder;
        },
        range() {
          return builder;
        },
        insert() {
          throw new Error("mutation is not allowed in DL-08 slice 1");
        },
        update() {
          throw new Error("mutation is not allowed in DL-08 slice 1");
        },
        delete() {
          throw new Error("mutation is not allowed in DL-08 slice 1");
        },
        then(
          resolve: (value: {
            data: Record<string, unknown>[];
            error: { message: string } | null;
          }) => unknown
        ) {
          let rows = tables[table] ?? [];
          for (const [op, column, value] of filters) {
            if (op === "eq") {
              rows = rows.filter(row => String(row[column] ?? "") === String(value));
            }
            if (op === "in") {
              const ids = new Set(
                (Array.isArray(value) ? value : []).map(item => String(item))
              );
              rows = rows.filter(row => ids.has(String(row[column] ?? "")));
            }
          }
          return resolve({ data: rows, error: null });
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

function baseReadiness(
  overrides: Partial<Parameters<typeof derivePurgeReadiness>[0]> = {}
): Parameters<typeof derivePurgeReadiness>[0] {
  return {
    organisationFound: true,
    organisationStatus: "pending_closure",
    organisationType: "practice",
    isSampleInstallation: false,
    isSampleSource: false,
    isUndeletable: false,
    openRunCount: 1,
    runOrganisationId: ORG_A,
    runFormerOrganisationId: ORG_A,
    expectedOrganisationId: ORG_A,
    runStatus: "commercial_copied",
    freezeBlocksMemberAccess: true,
    commercialVerificationPassed: true,
    sourceRetainedMatches: true,
    preflightReviewReasons: [],
    ...overrides,
  };
}

describe("DL-08 slice 1 client attribution", () => {
  it("1. client org = target → attributed", () => {
    const result = attributeMigrationReviewRecord({
      tableName: "clients",
      recordId: CLIENT_ID,
      targetOrganisationId: ORG_A,
      sourceClient: { id: CLIENT_ID, organisationId: ORG_A },
      activeAssignmentOrganisationIds: [],
    });
    expect(result.result).toBe("attributed");
    expect(result.basis).toBe("source_organisation_id");
  });

  it("2. client org = other → not_attributed", () => {
    const result = attributeMigrationReviewRecord({
      tableName: "clients",
      recordId: CLIENT_ID,
      targetOrganisationId: ORG_A,
      sourceClient: { id: CLIENT_ID, organisationId: ORG_B },
      activeAssignmentOrganisationIds: [ORG_A],
    });
    expect(result.result).toBe("not_attributed");
  });

  it("3. null org + one active target assignment → attributed", () => {
    const result = attributeMigrationReviewRecord({
      tableName: "clients",
      recordId: CLIENT_ID,
      targetOrganisationId: ORG_A,
      sourceClient: { id: CLIENT_ID, organisationId: null },
      activeAssignmentOrganisationIds: [ORG_A],
    });
    expect(result.result).toBe("attributed");
    expect(result.basis).toBe("single_org_assignment");
  });

  it("4. null org + one active other assignment → not_attributed", () => {
    const result = attributeMigrationReviewRecord({
      tableName: "clients",
      recordId: CLIENT_ID,
      targetOrganisationId: ORG_A,
      sourceClient: { id: CLIENT_ID, organisationId: null },
      activeAssignmentOrganisationIds: [ORG_B],
    });
    expect(result.result).toBe("not_attributed");
  });

  it("5. null org + multiple active orgs → ambiguous", () => {
    const result = attributeMigrationReviewRecord({
      tableName: "clients",
      recordId: CLIENT_ID,
      targetOrganisationId: ORG_A,
      sourceClient: { id: CLIENT_ID, organisationId: null },
      activeAssignmentOrganisationIds: [ORG_A, ORG_B],
    });
    expect(result.result).toBe("ambiguous");
    expect(migrationReviewBlocksPurge([result]).blocked).toBe(true);
  });

  it("6. null org + no assignment → not_attributed", () => {
    const result = attributeMigrationReviewRecord({
      tableName: "clients",
      recordId: CLIENT_ID,
      targetOrganisationId: ORG_A,
      sourceClient: { id: CLIENT_ID, organisationId: null },
      activeAssignmentOrganisationIds: [],
    });
    expect(result.result).toBe("not_attributed");
  });

  it("7. missing client → not_attributed", () => {
    const result = attributeMigrationReviewRecord({
      tableName: "clients",
      recordId: MISSING_ID,
      targetOrganisationId: ORG_A,
      sourceClient: null,
      activeAssignmentOrganisationIds: [ORG_A],
    });
    expect(result.result).toBe("not_attributed");
  });
});

describe("DL-08 slice 1 session attribution", () => {
  it("8. session org = target → attributed", () => {
    const result = attributeMigrationReviewRecord({
      tableName: "sessions",
      recordId: SESSION_ID,
      targetOrganisationId: ORG_A,
      sourceSession: {
        id: SESSION_ID,
        organisationId: ORG_A,
        clientId: CLIENT_ID,
      },
      sessionClient: { id: CLIENT_ID, organisationId: ORG_A },
      activeAssignmentOrganisationIds: [],
    });
    expect(result.result).toBe("attributed");
    expect(result.basis).toBe("source_organisation_id");
  });

  it("9. session org = other → not_attributed", () => {
    const result = attributeMigrationReviewRecord({
      tableName: "sessions",
      recordId: SESSION_ID,
      targetOrganisationId: ORG_A,
      sourceSession: {
        id: SESSION_ID,
        organisationId: ORG_B,
        clientId: CLIENT_ID,
      },
      sessionClient: { id: CLIENT_ID, organisationId: ORG_B },
      activeAssignmentOrganisationIds: [],
    });
    expect(result.result).toBe("not_attributed");
  });

  it("10. session/client organisation disagreement → ambiguous", () => {
    const result = attributeMigrationReviewRecord({
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
    expect(result.result).toBe("ambiguous");
  });

  it("11. null session org + target client org → attributed", () => {
    const result = attributeMigrationReviewRecord({
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
    expect(result.result).toBe("attributed");
    expect(result.basis).toBe("session_client_organisation_id");
  });

  it("12. both null + one active target assignment → attributed", () => {
    const result = attributeMigrationReviewRecord({
      tableName: "sessions",
      recordId: SESSION_ID,
      targetOrganisationId: ORG_A,
      sourceSession: {
        id: SESSION_ID,
        organisationId: null,
        clientId: CLIENT_ID,
      },
      sessionClient: { id: CLIENT_ID, organisationId: null },
      activeAssignmentOrganisationIds: [ORG_A],
    });
    expect(result.result).toBe("attributed");
    expect(result.basis).toBe("single_org_assignment");
  });

  it("13. both null + multiple assignments → ambiguous", () => {
    const result = attributeMigrationReviewRecord({
      tableName: "sessions",
      recordId: SESSION_ID,
      targetOrganisationId: ORG_A,
      sourceSession: {
        id: SESSION_ID,
        organisationId: null,
        clientId: CLIENT_ID,
      },
      sessionClient: { id: CLIENT_ID, organisationId: null },
      activeAssignmentOrganisationIds: [ORG_A, ORG_B],
    });
    expect(result.result).toBe("ambiguous");
  });

  it("14. missing session → not_attributed", () => {
    const result = attributeMigrationReviewRecord({
      tableName: "sessions",
      recordId: MISSING_ID,
      targetOrganisationId: ORG_A,
      sourceSession: null,
      activeAssignmentOrganisationIds: [ORG_A],
    });
    expect(result.result).toBe("not_attributed");
  });
});

describe("DL-08 slice 1 safety and readiness", () => {
  it("15. unknown table → unknown_table / fail closed", async () => {
    const unit = attributeMigrationReviewRecord({
      tableName: "intelligence_items",
      recordId: EVIDENCE_ID,
      targetOrganisationId: ORG_A,
      activeAssignmentOrganisationIds: [],
    });
    expect(unit.result).toBe("unknown_table");
    expect(migrationReviewBlocksPurge([unit]).blocked).toBe(true);

    const assessment = await assessOrganisationMigrationReview({
      supabase: createTableClient({
        organisation_migration_review: [
          {
            id: REVIEW_ID,
            table_name: "intelligence_items",
            record_id: EVIDENCE_ID,
          },
        ],
      }),
      organisationId: ORG_A,
      descendantIds: new Set([ORG_A, EVIDENCE_ID]),
    });
    expect(assessment.unknownTableCount).toBe(1);
    expect(assessment.attributedCount).toBe(0);
    expect(migrationReviewReviewReasons(assessment).map(item => item.code)).toContain(
      MIGRATION_REVIEW_UNKNOWN_TABLE_CODE
    );
  });

  it("16. spoof target UUID in details JSON does NOT cause attribution", async () => {
    const spoofed = attributeMigrationReviewRecord({
      tableName: "clients",
      recordId: CLIENT_ID,
      targetOrganisationId: ORG_A,
      details: {
        organisation_id: ORG_A,
        notes: "spoofed coaching content",
        extracted_text: ORG_A,
      },
      sourceClient: { id: CLIENT_ID, organisationId: ORG_B },
      activeAssignmentOrganisationIds: [],
    });
    expect(spoofed.result).toBe("not_attributed");

    const assessment = await assessOrganisationMigrationReview({
      supabase: createTableClient({
        organisation_migration_review: [
          {
            id: REVIEW_ID,
            table_name: "clients",
            record_id: CLIENT_ID,
            details: {
              organisation_id: ORG_A,
              coaching_notes: "must not be selected or trusted",
            },
          },
        ],
        clients: [{ id: CLIENT_ID, organisation_id: ORG_B }],
      }),
      organisationId: ORG_A,
      descendantIds: new Set([ORG_A]),
    });
    expect(assessment.attributedCount).toBe(0);
    expect(assessment.ambiguousCount).toBe(0);
    expect(assessment.unknownTableCount).toBe(0);
  });

  it("17. cross-tenant record is not captured", async () => {
    const assessment = await assessOrganisationMigrationReview({
      supabase: createTableClient({
        organisation_migration_review: [
          {
            id: REVIEW_ID,
            table_name: "clients",
            record_id: OTHER_CLIENT,
            details: { organisation_id: ORG_A },
          },
        ],
        clients: [{ id: OTHER_CLIENT, organisation_id: ORG_B }],
      }),
      organisationId: ORG_A,
      descendantIds: new Set([ORG_A, CLIENT_ID]),
    });
    expect(assessment.attributedCount).toBe(0);
    expect(assessment.ambiguousCount).toBe(0);
    expect(migrationReviewReviewReasons(assessment)).toEqual([]);
  });

  it("18. ambiguous relevant row prevents purge-ready result", async () => {
    const assessment = await assessOrganisationMigrationReview({
      supabase: createTableClient({
        organisation_migration_review: [
          {
            id: REVIEW_ID,
            table_name: "clients",
            record_id: CLIENT_ID,
          },
        ],
        clients: [{ id: CLIENT_ID, organisation_id: null }],
        relationship_assignments: [
          { client_id: CLIENT_ID, organisation_id: ORG_A, status: "active" },
          { client_id: CLIENT_ID, organisation_id: ORG_B, status: "active" },
        ],
      }),
      organisationId: ORG_A,
      descendantIds: new Set([ORG_A]),
    });
    expect(assessment.ambiguousCount).toBe(1);
    const reasons = migrationReviewReviewReasons(assessment);
    expect(reasons.map(item => item.code)).toContain(MIGRATION_REVIEW_AMBIGUOUS_CODE);

    const readiness = derivePurgeReadiness(
      baseReadiness({ preflightReviewReasons: reasons })
    );
    expect(PURGE_READINESS_RESULTS).not.toContain("ready");
    expect(readiness.result).toBe("requires_review");
    expect(readiness.reasons.map(item => item.code)).toContain(
      MIGRATION_REVIEW_AMBIGUOUS_CODE
    );
  });

  it("19. unrelated unattributed row does not block target", async () => {
    const assessment = await assessOrganisationMigrationReview({
      supabase: createTableClient({
        organisation_migration_review: [
          {
            id: REVIEW_ID,
            table_name: "sessions",
            record_id: OTHER_SESSION,
          },
        ],
        sessions: [
          {
            id: OTHER_SESSION,
            organisation_id: ORG_B,
            client_id: OTHER_CLIENT,
          },
        ],
        clients: [{ id: OTHER_CLIENT, organisation_id: ORG_B }],
      }),
      organisationId: ORG_A,
      descendantIds: new Set([ORG_A]),
    });
    expect(assessment.attributedCount).toBe(0);
    expect(assessment.ambiguousCount).toBe(0);
    expect(assessment.unknownTableCount).toBe(0);
    expect(migrationReviewReviewReasons(assessment)).toEqual([]);

    const unrelatedUnknown = await assessOrganisationMigrationReview({
      supabase: createTableClient({
        organisation_migration_review: [
          {
            id: REVIEW_ID,
            table_name: "intelligence_items",
            record_id: EVIDENCE_ID,
          },
        ],
      }),
      organisationId: ORG_A,
      descendantIds: new Set([ORG_A]),
    });
    expect(unrelatedUnknown.unknownTableCount).toBe(0);
    expect(migrationReviewReviewReasons(unrelatedUnknown)).toEqual([]);

    const readiness = derivePurgeReadiness(baseReadiness());
    expect(readiness.reasons.map(item => item.code)).not.toContain(
      MIGRATION_REVIEW_AMBIGUOUS_CODE
    );
    expect(readiness.reasons.map(item => item.code)).not.toContain(
      MIGRATION_REVIEW_UNKNOWN_TABLE_CODE
    );
    expect(readiness.result).toBe("requires_review");
  });

  it("20. no details JSON returned to Owner", async () => {
    const assessment = await assessOrganisationMigrationReview({
      supabase: createTableClient({
        organisation_migration_review: [
          {
            id: REVIEW_ID,
            table_name: "clients",
            record_id: CLIENT_ID,
            details: { organisation_id: ORG_A, private_notes: "secret" },
          },
        ],
        clients: [{ id: CLIENT_ID, organisation_id: ORG_A }],
      }),
      organisationId: ORG_A,
      descendantIds: new Set([ORG_A, CLIENT_ID]),
    });
    expect(assessment.attributedCount).toBe(1);
    const payload = {
      attributedCount: assessment.attributedCount,
      ambiguousCount: assessment.ambiguousCount,
      unknownTableCount: assessment.unknownTableCount,
      mutatedNothing: assessment.mutatedNothing,
    };
    expect(JSON.stringify(payload)).not.toMatch(/private_notes|secret|"details"/i);
    expect(() => assertOwnerPayloadIsSafe(payload)).not.toThrow();
  });

  it("21-24. no mutation, Auth delete, commercial, or pending_closure changes", () => {
    const attribution = read("lib/owner/organisation-migration-review-attribution.ts");
    const preflight = read("lib/owner/organisation-deletion-preflight.ts");
    const retention = read("lib/owner/organisation-commercial-retention.ts");
    const architecture = read("lib/owner/organisation-purge-architecture.ts");

    for (const source of [attribution, preflight, retention]) {
      expect(source).not.toMatch(/\.insert\(/);
      expect(source).not.toMatch(/\.update\(/);
      expect(source).not.toMatch(/\.delete\(/);
      expect(source).not.toMatch(/\.remove\(/);
      expect(source).not.toMatch(/\bDELETE FROM\b/i);
      expect(source).not.toContain("auth.admin.deleteUser");
      expect(source).not.toMatch(/\.deleteUser\s*\(/);
      expect(source).not.toContain("details::text");
      expect(source).not.toMatch(/\.like\(/);
    }

    expect(attribution).toContain(MIGRATION_REVIEW_ROW_SELECT);
    expect(attribution).toContain(MIGRATION_REVIEW_CLIENT_SELECT);
    expect(attribution).toContain(MIGRATION_REVIEW_SESSION_SELECT);
    expect(attribution).toContain(MIGRATION_REVIEW_ASSIGNMENT_SELECT);
    expect(attribution).toContain("attributeMigrationReviewRecord");
    expect(attribution).not.toMatch(/select\([^)]*details/);
    expect(attribution).not.toContain("details.organisation_id");
    expect(MIGRATION_REVIEW_DETAILS_NEVER_AUTHORITY_LIMITATION).toContain(
      "never attribution authority"
    );

    expect(ORGANISATION_PURGE_MUST_NEVER_DELETE_AUTH_USERS).toBe(true);
    expect(architecture).toContain("ORGANISATION_PURGE_MUST_NEVER_DELETE_AUTH_USERS = true");

    expect(preflight).toContain('disposition: "retain"');
    expect(retention).toContain("retained_organisation_commercial_records");
    expect(PURGE_READINESS_RESULTS).toEqual(["not_ready", "requires_review", "blocked"]);
    expect(preflight).toContain("pending_closure");
    expect(preflight).toMatch(
      /Licence suspended or pending_closure does not by itself make the organisation eligible/
    );
  });
});
