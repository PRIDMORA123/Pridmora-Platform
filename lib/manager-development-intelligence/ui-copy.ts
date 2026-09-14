/**
 * Stage 3.2 — Lead-facing copy for Manager Development Intelligence.
 * Catalogue/generic text only. Never derived from private Manager content.
 */

import type { ManagerDevelopmentPatternStrength } from "@/lib/manager-development-intelligence/constants";

export const LEAD_PRIVACY_BOUNDARY_COPY =
  "Pridmora shows only themes shared by at least five Managers. Individual development records, reflections and Aurelia conversations remain private. Leads cannot identify or target the Managers behind a theme.";

export const LEAD_LENS_SEPARATION_COPY =
  "This view shows where collective attention is concentrated in Manager development across the organisation. People Development Intelligence is a separate lens based on developmental work with people.";

export const LEAD_OVERVIEW_LENS_NOTE =
  "This is the Manager development lens. People Development Intelligence is a separate lens based on developmental work with people.";

/** Coverage, prevalence and absence — used once in “About this picture”. */
export const LEAD_MANAGER_DI_INTERPRETATION_COPY =
  "Themes are drawn from Managers’ development focus and, where authorised, development evidence. They indicate where collective development attention is concentrated, not whether Managers are competent or performing well. This is not a census, ranking or measure of individual performance. Absence of a theme does not prove that no development need exists.";

export const STRENGTH_EXPLANATIONS: Record<
  ManagerDevelopmentPatternStrength,
  string
> = {
  emerging:
    "This theme appears across enough Managers to be shown safely and is currently supported by one type of development signal.",
  developing:
    "This theme appears across enough Managers to be shown safely and is supported by more than one type of development signal.",
};

/** Safe catalogue descriptions — no private wording. */
const THEME_DESCRIPTIONS: Record<string, string> = {
  delegation:
    "Collective attention is centred on entrusting work clearly, creating appropriate ownership and maintaining proportionate oversight.",
  feedback:
    "Collective attention is centred on making feedback timely, specific and useful in everyday working relationships.",
  difficult_conversations:
    "Collective attention is centred on preparing for and handling challenging conversations with greater clarity and care.",
  accountability:
    "Collective attention is centred on setting clear expectations, creating ownership and following through consistently.",
  psychological_safety:
    "Collective attention is centred on creating conditions where people can contribute, question and raise concerns safely.",
  presence:
    "Collective attention is centred on listening carefully, staying present and responding thoughtfully in leadership conversations.",
  collaboration:
    "Collective attention is centred on working across boundaries, aligning expectations and building shared ownership.",
  confidence:
    "Collective attention is centred on exercising judgement, communicating decisions and leading with greater assurance.",
  role_transition:
    "Collective attention is centred on the shift into broader responsibility, including identity, priorities and expectations.",
  boundaries:
    "Collective attention is centred on balancing responsibility, competing priorities and sustainable boundaries.",
};

export function themeDescriptionForKey(themeKey: string): string | null {
  return THEME_DESCRIPTIONS[themeKey.trim()] ?? null;
}

export function strengthDisplayLabel(
  strength: ManagerDevelopmentPatternStrength | "established" | string
): string {
  if (strength === "developing") return "Multi-source signal";
  if (strength === "established") return "Established signal";
  return "Shared signal";
}
