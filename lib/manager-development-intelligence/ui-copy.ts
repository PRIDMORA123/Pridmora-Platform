/**
 * Stage 3.2 — Lead-facing copy for Manager Development Intelligence.
 * Catalogue/generic text only. Never derived from private Manager content.
 */

import type { ManagerDevelopmentPatternStrength } from "@/lib/manager-development-intelligence/constants";

export const LEAD_PRIVACY_BOUNDARY_COPY =
  "Pridmora shows organisation-level Manager development patterns only when at least five Managers contribute similar themes. Individual Manager development records, reflections and Aurelia conversations remain private to the Manager. Leads cannot identify or target the individuals behind a theme.";

export const LEAD_LENS_SEPARATION_COPY =
  "This view is about Manager development — what Managers are collectively working on in their own development. It is separate from People Development Intelligence, which looks at patterns emerging through developmental work with people.";

export const LEAD_OVERVIEW_LENS_NOTE =
  "Manager Development shows privacy-safe patterns from Managers’ own development. People Development Intelligence is a separate lens based on work with people.";

/** Coverage, prevalence and absence — used once in “About this picture”. */
export const LEAD_MANAGER_DI_INTERPRETATION_COPY =
  "These themes reflect contributing authorised evidence and should not be interpreted as a census of every licensed Manager. Pattern strength describes how clearly a theme appears in the available evidence; it is not a performance or competence measure. Absence of a theme does not prove that no development need exists — evidence may be insufficient, or the privacy threshold may not yet be met.";

export const STRENGTH_EXPLANATIONS: Record<
  ManagerDevelopmentPatternStrength,
  string
> = {
  emerging:
    "A privacy-safe pattern is visible, but the evidence is still developing.",
  developing:
    "The pattern is supported by more than one type of development signal.",
};

/** Safe catalogue descriptions — no private wording. */
const THEME_DESCRIPTIONS: Record<string, string> = {
  delegation:
    "Managers are showing a recurring development focus around delegation.",
  feedback:
    "Managers are showing a recurring development focus around feedback.",
  difficult_conversations:
    "Managers are showing a recurring development focus around difficult conversations.",
  accountability:
    "Managers are showing a recurring development focus around accountability.",
  psychological_safety:
    "Managers are showing a recurring development focus around psychological safety.",
  presence:
    "Managers are showing a recurring development focus around listening and presence.",
  collaboration:
    "Managers are showing a recurring development focus around collaboration.",
  confidence:
    "Managers are showing a recurring development focus around confident leadership.",
  role_transition:
    "Managers are showing a recurring development focus around role transition.",
  boundaries:
    "Managers are showing a recurring development focus around boundaries and workload.",
};

export function themeDescriptionForKey(themeKey: string): string | null {
  return THEME_DESCRIPTIONS[themeKey.trim()] ?? null;
}

export function strengthDisplayLabel(
  strength: ManagerDevelopmentPatternStrength | "established" | string
): string {
  if (strength === "developing") return "Developing";
  if (strength === "established") return "Established";
  return "Emerging";
}
