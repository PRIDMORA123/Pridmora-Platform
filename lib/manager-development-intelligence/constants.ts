/**
 * Stage 3.1 — Manager Development Intelligence (organisation Lead-safe).
 * Separate from relationship Organisation Intelligence.
 */

/** Privacy threshold: DISTINCT eligible Managers per canonical theme. */
export const MANAGER_DEVELOPMENT_PRIVACY_THRESHOLD = 5;

export const MANAGER_DEVELOPMENT_PRIVACY_NOTE =
  "Organisation Development Intelligence uses privacy-safe, anonymised Manager development themes only. Private reflections, Aurelia conversations, action titles, evidence documents and individual Manager development records are never shown.";

export const MANAGER_DEVELOPMENT_INSUFFICIENT_COPY =
  "Not enough evidence yet to identify organisation-wide development patterns.";

export const PATTERN_STRENGTHS = ["emerging", "developing"] as const;
export type ManagerDevelopmentPatternStrength =
  (typeof PATTERN_STRENGTHS)[number];

export const MANAGER_DEVELOPMENT_STATUSES = [
  "insufficient_evidence",
  "patterns_available",
] as const;
export type ManagerDevelopmentIntelligenceStatus =
  (typeof MANAGER_DEVELOPMENT_STATUSES)[number];
