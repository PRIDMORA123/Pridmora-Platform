import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  canManageSampleOrganisation,
  hasPermission,
} from "@/lib/organisations/permissions";
import {
  loadSamplePack,
  listRegisteredPackKeys,
  listInstallablePackKeys,
  isInstallableSamplePack,
  isLegacyCleanupSamplePack,
  getDefaultSamplePackKey,
  validateSamplePack,
  buildInstallPlan,
  SAMPLE_PROGRESS_STAGES,
  DEFAULT_SAMPLE_PACK_KEY,
  progressPercentForStage,
} from "@/lib/sample-organisations";
import { writeSampleOrganisationAudit } from "@/lib/sample-organisations/audit";
import { resolveProductLanguage } from "@/lib/role-language";

const root = process.cwd();

function read(pathFromRoot: string): string {
  return readFileSync(join(root, pathFromRoot), "utf8");
}

describe("sample organisation access", () => {
  it("allows owner and authorised administrator only", () => {
    expect(canManageSampleOrganisation("owner")).toBe(true);
    expect(canManageSampleOrganisation("administrator")).toBe(true);
    expect(hasPermission("owner", "sample_organisation.manage")).toBe(true);
    expect(hasPermission("administrator", "sample_organisation.manage")).toBe(
      true
    );
  });

  it("denies practitioner, oversight, viewer", () => {
    expect(canManageSampleOrganisation("practitioner")).toBe(false);
    expect(canManageSampleOrganisation("oversight")).toBe(false);
    expect(canManageSampleOrganisation("viewer")).toBe(false);
    expect(hasPermission("practitioner", "sample_organisation.manage")).toBe(
      false
    );
  });
});

