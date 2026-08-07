/**
 * Evidence freshness: Current | Ageing | Historic.
 * Historic evidence is retained; it carries lower current-weight relevance.
 */

import {
  FRESHNESS_DISPLAY_LABELS,
  FRESHNESS_WINDOWS_DAYS,
  type DevelopmentEvidenceType,
  type EvidenceFreshnessClass,
} from "@/lib/development-evidence/constants";

export function calculateEvidenceFreshness(input: {
  evidenceType: DevelopmentEvidenceType;
  evidenceDate?: string | null;
  capturedAt?: string | null;
  now?: Date;
}): EvidenceFreshnessClass {
  const now = input.now ?? new Date();
  const raw = input.evidenceDate || input.capturedAt;
  if (!raw) return "current";

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "current";

  const ageDays = Math.floor(
    (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
  );
  const windows = FRESHNESS_WINDOWS_DAYS[input.evidenceType];

  if (ageDays <= windows.current) return "current";
  if (ageDays <= windows.ageing) return "ageing";
  return "historic";
}

export function freshnessLabel(value: EvidenceFreshnessClass): string {
  return FRESHNESS_DISPLAY_LABELS[value];
}

/** Current-weight multiplier for intelligence relevance (not a user-facing score). */
export function freshnessWeight(value: EvidenceFreshnessClass): number {
  if (value === "current") return 1;
  if (value === "ageing") return 0.6;
  return 0.3;
}
