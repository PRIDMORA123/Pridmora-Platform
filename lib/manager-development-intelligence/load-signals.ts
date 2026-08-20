/**
 * Load privacy-eligible Manager development signals for organisation aggregation.
 * Uses a privileged server client after caller has authorised the request.
 * Never returns raw focus/evidence text to callers of the Lead API.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { PSYCHOMETRIC_EVIDENCE_TYPES } from "@/lib/development-evidence/constants";
import { isSelfDevelopmentClientRow } from "@/lib/my-development/self-development-identity";
import {
  deriveCanonicalThemeFromCapabilityKey,
  deriveCanonicalThemeFromFocusTitle,
  type ManagerDevelopmentDerivedSignal,
} from "@/lib/manager-development-intelligence/derive-theme";

const EXCLUDED_EVIDENCE_TYPES = new Set<string>([
  ...PSYCHOMETRIC_EVIDENCE_TYPES,
  "personal_reflection",
  "reflection",
]);

export type EligibleManagerRow = {
  userId: string;
  selfDevelopmentClientId: string;
};

/**
 * Active Managers in the organisation (membership + professional_role).
 */
export async function listActiveManagerUserIds(
  supabase: SupabaseClient,
  organisationId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from("organisation_memberships")
    .select("user_id, professional_role, status")
    .eq("organisation_id", organisationId)
    .eq("status", "active")
    .eq("professional_role", "manager");

  if (error || !data) return [];
  return [
    ...new Set(
      data
        .map(row => String(row.user_id ?? "").trim())
        .filter(Boolean)
    ),
  ];
}

/**
 * Map eligible Managers to their self-development client rows.
 */
export async function listEligibleManagerSelfDevelopmentClients(
  supabase: SupabaseClient,
  organisationId: string,
  managerUserIds: readonly string[]
): Promise<EligibleManagerRow[]> {
  if (managerUserIds.length === 0) return [];

  const withFlag = await supabase
    .from("clients")
    .select("id, coach_id, role, is_self_development, archived_at")
    .eq("organisation_id", organisationId)
    .in("coach_id", [...managerUserIds])
    .is("archived_at", null);

  type ClientRow = {
    id: string;
    coach_id: string | null;
    role: string | null;
    is_self_development?: boolean | null;
    archived_at?: string | null;
  };

  let rows: ClientRow[] = (withFlag.data as ClientRow[] | null) ?? [];
  if (
    withFlag.error &&
    /is_self_development|schema cache|could not find/i.test(withFlag.error.message)
  ) {
    const fallback = await supabase
      .from("clients")
      .select("id, coach_id, role, archived_at")
      .eq("organisation_id", organisationId)
      .in("coach_id", [...managerUserIds])
      .eq("role", "Self development")
      .is("archived_at", null);
    rows = (fallback.data as ClientRow[] | null) ?? [];
  } else if (withFlag.error) {
    return [];
  }

  const eligible: EligibleManagerRow[] = [];
  for (const row of rows) {
    if (
      !isSelfDevelopmentClientRow({
        is_self_development: row.is_self_development ?? null,
        role: row.role,
      })
    ) {
      continue;
    }
    const userId = String(row.coach_id ?? "").trim();
    const clientId = String(row.id ?? "").trim();
    if (!userId || !clientId) continue;
    if (!managerUserIds.includes(userId)) continue;
    eligible.push({ userId, selfDevelopmentClientId: clientId });
  }
  return eligible;
}

async function loadFocusSignals(input: {
  supabase: SupabaseClient;
  organisationId: string;
  managers: EligibleManagerRow[];
}): Promise<ManagerDevelopmentDerivedSignal[]> {
  if (input.managers.length === 0) return [];
  const clientIds = input.managers.map(m => m.selfDevelopmentClientId);
  const managerByClient = new Map(
    input.managers.map(m => [m.selfDevelopmentClientId, m.userId] as const)
  );

  const { data, error } = await input.supabase
    .from("client_items")
    .select("id, client_id, title, item_type")
    .eq("organisation_id", input.organisationId)
    .eq("item_type", "theme")
    .in("client_id", clientIds);

  if (error || !data) return [];

  const signals: ManagerDevelopmentDerivedSignal[] = [];
  const seen = new Set<string>();

  for (const row of data) {
    const clientId = String(row.client_id ?? "");
    const managerUserId = managerByClient.get(clientId);
    if (!managerUserId) continue;
    const themeKey = deriveCanonicalThemeFromFocusTitle(
      typeof row.title === "string" ? row.title : ""
    );
    if (!themeKey) continue;
    const dedupe = `${managerUserId}:${themeKey}:focus`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    signals.push({
      themeKey,
      managerUserId,
      modality: "focus",
    });
  }

  return signals;
}

async function loadEvidenceCapabilitySignals(input: {
  supabase: SupabaseClient;
  organisationId: string;
  managers: EligibleManagerRow[];
}): Promise<ManagerDevelopmentDerivedSignal[]> {
  if (input.managers.length === 0) return [];
  const clientIds = input.managers.map(m => m.selfDevelopmentClientId);
  const managerByClient = new Map(
    input.managers.map(m => [m.selfDevelopmentClientId, m.userId] as const)
  );

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

    const clientId = String(row.client_id ?? "");
    const managerUserId = managerByClient.get(clientId);
    if (!managerUserId) continue;

    const keys = Array.isArray(row.capability_keys)
      ? row.capability_keys
      : [];
    for (const rawKey of keys) {
      if (typeof rawKey !== "string") continue;
      const themeKey = deriveCanonicalThemeFromCapabilityKey(rawKey);
      if (!themeKey) continue;
      const dedupe = `${managerUserId}:${themeKey}:evidence_capability`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      signals.push({
        themeKey,
        managerUserId,
        modality: "evidence_capability",
      });
    }
  }

  return signals;
}

export async function loadManagerDevelopmentDerivedSignals(input: {
  supabase: SupabaseClient;
  organisationId: string;
  includeEvidenceCapabilities?: boolean;
}): Promise<{
  activeManagerPopulation: number;
  signals: ManagerDevelopmentDerivedSignal[];
}> {
  const managerUserIds = await listActiveManagerUserIds(
    input.supabase,
    input.organisationId
  );
  const managers = await listEligibleManagerSelfDevelopmentClients(
    input.supabase,
    input.organisationId,
    managerUserIds
  );

  const focusSignals = await loadFocusSignals({
    supabase: input.supabase,
    organisationId: input.organisationId,
    managers,
  });

  const evidenceSignals =
    input.includeEvidenceCapabilities === false
      ? []
      : await loadEvidenceCapabilitySignals({
          supabase: input.supabase,
          organisationId: input.organisationId,
          managers,
        });

  return {
    activeManagerPopulation: managerUserIds.length,
    signals: [...focusSignals, ...evidenceSignals],
  };
}