describe("sample organisation pack", () => {
  it("offers only Averly for new installs while retaining Northbridge for cleanup", () => {
    expect(getDefaultSamplePackKey()).toBe("averly-services-group");
    expect(DEFAULT_SAMPLE_PACK_KEY).toBe("averly-services-group");
    expect(listInstallablePackKeys()).toEqual(["averly-services-group"]);
    expect(isInstallableSamplePack("averly-services-group")).toBe(true);
    expect(isInstallableSamplePack("northbridge-healthcare")).toBe(false);
    expect(isLegacyCleanupSamplePack("northbridge-healthcare")).toBe(true);
    expect(listRegisteredPackKeys()).toContain("averly-services-group");
    expect(listRegisteredPackKeys()).toContain("northbridge-healthcare");
  });

  it("validates the Averly pack with expected counts and manager-development language", () => {
    const result = loadSamplePack("averly-services-group");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { manifest, relationships, sessions, actions, developmentUpdates, intelligenceItems } =
      result.pack;

    expect(manifest.title).toBe("Averly Services Group");
    expect(manifest.summary).toContain("managers prepare for real management challenges");
    expect(manifest.features).toContain("Manager Development Demonstration");
    expect(manifest.features).toContain("12 managers");
    expect(manifest.expectedCounts.relationships).toBe(12);
    expect(manifest.expectedCounts.sessions).toBe(72);
    expect(manifest.expectedCounts.actions).toBe(72);
    expect(manifest.expectedCounts.developmentUpdates).toBe(24);
    expect(manifest.expectedCounts.intelligenceItems).toBe(72);
    expect(manifest.expectedCounts.confidentialRelationships).toBe(2);

    expect(relationships).toHaveLength(12);
    expect(sessions).toHaveLength(72);
    expect(actions).toHaveLength(72);
    expect(developmentUpdates).toHaveLength(24);
    expect(intelligenceItems).toHaveLength(72);

    const confidential = relationships.filter(r => r.identityMode === "confidential");
    expect(confidential).toHaveLength(2);
    expect(confidential.map(r => r.key).sort()).toEqual([
      "manager-b",
      "senior-leader-a",
    ]);
    for (const rel of confidential) {
      expect(rel.email).toBe("");
      expect(rel.aiNameAllowed).toBe(false);
      expect(rel.displayLabel.trim().length).toBeGreaterThan(0);
    }

    for (const theme of manifest.recurringThemes) {
      const count = relationships.filter(r => r.themes.includes(theme)).length;
      expect(count).toBeGreaterThanOrEqual(manifest.privacy.minimumThemeRelationships);
    }

    const sessionBlob = JSON.stringify(sessions).toLowerCase();
    expect(sessionBlob).not.toContain("coachee");
    expect(sessionBlob).not.toContain("becoming a coach");
    expect(sessionBlob).not.toContain("becoming coaches");
    expect(sessionBlob).toMatch(/development conversation|management conversation|one-to-one|performance conversation|feedback conversation|development review/);

    for (const session of sessions) {
      expect(session.aiSummaryApproved).toBe(true);
      const words = String(session.summary || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean).length;
      expect(words).toBeGreaterThanOrEqual(150);
      expect(words).toBeLessThanOrEqual(230);
      expect(String(session.emergingThemes || "").trim().length).toBeGreaterThan(40);
      expect(String(session.strengthsObserved || "").trim().length).toBeGreaterThan(20);
      expect(
        String(session.valuesBecomingVisible || "").trim().length
      ).toBeGreaterThan(20);
      expect(
        String(session.professionalIdentityDevelopment || "").trim().length
      ).toBeGreaterThan(20);
    }

    for (const update of developmentUpdates) {
      expect(update.status).toBe("applied");
      const changes = update.proposedChanges as {
        emergingThemes?: { add?: unknown[]; update?: unknown[] };
        growthAreas?: { add?: unknown[]; update?: unknown[] };
        strengths?: { add?: unknown[]; update?: unknown[] };
        currentFocus?: { value?: string };
      };
      const themeCount =
        (changes.emergingThemes?.add?.length || 0) +
        (changes.emergingThemes?.update?.length || 0);
      const growthCount =
        (changes.growthAreas?.add?.length || 0) +
        (changes.growthAreas?.update?.length || 0);
      const strengthCount =
        (changes.strengths?.add?.length || 0) +
        (changes.strengths?.update?.length || 0);
      expect(themeCount).toBeGreaterThan(0);
      expect(growthCount).toBeGreaterThan(0);
      expect(strengthCount).toBeGreaterThan(0);
      if (changes.currentFocus !== undefined) {
        expect(String(changes.currentFocus.value ?? "").trim().length).toBeGreaterThan(0);
      }
    }

    const plan = buildInstallPlan(result.pack);
    expect(plan.steps.some(step => step.type === "organisation_intelligence")).toBe(
      true
    );
  });

  it("keeps legacy Northbridge pack loadable for cleanup compatibility", () => {
    const result = loadSamplePack("northbridge-healthcare");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pack.manifest.title).toBe("Northbridge Healthcare Trust");
    expect(result.pack.relationships).toHaveLength(12);
    expect(result.pack.sessions).toHaveLength(72);
    expect(existsSync(join(root, "sample-data/northbridge-healthcare/manifest.json"))).toBe(
      true
    );
    expect(
      existsSync(
        join(root, "app/api/sample-organisations/northbridge-healthcare/install/route.ts")
      )
    ).toBe(true);
  });

  it("rejects new Northbridge installs while allowing pack load for remove/reset", () => {
    const install = read("lib/sample-organisations/install.ts");
    expect(install).toContain("isInstallableSamplePack");
    expect(install).toContain("PACK_NOT_AVAILABLE");
    expect(install).toContain(
      "This sample organisation is no longer available for new installations."
    );
    expect(install).toContain('professional_role: "manager"');
    expect(install).toContain("averly-services-group");
  });

  it("applies development updates into profiles during seed", () => {
    const seed = read("lib/sample-organisations/seed-content.ts");
    expect(seed).toContain('apply_development_update');
    expect(seed).toContain('shouldApply ? "ready_for_review"');
    expect(seed).toContain("Unable to apply sample development update.");
  });

  it("does not regenerate conversation intelligence during sample install", () => {
    const seed = read("lib/sample-organisations/seed-content.ts");
    const install = read("lib/sample-organisations/install.ts");
    expect(seed).not.toContain("DRAFT_SUMMARY_INSTRUCTIONS");
    expect(seed).not.toContain("openai.responses.create");
    expect(seed).toContain("summary: session.summary");
    expect(seed).toContain("apply_development_update");
    expect(install).not.toContain("DRAFT_SUMMARY_INSTRUCTIONS");
    expect(install).not.toContain("rebuild-northbridge-production-pack");
  });

  it("rejects packs with private email on confidential relationships", () => {
    const loaded = loadSamplePack("averly-services-group");
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const broken = {
      ...loaded.pack,
      relationships: loaded.pack.relationships.map(rel =>
        rel.key === "senior-leader-a"
          ? { ...rel, email: "secret@example.com" }
          : rel
      ),
    };

    const result = validateSamplePack({
      manifest: broken.manifest,
      organisation: broken.organisation,
      relationships: { relationships: broken.relationships },
      assignments: { assignments: broken.assignments },
      sessions: { sessions: broken.sessions },
      actions: { actions: broken.actions },
      developmentUpdates: { developmentUpdates: broken.developmentUpdates },
      intelligenceItems: { intelligenceItems: broken.intelligenceItems },
    });

    expect(result.ok).toBe(false);
  });

  it("does not hard-code the dataset inside API routes", () => {
    const installRoute = read(
      "app/api/sample-organisations/averly-services-group/install/route.ts"
    );
    expect(installRoute).not.toContain("Sophie Bennett");
    expect(installRoute).not.toContain("Customer Service Team Manager");
    expect(existsSync(join(root, "sample-data/averly-services-group/manifest.json"))).toBe(
      true
    );
  });

  it("keeps manager and coach product language role-aware", () => {
    const manager = resolveProductLanguage("manager");
    const coach = resolveProductLanguage("coach");
    expect(manager.peopleNavLabel).toBe("People");
    expect(manager.myPeopleLabel).toBe("My People");
    expect(manager.conversationSingular).toBe("development conversation");
    expect(manager.intelligenceTitle.toLowerCase()).toContain("development intelligence");
    expect(manager.homeTitle).toMatch(/Management/i);
    expect(coach.peopleISupport).toBe("Clients");
    expect(coach.overviewTitle).toMatch(/Coaching/i);
    expect(coach.notesLabel).toBe("Coach notes");
  });
});

