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
  "These themes are drawn from Managers’ development focus and, where authorised, development evidence. They are privacy-safe organisational signals, not a census, ranking or measure of individual performance. Pattern strength reflects the type and consistency of the available development signals. Absence of a theme does not prove that no development need exists.";

export const STRENGTH_EXPLANATIONS: Record<
  ManagerDevelopmentPatternStrength,
  string
> = {
  emerging:
    "A privacy-safe shared development theme is visible from the current development signals.",
  developing:
    "The pattern is supported by more than one type of development signal.",
};

/** Safe catalogue descriptions — no private wording. */
const THEME_DESCRIPTIONS: Record<string, string> = {
  delegation:
    "A shared development theme around delegation is visible across Managers and has passed the privacy threshold.",
  feedback:
    "A shared development theme around feedback is visible across Managers and has passed the privacy threshold.",
  difficult_conversations:
    "A shared development theme around difficult conversations is visible across Managers and has passed the privacy threshold.",
  accountability:
    "A shared development theme around accountability is visible across Managers and has passed the privacy threshold.",
  psychological_safety:
    "A shared development theme around psychological safety is visible across Managers and has passed the privacy threshold.",
  presence:
    "A shared development theme around listening and presence is visible across Managers and has passed the privacy threshold.",
  collaboration:
    "A shared development theme around collaboration is visible across Managers and has passed the privacy threshold.",
  confidence:
    "A shared development theme around confident leadership is visible across Managers and has passed the privacy threshold.",
  role_transition:
    "A shared development theme around role transition is visible across Managers and has passed the privacy threshold.",
  boundaries:
    "A shared development theme around boundaries and workload is visible across Managers and has passed the privacy threshold.",
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
