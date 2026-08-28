import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildManagerDevelopmentIntelligence,
  loadSampleManagerDevelopmentSignals,
  MANAGER_DEVELOPMENT_PRIVACY_THRESHOLD,
  SAMPLE_MANAGER_DEVELOPMENT_PACK_KEY,
  toLeadSafeManagerDevelopmentPayload,
} from "@/lib/manager-development-intelligence";
import { loadSamplePack } from "@/lib/sample-organisations/registry";

const root = join(__dirname, "..");

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

type Row = Record<string, unknown>;

function createFilterClient(tables: Record<string, Row[]>): SupabaseClient {
  return {
    from(table: string) {
      return createQuery([...(tables[table] ?? [])]);
    },
  } as unknown as SupabaseClient;
}

function createQuery(rows: Row[]) {
  let filtered = rows;
  const query = {
    select() {
      return query;
    },
    eq(column: string, value: unknown) {
      filtered = filtered.filter(row => row[column] === value);
      return query;
    },
    in(column: string, values: unknown[]) {
      const allowed = new Set(values);
      filtered = filtered.filter(row => allowed.has(row[column]));
      return query;
    },
    is(column: string, value: null) {
      filtered = filtered.filter(row => row[column] == value);
      return query;
    },
    limit() {
      return query;
    },
    maybeSingle: async () => ({
      data: filtered[0] ?? null,
      error: null,
    }),
    then(
      onFulfilled?: (value: { data: Row[]; error: null }) => unknown,
      onRejected?: (reason: unknown) => unknown
    ) {
      return Promise.resolve({ data: filtered, error: null }).then(
        onFulfilled,
        onRejected
      );
    },
  };
  return query;
}

const SAMPLE_ORG_ID = "sample-org-averly";
const LIVE_ORG_ID = "live-org-customer";
const INSTALLATION_ID = "install-averly-1";
const MANAGER_USER_ID = "manager-user-1";

const AVERLY_RELATIONSHIPS = [
  "sophie-bennett",
  "marcus-reed",
  "priya-desai",
  "daniel-foster",
  "emma-watson",
  "jonathan-clarke",
  "maya-patel",
  "tom-harrison",
  "aisha-rahman",
  "ben-carter",
  "senior-leader-a",
  "manager-b",
] as const;

const AVERLY_DISPLAY_NAMES = [
  "Sophie Bennett",
  "Marcus Reed",
  "Priya Desai",
  "Daniel Foster",
  "Emma Watson",
  "Jonathan Clarke",
  "Maya Patel",
  "Tom Harrison",
  "Aisha Rahman",
  "Ben Carter",
  "Senior Leader A",
  "Manager B",
] as const;

function relationshipId(key: string): string {
  return `rel-${key}`;
}

function averlyInstallationRow(overrides: Row = {}): Row {
  return {
    id: INSTALLATION_ID,
    organisation_id: SAMPLE_ORG_ID,
    pack_key: SAMPLE_MANAGER_DEVELOPMENT_PACK_KEY,
    status: "ready",
    ...overrides,
  };
}

function mappedRelationships(keys: readonly string[]): Row[] {
  return keys.map(key => ({
    record_id: relationshipId(key),
    pack_entity_key: key,
    organisation_id: SAMPLE_ORG_ID,
    record_type: "relationship",
    installation_id: INSTALLATION_ID,
  }));
}

function fullAverlyTables(overrides: {
  evidence?: Row[];
  installation?: Row;
} = {}): Record<string, Row[]> {
  return {
    sample_organisation_installations: [
      overrides.installation ?? averlyInstallationRow(),
    ],
    sample_organisation_records: mappedRelationships(AVERLY_RELATIONSHIPS),
    development_evidence: overrides.evidence ?? [],
    organisation_memberships: [
      {
        user_id: MANAGER_USER_ID,
        professional_role: "manager",
        status: "active",
        organisation_id: SAMPLE_ORG_ID,
      },
    ],
    clients: [],
    client_items: [],
  };
}