describe("sample organisation progress", () => {
  it("reports stage progress from server stages not timers", () => {
    expect(SAMPLE_PROGRESS_STAGES[0]).toBe("validating");
    expect(progressPercentForStage("ready", "ready")).toBe(100);
    expect(progressPercentForStage("creating_relationships", "installing")).toBeGreaterThan(
      0
    );
    expect(progressPercentForStage("creating_relationships", "installing")).toBeLessThan(
      100
    );
  });
});

describe("sample organisation migration", () => {
  it("ships an additive migration with RLS and safe cleanup", () => {
    const path =
      "supabase/migrations/20260804180000_sample_organisation_installer.sql";
    expect(existsSync(join(root, path))).toBe(true);
    const sql = read(path);

    expect(sql).toContain("sample_organisation_installations");
    expect(sql).toContain("sample_organisation_records");
    expect(sql).toContain("sample_organisation.manage");
    expect(sql).toContain("begin_sample_organisation_installation");
    expect(sql).toContain("cleanup_sample_organisation_installation");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("set search_path = public");
    expect(sql).toContain("sample_organisation_installations_active_pack_uidx");
    expect(sql).not.toMatch(/\bdrop table\b/i);
    expect(sql).not.toMatch(/truncate\b/i);
    expect(sql).not.toContain("service_role_key");

    const cleanupSoftening = read(
      "supabase/migrations-held-out/20260804190000_sample_organisation_cleanup_optional_intelligence.sql"
    );
    expect(cleanupSoftening).toContain("cleanup_sample_organisation_installation");
    expect(cleanupSoftening).toContain("to_regclass");
    expect(cleanupSoftening).toContain("organisation_intelligence_snapshots");
    expect(cleanupSoftening).not.toMatch(/\bdrop table\b/i);
  });

  it("ships additive migration for Averly manager membership role", () => {
    const path =
      "supabase/migrations/20260807120000_averly_sample_manager_role.sql";
    expect(existsSync(join(root, path))).toBe(true);
    const sql = read(path);
    expect(sql).toContain("begin_sample_organisation_installation");
    expect(sql).toContain("averly-services-group");
    expect(sql).toContain("v_professional_role");
    expect(sql).toContain("'manager'");
    expect(sql).not.toMatch(/\bdrop table\b/i);
  });

  it("extends permission helper without weakening coaching content rules", () => {
    const sql = read(
      "supabase/migrations/20260804180000_sample_organisation_installer.sql"
    );
    expect(sql).toContain(
      "p_permission = 'sample_organisation.manage' and m.role in ('owner', 'administrator')"
    );
    expect(sql).toContain(
      "p_permission = 'coaching_content.view' and m.role in ('practitioner', 'owner', 'administrator')"
    );
  });
});


