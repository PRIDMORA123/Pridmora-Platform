/**
 * Gate 3.2B — Map living authorised Development Intelligence to org-safe theme keys.
 * Never emits free-text narrative. Unmapped capabilities → null (person-level only).
 */

import { deriveCanonicalThemeFromCapabilityKey } from "@/lib/manager-development-intelligence/derive-theme";
import { deriveCanonicalThemeFromFocusTitle } from "@/lib/manager-development-intelligence/derive-theme";
import type { ThemeCandidate } from "@/lib/organisation-intelligence/types";

export type AuthorisedCapabilityCandidate = {
  capabilityKey: string;
  contributorKey: string;
  sourceType: string;
  occurredAt?: string | null;
};

export type LivingThemeSourceFamily =
  | "development_evidence"
  | "development_evidence_observation"
  | "legacy_intelligence_item"
  | "client_item_theme";

/**
 * Map authorised capability-key rows to catalogue theme candidates.
 * Drops unmapped / invalid capabilities. Preserves opaque contributor keys.
 */
export function mapAuthorisedCapabilitiesToThemeCandidates(
  rows: AuthorisedCapabilityCandidate[]
): ThemeCandidate[] {
  const out: ThemeCandidate[] = [];
  for (const row of rows) {
    const themeKey = deriveCanonicalThemeFromCapabilityKey(row.capabilityKey);
    if (!themeKey) continue;
    out.push({
      themeKey,
      relationshipId: row.contributorKey,
      sourceType: row.sourceType || "development_evidence",
      occurredAt: row.occurredAt ?? null,
      category: null,
    });
  }
  return out;
}

/**
 * Keep only candidates whose free-text / key maps to a known catalogue theme.
 * Used for legacy intelligence_items titles and client_items theme titles.
 * Unmapped → no organisational signal.
 */
export function filterToKnownCatalogueThemeCandidates(
  candidates: ThemeCandidate[]
): ThemeCandidate[] {
  const out: ThemeCandidate[] = [];
  for (const candidate of candidates) {
    const mapped = deriveCanonicalThemeFromFocusTitle(candidate.themeKey);
    if (!mapped) continue;
    out.push({
      ...candidate,
      themeKey: mapped,
    });
  }
  return out;
}

/**
 * Evidence posture from distinct living source families on a theme bucket.
 * emerging = one modality family; developing = two or more.
 */
export function evidencePostureFromSourceTypes(
  sourceTypes: Iterable<string>
): "emerging" | "developing" | "observed" {
  const families = new Set<string>();
  for (const raw of sourceTypes) {
    const type = raw.toLowerCase();
    if (
      type.includes("development_evidence") ||
      type === "authorised_evidence"
    ) {
      families.add("authorised_evidence");
    } else if (type.includes("observation")) {
      families.add("authorised_evidence");
    } else if (type.includes("intelligence") || type.includes("legacy")) {
      families.add("legacy_intelligence_item");
    } else if (type.includes("client_item") || type.includes("theme")) {
      families.add("client_item_theme");
    } else {
      families.add(type || "unknown");
    }
  }
  if (families.size >= 2) return "developing";
  if (families.size === 1) return "emerging";
  return "observed";
}
