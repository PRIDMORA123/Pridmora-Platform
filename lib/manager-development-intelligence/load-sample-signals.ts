/**
 * Sample-organisation-only Manager Development Intelligence signals.
 *
 * Hard-gated to the CURRENT organisation's Averly installation record.
 * Does not change live MDI loading, the privacy threshold, or Lead payload shape.
 * Contributor identities stay internal and are stripped by aggregation.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { PSYCHOMETRIC_EVIDENCE_TYPES } from "@/lib/development-evidence/constants";
import {
  deriveCanonicalThemeFromCapabilityKey,
  isKnownManagerDevelopmentThemeKey,
  type ManagerDevelopmentDerivedSignal,
} from "@/lib/manager-development-intelligence/derive-theme";
import { loadSamplePack } from "@/lib/sample-organisations/registry";
import { DEFAULT_SAMPLE_PACK_KEY } from "@/lib/sample-organisations/types";

const SAMPLE_MDI_INSTALLATION_STATUSES = [
  "ready",
  "intelligence_pending",
] as const;

const EXCLUDED_EVIDENCE_TYPES = new Set<string>([
  ...PSYCHOMETRIC_EVIDENCE_TYPES,
  "personal_reflection",
  "reflection",
]);

export const SAMPLE_MANAGER_DEVELOPMENT_PACK_KEY = DEFAULT_SAMPLE_PACK_KEY;

type SampleInstallationGate = {
  id: string;
  packKey: string;
};

type SampleRelationshipRecord = {
  recordId: string;
  packEntityKey: string;
};

/**
 * Returns sample-derived signals when the current organisation is an installed
 * Averly sample. Returns null for every other organisation so the live pipeline
 * stays unchanged.
 */
export async function loadSampleManagerDevelopmentSignals(input: {
  supabase: SupabaseClient;
  organisationId: string;
}): Promise<{
  activeManagerPopulation: number;
  signals: ManagerDevelopmentDerivedSignal[];
} | null> {
  const organisationId = input.organisationId.trim();
  if (!organisationId) return null;

  const installation = await loadCurrentAverlySampleInstallation(
    input.supabase,
    organisationId
  );
  if (!installation) return null;

  const relationships = await loadMappedSampleRelationships({
    supabase: input.supabase,
    organisationId,
    installationId: installation.id,
  });

  const themeByPackKey = loadPackCatalogueThemes(installation.packKey);
  const signals: ManagerDevelopmentDerivedSignal[] = [];
  const seen = new Set<string>();

  for (const relationship of relationships) {
    const themes = themeByPackKey.get(relationship.packEntityKey) ?? [];
    for (const themeKey of themes) {
      if (!isKnownManagerDevelopmentThemeKey(themeKey)) continue;
      const dedupe = `${relationship.recordId}:${themeKey}:focus`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      signals.push({
        themeKey,
        managerUserId: relationship.recordId,
        modality: "focus",
      });
    }
  }

  const evidenceSignals = await loadSampleEvidenceCapabilitySignals({
    supabase: input.supabase,
    organisationId,
    relationships,
  });

  for (const signal of evidenceSignals) {
    const dedupe = `${signal.managerUserId}:${signal.themeKey}:${signal.modality}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    signals.push(signal);
  }

  return {
    activeManagerPopulation: relationships.length,
    signals,
  };
}

async function loadCurrentAverlySampleInstallation(
  supabase: SupabaseClient,
  organisationId: string
): Promise<SampleInstallationGate | null> {
  const { data, error } = await supabase
    .from("sample_organisation_installations")
    .select("id, pack_key, status, organisation_id")
    .eq("organisation_id", organisationId)
    .eq("pack_key", SAMPLE_MANAGER_DEVELOPMENT_PACK_KEY)
    .in("status", [...SAMPLE_MDI_INSTALLATION_STATUSES])
    .maybeSingle();

  if (error || !data) return null;

  const id = String(data.id ?? "").trim();
  const packKey = String(data.pack_key ?? "").trim();
  const rowOrganisationId = String(data.organisation_id ?? "").trim();
  if (
    !id ||
    packKey !== SAMPLE_MANAGER_DEVELOPMENT_PACK_KEY ||
    rowOrganisationId !== organisationId
  ) {
    return null;
  }

  return { id, packKey };
}

async function loadMappedSampleRelationships(input: {
  supabase: SupabaseClient;
  organisationId: string;
  installationId: string;
}): Promise<SampleRelationshipRecord[]> {
  const { data, error } = await input.supabase
    .from("sample_organisation_records")
    .select("record_id, pack_entity_key, organisation_id, record_type")
    .eq("installation_id", input.installationId)
    .eq("organisation_id", input.organisationId)
    .eq("record_type", "relationship");

  if (error || !data) return [];

  const mapped: SampleRelationshipRecord[] = [];
  const seen = new Set<string>();
  for (const row of data) {
    const recordId = String(row.record_id ?? "").trim();
    const packEntityKey = String(row.pack_entity_key ?? "").trim();
    if (!recordId || !packEntityKey) continue;
    if (seen.has(recordId)) continue;
    seen.add(recordId);
    mapped.push({ recordId, packEntityKey });
  }
  return mapped;
}

function loadPackCatalogueThemes(packKey: string): Map<string, string[]> {
  const loaded = loadSamplePack(packKey);
  const themesByKey = new Map<string, string[]>();
  if (!loaded.ok) return themesByKey;

  for (const relationship of loaded.pack.relationships) {
    const key = relationship.key.trim();
    if (!key) continue;
    const themes = relationship.themes
      .map(theme => theme.trim())
      .filter(theme => isKnownManagerDevelopmentThemeKey(theme));
    themesByKey.set(key, themes);
  }
  return themesByKey;
}

async function loadSampleEvidenceCapabilitySignals(input: {
  supabase: SupabaseClient;
  organisationId: string;
  relationships: SampleRelationshipRecord[];
}): Promise<ManagerDevelopmentDerivedSignal[]> {
  if (input.relationships.length === 0) return [];

  const clientIds = input.relationships.map(row => row.recordId);
  const allowedClients = new Set(clientIds);

  const { data, error } = await input.supabase
    .from("development_evidence")
    .select(
      "id, client_id, evidence_type, review_status, include_in_intelligence, deleted_at, capability_keys, restricted, processing_status"
    )
    .eq("organisation_id", input.organisationId)
    .in("client_id", clientIds)
    .is("deleted_at", null)
    .eq("include_in_intelligence", true)
    .eq("restricted", false)
    .eq("processing_status", "ready")
    .in("review_status", ["approved", "edited", "internal_reference"]);

  if (error || !data) return [];

  const signals: ManagerDevelopmentDerivedSignal[] = [];
  const seen = new Set<string>();

  for (const row of data) {
    const evidenceType = String(row.evidence_type ?? "");
    if (EXCLUDED_EVIDENCE_TYPES.has(evidenceType)) continue;

    const clientId = String(row.client_id ?? "").trim();
    if (!allowedClients.has(clientId)) continue;

    const keys = Array.isArray(row.capability_keys)
      ? row.capability_keys
      : [];
    for (const rawKey of keys) {
      if (typeof rawKey !== "string") continue;
      const themeKey = deriveCanonicalThemeFromCapabilityKey(rawKey);
      if (!themeKey) continue;
      const dedupe = `${clientId}:${themeKey}:evidence_capability`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      signals.push({
        themeKey,
        managerUserId: clientId,
        modality: "evidence_capability",
      });
    }
  }

  return signals;
}