describe("sample organisation API access contracts", () => {
  it("gates install routes with sample_organisation.manage", () => {
    const install = read(
      "app/api/sample-organisations/averly-services-group/install/route.ts"
    );
    expect(install).toContain("requireSampleOrganisationManage");
    expect(install).toContain("sourceOrganisationId: auth.context.organisation.organisationId");
    expect(install).not.toMatch(/body\.organisationId/);
  });

  it("requires typed REMOVE confirmation on delete", () => {
    const remove = read(
      "app/api/sample-organisations/installations/[id]/route.ts"
    );
    expect(remove).toContain("confirmation");
    expect(remove).toContain("removeSampleOrganisation");
  });
});

describe("sample organisation audit safety", () => {
  it("audit helper only accepts safe metadata fields", () => {
    const source = read("lib/sample-organisations/audit.ts");
    expect(source).toContain("installationId");
    expect(source).toContain("packKey");
    expect(source).toContain("packVersion");
    expect(source).toContain("Safe audit metadata only");
    expect(source).not.toMatch(/\bprivateNotes\b|\bprivate_notes\b|\bemailAddress\b/);
    expect(typeof writeSampleOrganisationAudit).toBe("function");
  });
});

describe("sample organisation UI copy", () => {
  it("uses Averly Manager Development language and confirmation copy", () => {
    const page = read(
      "components/sample-organisation/sample-organisation-page.tsx"
    );
    expect(page).toContain("SAMPLE ORGANISATION");
    expect(page).toContain("Averly Services Group");
    expect(page).toContain("Manager Development Demonstration");
    expect(page).toContain("DEFAULT_SAMPLE_PACK_KEY");
    expect(page).toContain("SAMPLE_ORGANISATION_SETUP_ESTIMATE");
    expect(page).toContain("Install sample organisation?");
    expect(page).toContain("Reset sample organisation?");
    expect(page).toContain("Remove sample organisation?");
    expect(page).toContain("Type REMOVE to confirm");
    expect(page).toContain("Previous sample organisation");
    expect(page).toContain("will not convert to Averly");
    expect(page).not.toMatch(/demo data|fake data|dummy data|seed data/i);
    expect(page).not.toContain("Around 30 seconds");
    // Northbridge must not be the install title; legacy cleanup may still name it.
    expect(page).not.toContain('title="Northbridge Healthcare Trust"');

    const types = read("lib/sample-organisations/types.ts");
    expect(types).toContain('SAMPLE_ORGANISATION_SETUP_ESTIMATE = "Around one minute"');
    expect(types).toContain('DEFAULT_SAMPLE_PACK_KEY: SamplePackKey = "averly-services-group"');
  });

  it("shows sample nav only for authorised roles", () => {
    const nav = read("components/organisation/organisation-navigation.tsx");
    expect(nav).toContain("useCanManageSampleOrganisation");
    expect(nav).toContain("/settings/sample-organisation");

    const hook = read(
      "lib/organisations/use-can-manage-sample-organisation.ts"
    );
    expect(hook).toContain("canManageSampleOrganisation");
    expect(hook).toContain("/api/organisations/current");

    const shell = read("components/app-shell.tsx");
    expect(shell).toContain("useCanManageSampleOrganisation");
    expect(shell).toContain("/settings/sample-organisation");

    const settings = read("components/settings-view.tsx");
    expect(settings).toContain("useCanManageSampleOrganisation");
    expect(settings).toContain("/settings/sample-organisation");
  });
});