function liveOrgTables(): Record<string, Row[]> {
  const people = Array.from({ length: 20 }, (_, index) => ({
    id: `person-${index + 1}`,
    coach_id: MANAGER_USER_ID,
    role: "Person",
    is_self_development: false,
    archived_at: null,
    organisation_id: LIVE_ORG_ID,
    name: `Person ${index + 1}`,
  }));

  const peopleThemes = people.flatMap(person =>
    ["delegation", "accountability", "confidence"].map((title, index) => ({
      id: `${person.id}-theme-${index}`,
      client_id: person.id,
      title,
      item_type: "theme",
      organisation_id: LIVE_ORG_ID,
    }))
  );

  const sessions = people.flatMap(person =>
    Array.from({ length: 4 }, (_, index) => ({
      id: `${person.id}-session-${index + 1}`,
      client_id: person.id,
      organisation_id: LIVE_ORG_ID,
      notes: "Private session notes that must never enter MDI.",
    }))
  );

  return {
    sample_organisation_installations: [
      {
        id: "other-sample-install",
        organisation_id: SAMPLE_ORG_ID,
        source_organisation_id: LIVE_ORG_ID,
        pack_key: SAMPLE_MANAGER_DEVELOPMENT_PACK_KEY,
        status: "ready",
      },
    ],
    sample_organisation_records: mappedRelationships(AVERLY_RELATIONSHIPS),
    organisation_memberships: [
      {
        user_id: MANAGER_USER_ID,
        professional_role: "manager",
        status: "active",
        organisation_id: LIVE_ORG_ID,
      },
    ],
    clients: [
      {
        id: "self-dev-1",
        coach_id: MANAGER_USER_ID,
        role: "Self development",
        is_self_development: true,
        archived_at: null,
        organisation_id: LIVE_ORG_ID,
        name: "The only Manager",
      },
      ...people,
    ],
    client_items: [
      {
        id: "self-theme-1",
        client_id: "self-dev-1",
        title: "Delegation",
        item_type: "theme",
        organisation_id: LIVE_ORG_ID,
      },
      {
        id: "self-theme-2",
        client_id: "self-dev-1",
        title: "Accountability",
        item_type: "theme",
        organisation_id: LIVE_ORG_ID,
      },
      ...peopleThemes,
    ],
    development_evidence: [
      {
        id: "ev-self-1",
        client_id: "self-dev-1",
        organisation_id: LIVE_ORG_ID,
        evidence_type: "manager_observation",
        review_status: "approved",
        include_in_intelligence: true,
        deleted_at: null,
        restricted: false,
        processing_status: "ready",
        capability_keys: ["delegation", "accountability"],
      },
    ],
    sessions,
  };
}

