import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildOrganisationIntelligenceExportHtml,
  buildOrganisationIntelligenceSnapshotView,
  mapAuthorisedCapabilitiesToThemeCandidates,
  mapSourceAggregates,
  ORGANISATION_INTELLIGENCE_PRIVACY_THRESHOLD,
  resolveOrganisationIntelligencePeriod,
} from "@/lib/organisation-intelligence";
import {
  canReadOrganisationIntelligence,
  hasPermission,
} from "@/lib/organisations/permissions";
import type { OrganisationIntelligenceSourceAggregates } from "@/lib/organisation-intelligence";

const root = join(__dirname, "..");

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

function baseAggregates(
  overrides: Partial<OrganisationIntelligenceSourceAggregates> = {}
): OrganisationIntelligenceSourceAggregates {
  return {
    organisationId: "org-1",
    periodStart: "2026-05-06",
    periodEnd: "2026-08-03",
    previousPeriodStart: "2026-02-05",
    previousPeriodEnd: "2026-05-05",
    selfDevelopmentExcluded: true,
    activeRelationships: 12,
    activePractitioners: 4,
    conversations: 28,
    previousConversations: 20,
    completedConversations: 22,
    previousCompletedConversations: 16,
    actionsTotal: 30,
    actionsCompleted: 18,
    previousActionsTotal: 24,
    previousActionsCompleted: 12,
    reflectionsCompleted: 14,
    previousReflectionsCompleted: 10,
    developmentUpdatesCompleted: 9,
    previousDevelopmentUpdatesCompleted: 6,
    evidenceItems: 12,
    previousEvidenceItems: 8,
    contributingRelationships: 8,
    themeCandidates: [],
    previousThemeCandidates: [],
    progressSignals: [],
    itemThemes: [],
    authorisedEvidenceCapabilities: [],
    previousAuthorisedEvidenceCapabilities: [],
    hasEarlierPeriodActivity: true,
    ...overrides,
  };
}

