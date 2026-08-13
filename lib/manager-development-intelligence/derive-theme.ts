/**
 * Privacy-safe canonical theme derivation for Manager Development Intelligence.
 * Never returns raw Manager wording — only known catalogue keys or null.
 */

import { KNOWN_THEME_CATALOGUE } from "@/lib/organisation-intelligence/constants";
import { isRestrictedSensitiveTheme } from "@/lib/organisation-intelligence/suppression";
import { normaliseThemeKey } from "@/lib/organisation-intelligence/themes";
import type { PridmoraCapabilityKey } from "@/lib/development-evidence/capabilities";
import { isPridmoraCapabilityKey } from "@/lib/development-evidence/capabilities";

/** Explicit capability → catalogue theme mapping (unambiguous only). */
const CAPABILITY_TO_THEME: Partial<Record<PridmoraCapabilityKey, string>> = {
  delegation: "delegation",
  accountability: "accountability",
  ownership: "accountability",
  psychological_safety: "psychological_safety",
  feedback_difficult_conversations: "difficult_conversations",
  collaboration: "collaboration",
  listening_presence: "presence",
  leadership_presence: "presence",
  developing_others: "delegation",
  coaching_behaviours: "presence",
};

const THEME_LABEL_BY_KEY = new Map(
  KNOWN_THEME_CATALOGUE.map(entry => [entry.key, entry.label] as const)
);

export function isKnownManagerDevelopmentThemeKey(key: string): boolean {
  return THEME_LABEL_BY_KEY.has(key);
}

export function managerDevelopmentThemeLabel(themeKey: string): string | null {
  return THEME_LABEL_BY_KEY.get(themeKey) ?? null;
}

/**
 * Map private free-text focus to a canonical theme key.
 * Sensitive or unmapped text → null (dropped). Never returns raw title.
 */
export function deriveCanonicalThemeFromFocusTitle(
  focusTitle: string
): string | null {
  const raw = focusTitle.trim();
  if (!raw || raw.length < 3) return null;
  if (isRestrictedSensitiveTheme(raw)) return null;

  const normalised = normaliseThemeKey(raw);
  if (normalised.restricted || !normalised.known) return null;
  if (!isKnownManagerDevelopmentThemeKey(normalised.key)) return null;
  return normalised.key;
}

/**
 * Map a validated capability key to a catalogue theme key.
 * Unknown / unmapped capabilities → null.
 */
export function deriveCanonicalThemeFromCapabilityKey(
  capabilityKey: string
): string | null {
  const key = capabilityKey.trim();
  if (!key || !isPridmoraCapabilityKey(key)) return null;
  const themeKey = CAPABILITY_TO_THEME[key];
  if (!themeKey || !isKnownManagerDevelopmentThemeKey(themeKey)) return null;
  return themeKey;
}

export type ManagerDevelopmentSignalModality = "focus" | "evidence_capability";

export type ManagerDevelopmentDerivedSignal = {
  themeKey: string;
  /** Internal only — never returned to Lead API. */
  managerUserId: string;
  modality: ManagerDevelopmentSignalModality;
};