describe("sample organisation privacy regression contracts", () => {
  it("creates confidential relationships through existing RPC path", () => {
    const seed = read("lib/sample-organisations/seed-content.ts");
    expect(seed).toContain("createRelationshipAtomicInDb");
    expect(seed).toContain('identityMode: rel.identityMode');
    expect(seed).toContain("aiNameAllowed: rel.identityMode === \"confidential\" ? false");
  });

  it("does not bypass Organisation Intelligence privacy threshold", () => {
    const bridge = read("lib/sample-organisations/organisation-intelligence.ts");
    expect(bridge).toContain("generateSampleOrganisationIntelligenceSnapshot");
    expect(bridge).toContain(
      "SAMPLE_ORGANISATION_INTELLIGENCE_GENERATION_AVAILABLE = false"
    );
    expect(bridge).toContain(
      "isSampleOrganisationIntelligenceGenerationAvailable"
    );
    expect(bridge).not.toMatch(
      /from ["']@\/lib\/organisation-intelligence/
    );

    const install = read("lib/sample-organisations/install.ts");
    expect(install).toContain("generateSampleOrganisationIntelligenceSnapshot");
    expect(install).toContain("intelligence_pending");
    expect(install).not.toMatch(
      /from ["']@\/lib\/organisation-intelligence/
    );

    const reseed = read("lib/sample-organisations/reseed.ts");
    expect(reseed).toContain("generateSampleOrganisationIntelligenceSnapshot");
    expect(reseed).not.toMatch(
      /from ["']@\/lib\/organisation-intelligence/
    );
  });

  it("shows pending intelligence as ready without a failing Retry control", () => {
    const page = read(
      "components/sample-organisation/sample-organisation-page.tsx"
    );
    expect(page).toContain("Sample organisation ready");
    expect(page).toContain("Not yet available");
    expect(page).toContain(
      "Organisation Intelligence will become available when the organisation"
    );
    expect(page).toContain("canRetryIntelligence");
    expect(page).toContain("Open sample organisation");
    expect(page).toContain("Reset sample organisation");
    expect(page).toContain("Remove sample organisation");
    expect(page).not.toContain("Organisation Intelligence ready");
    expect(page).not.toContain("View Organisation Intelligence");
    expect(page).not.toContain("Executive brief ready");
    // intelligence_pending must not be treated as a failed/not-ready banner.
    expect(page).toContain('installation?.status === "failed"');
    expect(page).toContain("statusError");
    expect(page).toContain("displayError");

    const status = read("lib/sample-organisations/status.ts");
    expect(status).toContain(
      "isSampleOrganisationIntelligenceGenerationAvailable"
    );
    expect(status).toContain("canRetryIntelligence:");
  });

  it("allows opening sample organisations that are ready or intelligence_pending", () => {
    const open = read("lib/sample-organisations/reset-remove.ts");
    expect(open).toContain("openSampleOrganisation");
    expect(open).toContain('installation.status !== "ready"');
    expect(open).toContain('installation.status !== "intelligence_pending"');
    expect(open).toContain("Sample organisation is not ready.");
    expect(open).toContain("NOT_READY");
  });
});
