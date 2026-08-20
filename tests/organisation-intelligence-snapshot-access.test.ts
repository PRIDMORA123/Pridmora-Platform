import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  canReadOrganisationIntelligence,
  hasPermission,
} from "@/lib/organisations/permissions";

const root = process.cwd();

function read(pathFromRoot: string): string {
  return readFileSync(join(root, pathFromRoot), "utf8");
}

const ORG_ID = "org-new-1";
const privilegedClient = { privileged: true };
const leadJwt = { jwt: true };

const requireOrganisationContext = vi.fn();
const loadOrganisationIntelligenceSnapshot = vi.fn();
const listOrganisationIntelligenceSnapshots = vi.fn();
const generateOrganisationIntelligence = vi.fn();
const fetchOrganisationIntelligenceSources = vi.fn();
const writeOrganisationAudit = vi.fn(async (_input?: unknown) => undefined);
const getSupabaseServiceClient = vi.fn(() => privilegedClient);
const isSupabaseServiceRoleConfigured = vi.fn(() => true);

vi.mock("@/lib/organisations/current-organisation", async importOriginal => {
  const actual =
    await importOriginal<typeof import("@/lib/organisations/current-organisation")>();
  return {
    ...actual,
    requireOrganisationContext: (...args: unknown[]) =>
      requireOrganisationContext(...args),
  };
});

vi.mock("@/lib/organisations/repository", () => ({
  writeOrganisationAudit: (input: unknown) => writeOrganisationAudit(input),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServiceClient: () => getSupabaseServiceClient(),
  isSupabaseServiceRoleConfigured: () => isSupabaseServiceRoleConfigured(),
}));

vi.mock("@/lib/organisation-intelligence/repository", async importOriginal => {
  const actual =
    await importOriginal<
      typeof import("@/lib/organisation-intelligence/repository")
    >();
  return {
    ...actual,
    loadOrganisationIntelligenceSnapshot: (input: unknown) =>
      loadOrganisationIntelligenceSnapshot(input),
    listOrganisationIntelligenceSnapshots: (input: unknown) =>
      listOrganisationIntelligenceSnapshots(input),
    fetchOrganisationIntelligenceSources: (
      organisationId: unknown,
      period: unknown
    ) => fetchOrganisationIntelligenceSources(organisationId, period),
  };
});

vi.mock("@/lib/organisation-intelligence/generate", () => ({
  generateOrganisationIntelligence: (input: unknown) =>
    generateOrganisationIntelligence(input),
}));

function leadContext() {
  return {
    ok: true as const,
    context: {
      user: { id: "lead-1" },
      supabase: leadJwt,
      organisation: {
        organisationId: ORG_ID,
        role: "oversight",
        organisation: { name: "New Customer", organisationId: ORG_ID },
      },
    },
  };
}

function managerContext() {
  return {
    ok: true as const,
    context: {
      user: { id: "manager-1" },
      supabase: leadJwt,
      organisation: {
        organisationId: ORG_ID,
        role: "practitioner",
        organisation: { name: "New Customer", organisationId: ORG_ID },
      },
    },
  };
}

const readySnapshot = {
  id: "snap-ready-1",
  organisationId: ORG_ID,
  organisationName: "New Customer",
  status: "ready",
  period: { preset: "last_90_days" },
  sourceRelationshipCount: 8,
  sourceConversationCount: 12,
  emptyState: false,
  confidenceLevel: "medium",
  executiveBrief: "Aggregated development evidence for the organisation.",
  themes: [{ themeKey: "delegation", themeLabel: "Delegation", suppressed: false }],
  metrics: [],
  capabilities: [],
  recommendations: [],
  attentionAreas: [],
  coachingImpact: [],
  evidenceTraces: [],
};

