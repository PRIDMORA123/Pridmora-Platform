/**
 * Preparation-facing authorised Development Evidence observations.
 * Uses observation-row authorisation only — never structured_evidence JSON
 * and never full uploaded document text.
 */

import { observationContributesToIntelligence } from "@/lib/development-evidence/authorised-observations";
import type {
  DevelopmentEvidenceObservation,
  DevelopmentEvidenceRecord,
} from "@/lib/development-evidence/types";

export const PREPARATION_BEHAVIOURAL_EXCERPT_MAX_CHARS = 400;

export type PreparationAuthorisedObservation = {
  observationId: string;
  evidenceId: string;
  title: string;
  behaviouralEvidence: string;
  evidenceType: string;
  evidenceDate: string | null;
  sourceTitle: string;
  observationUpdatedAt: string;
  evidenceUpdatedAt: string;
};

/** Parent evidence gate aligned with Development Intelligence inclusion. */
export function evidenceParentAuthorisedForPreparation(
  evidence: Pick<
    DevelopmentEvidenceRecord,
    "includeInIntelligence" | "reviewStatus" | "deletedAt"
  >
): boolean {
  if (evidence.deletedAt) return false;
  if (!evidence.includeInIntelligence) return false;
  return (
    evidence.reviewStatus !== "rejected" &&
    evidence.reviewStatus !== "excluded"
  );
}

function boundBehaviouralExcerpt(value: string | null | undefined): string {
  const trimmed = (value ?? "").replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  if (trimmed.length <= PREPARATION_BEHAVIOURAL_EXCERPT_MAX_CHARS) {
    return trimmed;
  }
  return trimmed.slice(0, PREPARATION_BEHAVIOURAL_EXCERPT_MAX_CHARS).trim();
}

/**
 * Select minimum useful authorised observation fields for Preparation AI.
 * Does not read structured_evidence.observations or document extracted_text.
 */
export function selectAuthorisedObservationsForPreparation(input: {
  evidence: DevelopmentEvidenceRecord[];
  observations: DevelopmentEvidenceObservation[];
}): PreparationAuthorisedObservation[] {
  const parentById = new Map(
    input.evidence
      .filter(evidenceParentAuthorisedForPreparation)
      .map(item => [item.id, item])
  );

  const selected: PreparationAuthorisedObservation[] = [];

  for (const observation of input.observations) {
    if (!observationContributesToIntelligence(observation)) continue;
    const parent = parentById.get(observation.evidenceId);
    if (!parent) continue;

    const behaviouralEvidence = boundBehaviouralExcerpt(
      observation.behaviouralEvidence
    );
    if (!behaviouralEvidence) continue;

    selected.push({
      observationId: observation.id,
      evidenceId: parent.id,
      title: observation.title.trim(),
      behaviouralEvidence,
      evidenceType: parent.evidenceType,
      evidenceDate: parent.evidenceDate,
      sourceTitle: parent.title.trim(),
      observationUpdatedAt: observation.updatedAt,
      evidenceUpdatedAt: parent.updatedAt,
    });
  }

  return selected.sort((a, b) =>
    a.observationId.localeCompare(b.observationId)
  );
}

export function formatAuthorisedDevelopmentEvidenceForPrompt(
  items: PreparationAuthorisedObservation[]
): string {
  if (items.length === 0) return "None available.";

  return items
    .map(item =>
      [
        `Observation: ${item.title}`,
        item.sourceTitle ? `Source: ${item.sourceTitle}` : "",
        item.evidenceType ? `Type: ${item.evidenceType}` : "",
        item.evidenceDate ? `Date: ${item.evidenceDate}` : "",
        `Behavioural evidence: ${item.behaviouralEvidence}`,
      ]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n\n");
}

/** Stable fingerprint fragment for authorised Development Evidence. */
export function authorisedDevelopmentEvidenceFingerprintPart(
  items: PreparationAuthorisedObservation[]
): string {
  if (items.length === 0) return "";
  return items
    .map(
      item =>
        `${item.observationId}:${item.observationUpdatedAt}:${item.evidenceId}:${item.evidenceUpdatedAt}`
    )
    .join(",");
}
