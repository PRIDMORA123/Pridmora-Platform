import type { DevelopmentStatus } from "@/components/identity/development-status-chip";
import type { EvidenceConfidence } from "@/types/development-profile";
import type { ProfileEntryStatus } from "@/lib/development-updates/types";

/**
 * Map stored evidence confidence onto the four qualitative development statuses.
 * No numeric scores — display mapping only.
 */
export function developmentStatusFromConfidence(
  confidence: EvidenceConfidence,
  evidenceCount = 0
): DevelopmentStatus {
  if (confidence === "emerging") return "emerging";
  if (confidence === "demonstrated") return "established";
  // developing + stronger evidence support → Strengthening
  if (evidenceCount >= 3) return "strengthening";
  return "developing";
}

export function developmentStatusFromProfileEntry(
  status: ProfileEntryStatus,
  evidenceCount = 0
): DevelopmentStatus {
  switch (status) {
    case "well_established":
      return "established";
    case "supported":
      return evidenceCount >= 3 ? "strengthening" : "developing";
    default:
      return "emerging";
  }
}

export function conciseThemeExplanation(narrative: string, max = 160): string {
  const trimmed = narrative.replace(/\s+/g, " ").trim();
  if (!trimmed) {
    return "Supported by reviewed coaching evidence.";
  }
  if (trimmed.length <= max) return trimmed;
  return `${trimmed
    .slice(0, max - 1)
    .replace(/\s+\S*$/, "")
    .replace(/[.,;:!?]+$/, "")}…`;
}