describe("Gate 3.4 P0 raw aggregation RPC lockdown", () => {
  const lockdownSql = read(
    "supabase/migrations/20260816150000_org_intelligence_raw_rpc_lockdown.sql"
  );
  const generateRoute = read(
    "app/api/organisations/intelligence/generate/route.ts"
  );
  const loadRoute = read("app/api/organisations/intelligence/route.ts");
  const repository = read("lib/organisation-intelligence/repository.ts");
  const generateLib = read("lib/organisation-intelligence/generate.ts");

  it("A–C: migration revokes authenticated/anon/public EXECUTE", () => {
    expect(lockdownSql).toContain(
      "revoke all on function public.aggregate_organisation_intelligence_sources(uuid, date, date)\n  from authenticated"
    );
    expect(lockdownSql).toContain(
      "revoke all on function public.aggregate_organisation_intelligence_sources(uuid, date, date)\n  from anon"
    );
    expect(lockdownSql).toContain(
      "revoke all on function public.aggregate_organisation_intelligence_sources(uuid, date, date)\n  from public"
    );
    // Direct Lead/oversight/manager/practitioner PostgREST callers must not gain EXECUTE.
    expect(lockdownSql).not.toMatch(
      /grant execute on function public\.aggregate_organisation_intelligence_sources\(uuid, date, date\)\s+to authenticated/i
    );
    expect(lockdownSql).not.toMatch(
      /grant execute on function public\.aggregate_organisation_intelligence_sources\(uuid, date, date\)\s+to anon/i
    );
  });

  it("D: service_role (and postgres) retain EXECUTE; service_role auth gate exists", () => {
    expect(lockdownSql).toMatch(
      /grant execute on function public\.aggregate_organisation_intelligence_sources\(uuid, date, date\)\s+to service_role/i
    );
    expect(lockdownSql).toMatch(
      /grant execute on function public\.aggregate_organisation_intelligence_sources\(uuid, date, date\)\s+to postgres/i
    );
    expect(lockdownSql).toContain("coalesce(auth.role(), '') = 'service_role'");
    // Aggregation body retained (living bridge fields).
    expect(lockdownSql).toContain("authorisedEvidenceCapabilities");
    expect(lockdownSql).toContain("md5(de.client_id::text)");
  });

  it("E: authorised Lead generate path checks permission then uses service-role aggregation", () => {
    expect(generateRoute).toContain("requireOrganisationPermission");
    expect(generateRoute).toContain("intelligence.organisation.read");
    expect(generateRoute).toContain("isSupabaseServiceRoleConfigured");
    expect(generateRoute).toContain("Authz first");
    expect(generateLib).toContain("fetchOrganisationIntelligenceSources");
    expect(generateLib).toContain("service-role only");
    expect(repository).toContain("getSupabaseServiceClient");
    expect(repository).toContain("isSupabaseServiceRoleConfigured");
    expect(repository).toContain("aggregate_organisation_intelligence_sources");
    // Must not call RPC with the Lead user client.
    expect(repository).not.toMatch(
      /export async function fetchOrganisationIntelligenceSources\(\s*supabase:\s*SupabaseClient/
    );
  });

  it("F: Lead still loads latest ready snapshot via authenticated client", () => {
    expect(loadRoute).toContain("loadOrganisationIntelligenceSnapshot");
    expect(loadRoute).toContain("auth.context.supabase");
    expect(loadRoute).toContain("intelligence.organisation.read");
    expect(canReadOrganisationIntelligence("oversight")).toBe(true);
    expect(hasPermission("oversight", "intelligence.organisation.read")).toBe(
      true
    );
  });

  it("G–H: Lead snapshot payload and export contain no contributorKey", () => {
    const caps = [1, 2, 3, 4, 5].map(n => ({
      capabilityKey: "delegation",
      contributorKey: `secret-hash-${n}`,
      sourceType: "development_evidence" as const,
      occurredAt: "2026-08-01T00:00:00.000Z",
    }));
    const view = buildOrganisationIntelligenceSnapshotView({
      id: "snap-ready",
      organisationId: "org-1",
      organisationName: "UAT Org",
      period: resolveOrganisationIntelligencePeriod({
        preset: "last_90_days",
        now: new Date("2026-08-04T12:00:00.000Z"),
      }),
      generatedAt: "2026-08-04T12:00:00.000Z",
      generatedBy: "lead-1",
      aggregates: baseAggregates({
        conversations: 20,
        contributingRelationships: 7,
        authorisedEvidenceCapabilities: caps,
      }),
      status: "ready",
    });
    const json = JSON.stringify(view);
    expect(json).not.toContain("contributorKey");
    expect(json).not.toContain("secret-hash");
    const html = buildOrganisationIntelligenceExportHtml(view);
    expect(html).not.toContain("contributorKey");
    expect(html).not.toContain("secret-hash");
  });

  it("I: below-threshold capability is not buyer-visible as a theme", () => {
    expect(ORGANISATION_INTELLIGENCE_PRIVACY_THRESHOLD).toBe(5);
    const view = buildOrganisationIntelligenceSnapshotView({
      id: "snap-collab",
      organisationId: "org-1",
      organisationName: "UAT Org",
      period: resolveOrganisationIntelligencePeriod({
        preset: "last_90_days",
        now: new Date("2026-08-04T12:00:00.000Z"),
      }),
      generatedAt: "2026-08-04T12:00:00.000Z",
      generatedBy: "lead-1",
      aggregates: baseAggregates({
        conversations: 20,
        contributingRelationships: 7,
        authorisedEvidenceCapabilities: [1, 2, 3, 4].map(n => ({
          capabilityKey: "collaboration",
          contributorKey: `collab-${n}`,
          sourceType: "development_evidence",
          occurredAt: null,
        })),
      }),
      status: "ready",
    });
    expect(view.themes.some(t => t.themeKey === "collaboration")).toBe(false);
    expect(JSON.stringify(view)).not.toContain("collab-");
  });

  it("J: unmapped capability cannot appear as a Lead theme", () => {
    const mapped = mapAuthorisedCapabilitiesToThemeCandidates([
      {
        capabilityKey: "strategic_thinking",
        contributorKey: "hash-unmapped",
        sourceType: "development_evidence",
      },
    ]);
    expect(mapped).toEqual([]);
    const view = buildOrganisationIntelligenceSnapshotView({
      id: "snap-unmap",
      organisationId: "org-1",
      organisationName: "UAT Org",
      period: resolveOrganisationIntelligencePeriod({
        preset: "last_90_days",
        now: new Date("2026-08-04T12:00:00.000Z"),
      }),
      generatedAt: "2026-08-04T12:00:00.000Z",
      generatedBy: "lead-1",
      aggregates: baseAggregates({
        conversations: 20,
        contributingRelationships: 7,
        authorisedEvidenceCapabilities: [1, 2, 3, 4, 5, 6].map(n => ({
          capabilityKey: "strategic_thinking",
          contributorKey: `st-${n}`,
          sourceType: "development_evidence",
          occurredAt: null,
        })),
      }),
      status: "ready",
    });
    expect(view.themes.some(t => t.themeKey === "strategic_thinking")).toBe(
      false
    );
    expect(JSON.stringify(view)).not.toContain("st-");
  });

  it("K: cross-org isolation remains on snapshot RLS permission key", () => {
    expect(lockdownSql).toContain("INTERNAL");
    // Snapshot policies still keyed by organisation permission (unchanged foundation).
    const oiSql = read(
      "supabase/migrations/20260804160000_organisation_intelligence.sql"
    );
    expect(oiSql).toContain("intelligence.organisation.read");
    expect(oiSql).toContain("organisation_id");
    expect(hasPermission("practitioner", "intelligence.organisation.read")).toBe(
      false
    );
  });

  it("L: ordinary People/name metadata permission unchanged", () => {
    expect(hasPermission("oversight", "organisation.view_safe_oversight")).toBe(
      true
    );
    expect(hasPermission("oversight", "relationships.view_assigned")).toBe(true);
    // Lockdown must not touch clients RLS / people visibility.
    expect(lockdownSql).not.toContain("alter table public.clients");
    expect(lockdownSql).not.toContain("user_can_view_client_metadata");
  });

  it("readiness path never returns raw candidate rows to Lead", () => {
    expect(loadRoute).toContain("evidenceIndicators");
    expect(loadRoute).toContain("contributingRelationships");
    expect(loadRoute).toContain("readyToGenerate");
    expect(loadRoute).toContain("Never return raw candidate rows");
    expect(loadRoute).toContain("fetchOrganisationIntelligenceSources");
    expect(loadRoute).toContain("isSupabaseServiceRoleConfigured");
    expect(loadRoute).not.toMatch(
      /fetchOrganisationIntelligenceSources\(\s*auth\.context\.supabase/
    );
  });

  it("snapshot generation regression wiring: authz → service RPC → persist → load", () => {
    expect(generateRoute).toContain("generateOrganisationIntelligence");
    expect(generateLib).toContain("persistSnapshotView");
    expect(generateLib).toContain("buildOrganisationIntelligenceSnapshotView");
    expect(generateLib).toContain("markSnapshotFailed");
    expect(repository).toContain("Call only AFTER application authz");
    expect(ORGANISATION_INTELLIGENCE_PRIVACY_THRESHOLD).toBe(5);
  });

  it("internal map still understands contributorKey for server counting only", () => {
    const mapped = mapSourceAggregates({
      organisationId: "org-1",
      periodStart: "2026-01-01",
      periodEnd: "2026-03-31",
      previousPeriodStart: "2025-10-01",
      previousPeriodEnd: "2025-12-31",
      selfDevelopmentExcluded: true,
      authorisedEvidenceCapabilities: [
        {
          capabilityKey: "delegation",
          contributorKey: "internal-only",
          sourceType: "development_evidence",
        },
      ],
      hasEarlierPeriodActivity: false,
    });
    expect(mapped.authorisedEvidenceCapabilities?.[0]?.contributorKey).toBe(
      "internal-only"
    );
  });

  it("migration file exists and does not mutate UAT/source data", () => {
    expect(
      existsSync(
        join(
          root,
          "supabase/migrations/20260816150000_org_intelligence_raw_rpc_lockdown.sql"
        )
      )
    ).toBe(true);
    expect(lockdownSql).not.toMatch(/update\s+public\./i);
    expect(lockdownSql).not.toMatch(/delete\s+from\s+public\./i);
    expect(lockdownSql).not.toMatch(/truncate\s+/i);
    expect(lockdownSql).not.toMatch(/insert\s+into\s+public\./i);
  });
});