describe("People Development snapshot access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isSupabaseServiceRoleConfigured.mockReturnValue(true);
    getSupabaseServiceClient.mockReturnValue(privilegedClient);
    loadOrganisationIntelligenceSnapshot.mockResolvedValue(readySnapshot);
    listOrganisationIntelligenceSnapshots.mockResolvedValue([
      { id: "snap-ready-1", status: "ready" },
    ]);
    fetchOrganisationIntelligenceSources.mockResolvedValue({
      contributingRelationships: 8,
      conversations: 12,
    });
    generateOrganisationIntelligence.mockResolvedValue({
      ok: true,
      view: readySnapshot,
      stage: "completing_checks",
    });
  });

  it("keeps intelligence.organisation.read as the permission boundary", () => {
    expect(canReadOrganisationIntelligence("oversight")).toBe(true);
    expect(hasPermission("oversight", "intelligence.organisation.read")).toBe(
      true
    );
    expect(canReadOrganisationIntelligence("practitioner")).toBe(false);
    expect(hasPermission("practitioner", "intelligence.organisation.read")).toBe(
      false
    );
  });

  it("uses the privileged client for snapshot load after authz, not the Lead JWT", () => {
    const load = read("app/api/organisations/intelligence/route.ts");
    const generate = read(
      "app/api/organisations/intelligence/generate/route.ts"
    );
    const generateLib = read("lib/organisation-intelligence/generate.ts");
    const exportRoute = read(
      "app/api/organisations/intelligence/[snapshotId]/export/route.ts"
    );
    expect(load).toContain("intelligence.organisation.read");
    expect(load).toContain("getSupabaseServiceClient");
    expect(load).not.toMatch(
      /loadOrganisationIntelligenceSnapshot\(\{\s*supabase:\s*auth\.context\.supabase/
    );
    expect(generate).toContain("intelligence.organisation.read");
    expect(generate).not.toMatch(
      /generateOrganisationIntelligence\(\{\s*supabase:/
    );
    expect(generateLib).toContain("getSupabaseServiceClient");
    expect(generateLib).toContain("insertGeneratingSnapshot");
    expect(generateLib).toContain("persistSnapshotView");
    expect(exportRoute).toContain("getSupabaseServiceClient");
    expect(exportRoute).not.toMatch(
      /loadOrganisationIntelligenceSnapshot\(\{\s*supabase:\s*auth\.context\.supabase/
    );
  });

  it("does not broaden Lead permissions onto private development tables", () => {
    const load = read("app/api/organisations/intelligence/route.ts");
    const generate = read(
      "app/api/organisations/intelligence/generate/route.ts"
    );
    expect(load).not.toMatch(/from\("development_updates"\)/);
    expect(load).not.toMatch(/from\("client_items"\)/);
    expect(load).not.toMatch(/from\("development_evidence"\)/);
    expect(generate).not.toMatch(/from\("development_updates"\)/);
    expect(generate).not.toMatch(/grant execute on function public\.aggregate_organisation_intelligence_sources/);
  });

  it("authorised Lead can load existing snapshots via the privileged path", async () => {
    requireOrganisationContext.mockResolvedValue(leadContext());
    const { GET } = await import("@/app/api/organisations/intelligence/route");
    const response = await GET(
      new Request("http://localhost/api/organisations/intelligence")
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.snapshot.id).toBe("snap-ready-1");
    expect(body.migrationRequired).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("contributorKey");
    expect(loadOrganisationIntelligenceSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        supabase: privilegedClient,
        organisationId: ORG_ID,
      })
    );
    expect(getSupabaseServiceClient).toHaveBeenCalled();
  });

  it("authorised Lead can initiate generation", async () => {
    requireOrganisationContext.mockResolvedValue(leadContext());
    const { POST } = await import(
      "@/app/api/organisations/intelligence/generate/route"
    );
    const response = await POST(
      new Request("http://localhost/api/organisations/intelligence/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period: "last_90_days" }),
      })
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.snapshot.id).toBe("snap-ready-1");
    expect(generateOrganisationIntelligence).toHaveBeenCalledWith(
      expect.objectContaining({
        organisationId: ORG_ID,
        userId: "lead-1",
      })
    );
    expect(generateOrganisationIntelligence.mock.calls[0]?.[0]).not.toHaveProperty(
      "supabase"
    );
  });

  it("unauthorised Manager cannot load or generate organisation intelligence", async () => {
    requireOrganisationContext.mockResolvedValue(managerContext());
    const { GET } = await import("@/app/api/organisations/intelligence/route");
    const getResponse = await GET(
      new Request("http://localhost/api/organisations/intelligence")
    );
    expect(getResponse.status).toBe(403);
    expect(loadOrganisationIntelligenceSnapshot).not.toHaveBeenCalled();
    expect(getSupabaseServiceClient).not.toHaveBeenCalled();

    const { POST } = await import(
      "@/app/api/organisations/intelligence/generate/route"
    );
    const postResponse = await POST(
      new Request("http://localhost/api/organisations/intelligence/generate", {
        method: "POST",
        body: "{}",
      })
    );
    expect(postResponse.status).toBe(403);
    expect(generateOrganisationIntelligence).not.toHaveBeenCalled();
  });

  it("empty organisation receives the generate state rather than a schema-cache migration error", async () => {
    requireOrganisationContext.mockResolvedValue(leadContext());
    loadOrganisationIntelligenceSnapshot.mockResolvedValue(null);
    listOrganisationIntelligenceSnapshots.mockResolvedValue([]);
    fetchOrganisationIntelligenceSources.mockResolvedValue({
      contributingRelationships: 0,
      conversations: 0,
    });

    const { GET } = await import("@/app/api/organisations/intelligence/route");
    const response = await GET(
      new Request("http://localhost/api/organisations/intelligence")
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.snapshot).toBeNull();
    expect(body.history).toEqual([]);
    expect(body.migrationRequired).toBeUndefined();
  });

  it("does not treat privileged-client schema-cache misses as a migration required empty state", async () => {
    requireOrganisationContext.mockResolvedValue(leadContext());
    loadOrganisationIntelligenceSnapshot.mockRejectedValue(
      new Error(
        "Could not find the table 'public.organisation_intelligence_snapshots' in the schema cache"
      )
    );

    const { GET } = await import("@/app/api/organisations/intelligence/route");
    const response = await GET(
      new Request("http://localhost/api/organisations/intelligence")
    );
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.migrationRequired).toBeUndefined();
    expect(body.snapshot).toBeUndefined();
  });

  it("keeps self-development excluded from People Development aggregation", () => {
    const rpc = read(
      "supabase/migrations/20260813120000_relationship_oi_self_development_boundary.sql"
    );
    const generateLib = read("lib/organisation-intelligence/generate.ts");
    const repository = read("lib/organisation-intelligence/repository.ts");
    expect(rpc).toContain("client_is_self_development");
    expect(rpc).toContain("selfDevelopmentExcluded");
    expect(generateLib).toContain("fetchOrganisationIntelligenceSources");
    expect(repository).toContain("sanitizeOrganisationIntelligenceAggregates");
  });
});