describe("controlled Averly sample Manager Development Intelligence", () => {
  it("installed Averly sample with overlapping fictional contributors returns patterns_available", async () => {
    const pack = loadSamplePack(SAMPLE_MANAGER_DEVELOPMENT_PACK_KEY);
    expect(pack.ok).toBe(true);

    const view = await buildManagerDevelopmentIntelligence({
      supabase: createFilterClient(fullAverlyTables()),
      organisationId: SAMPLE_ORG_ID,
    });
    const payload = toLeadSafeManagerDevelopmentPayload(view);

    expect(payload.status).toBe("patterns_available");
    expect(payload.patterns.length).toBeGreaterThan(0);
    expect(payload.patterns.map(pattern => pattern.themeKey).sort()).toEqual(
      ["accountability", "confidence", "delegation", "difficult_conversations"].sort()
    );
    expect(payload.readiness.sufficientManagerPopulation).toBe(true);
    expect(payload.message).toBeNull();
  });

  it("never returns person or client names in the Lead MDI payload", async () => {
    const view = await buildManagerDevelopmentIntelligence({
      supabase: createFilterClient(fullAverlyTables()),
      organisationId: SAMPLE_ORG_ID,
    });
    const payload = toLeadSafeManagerDevelopmentPayload(view);
    const json = JSON.stringify(payload);

    for (const name of AVERLY_DISPLAY_NAMES) {
      expect(json).not.toContain(name);
    }
    for (const key of AVERLY_RELATIONSHIPS) {
      expect(json).not.toContain(key);
      expect(json).not.toContain(relationshipId(key));
    }
    expect(json).not.toContain("managerUserId");
    expect(json).not.toContain("sophie.bennett.sample@averly.example");
    expect(json).not.toMatch(/contributor/i);
  });

  it("a normal organisation with one Manager plus many people and sessions still returns insufficient_evidence", async () => {
    const view = await buildManagerDevelopmentIntelligence({
      supabase: createFilterClient(liveOrgTables()),
      organisationId: LIVE_ORG_ID,
    });
    const payload = toLeadSafeManagerDevelopmentPayload(view);

    expect(payload.status).toBe("insufficient_evidence");
    expect(payload.patterns).toEqual([]);
    expect(payload.readiness.sufficientManagerPopulation).toBe(false);
    expect(JSON.stringify(payload)).not.toContain("Person 1");
    expect(JSON.stringify(payload)).not.toContain("The only Manager");
    expect(JSON.stringify(payload)).not.toContain("Private session notes");
  });

  it("production privacy threshold remains exactly 5 and is not bypassed for sample orgs", async () => {
    expect(MANAGER_DEVELOPMENT_PRIVACY_THRESHOLD).toBe(5);
    expect(read("lib/manager-development-intelligence/constants.ts")).toContain(
      "MANAGER_DEVELOPMENT_PRIVACY_THRESHOLD = 5"
    );
    expect(read("lib/manager-development-intelligence/build.ts")).not.toContain(
      "privacyThreshold"
    );
    expect(
      read("lib/manager-development-intelligence/load-sample-signals.ts")
    ).not.toContain("privacyThreshold");
  });

  it("four sample contributors to the same theme remain suppressed", async () => {
    const fourDelegationKeys = [
      "sophie-bennett",
      "marcus-reed",
      "jonathan-clarke",
      "tom-harrison",
    ] as const;

    const tables = fullAverlyTables();
    tables.sample_organisation_records = mappedRelationships(fourDelegationKeys);

    const view = await buildManagerDevelopmentIntelligence({
      supabase: createFilterClient(tables),
      organisationId: SAMPLE_ORG_ID,
    });

    expect(view.status).toBe("insufficient_evidence");
    expect(view.patterns).toEqual([]);
    expect(view.patterns.some(pattern => pattern.themeKey === "delegation")).toBe(
      false
    );
  });

  it("does not count psychometric evidence toward the sample contributor threshold", async () => {
    const fourDelegationKeys = [
      "sophie-bennett",
      "marcus-reed",
      "jonathan-clarke",
      "tom-harrison",
    ] as const;

    const tables = fullAverlyTables({
      evidence: [
        {
          id: "disc-priya",
          client_id: relationshipId("priya-desai"),
          organisation_id: SAMPLE_ORG_ID,
          evidence_type: "disc",
          review_status: "approved",
          include_in_intelligence: true,
          deleted_at: null,
          restricted: false,
          processing_status: "ready",
          capability_keys: ["delegation"],
        },
      ],
    });
    tables.sample_organisation_records = mappedRelationships([
      ...fourDelegationKeys,
      "priya-desai",
    ]);

    const view = await buildManagerDevelopmentIntelligence({
      supabase: createFilterClient(tables),
      organisationId: SAMPLE_ORG_ID,
    });

    expect(view.status).toBe("insufficient_evidence");
    expect(view.patterns.map(pattern => pattern.themeKey)).not.toContain(
      "delegation"
    );
  });

  it("does not activate the sample path for a different organisation or a non-ready install", async () => {
    const wrongOrg = await loadSampleManagerDevelopmentSignals({
      supabase: createFilterClient({
        sample_organisation_installations: [
          averlyInstallationRow({ organisation_id: SAMPLE_ORG_ID }),
        ],
        sample_organisation_records: mappedRelationships(AVERLY_RELATIONSHIPS),
      }),
      organisationId: LIVE_ORG_ID,
    });
    expect(wrongOrg).toBeNull();

    const notReady = await loadSampleManagerDevelopmentSignals({
      supabase: createFilterClient({
        sample_organisation_installations: [
          averlyInstallationRow({ status: "installing" }),
        ],
        sample_organisation_records: mappedRelationships(AVERLY_RELATIONSHIPS),
      }),
      organisationId: SAMPLE_ORG_ID,
    });
    expect(notReady).toBeNull();

    const northbridge = await loadSampleManagerDevelopmentSignals({
      supabase: createFilterClient({
        sample_organisation_installations: [
          averlyInstallationRow({ pack_key: "northbridge-healthcare" }),
        ],
        sample_organisation_records: mappedRelationships(AVERLY_RELATIONSHIPS),
      }),
      organisationId: SAMPLE_ORG_ID,
    });
    expect(northbridge).toBeNull();
  });

  it("keeps organisation context server-derived via requireOrganisationContext()", () => {
    const route = read(
      "app/api/organisations/manager-development-intelligence/route.ts"
    );
    expect(route).toContain("requireOrganisationContext");
    expect(route).toContain("auth.context.organisation.organisationId");
    expect(route).not.toContain("searchParams");
    expect(route).not.toMatch(/organisationIdFromBody|requestedOrganisation/i);
  });

  it("does not change the live MDI loader or feed session text into sample MDI", () => {
    const live = read("lib/manager-development-intelligence/load-signals.ts");
    const sample = read(
      "lib/manager-development-intelligence/load-sample-signals.ts"
    );
    const build = read("lib/manager-development-intelligence/build.ts");

    expect(live).not.toContain("sample_organisation_installations");
    expect(live).not.toContain("loadSamplePack");
    expect(live).not.toContain("from(\"sessions\")");
    expect(live).toContain("professional_role");
    expect(live).toContain("is_self_development");

    expect(sample).toContain("sample_organisation_installations");
    expect(sample).toContain('.eq("organisation_id", organisationId)');
    expect(sample).toContain("SAMPLE_MANAGER_DEVELOPMENT_PACK_KEY");
    expect(sample).toContain("PSYCHOMETRIC_EVIDENCE_TYPES");
    expect(sample).not.toContain("from(\"sessions\")");
    expect(sample).not.toContain("from(\"clients\")");
    expect(sample).not.toContain("currentFocus");
    expect(sample).not.toContain("aurelia");
    expect(sample).not.toContain("conversation");
    expect(sample).not.toContain("privacyThreshold");

    expect(build).toContain("loadSampleManagerDevelopmentSignals");
    expect(build).toContain("loadManagerDevelopmentDerivedSignals");
    expect(build).not.toContain("privacyThreshold");
  });
});
