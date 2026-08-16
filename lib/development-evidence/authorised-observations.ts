/**
 * Canonical observation authorisation for Development Intelligence.
 * Prefer observation-row inclusion/review state over stale structured_evidence JSON.
 */

import type {
  DevelopmentEvidenceObservation,
  StructuredEvidence,
  StructuredEvidenceObservation,
} from "@/lib/development-evidence/types";

export function observationContributesToIntelligence(
  observation: Pick<
    DevelopmentEvidenceObservation,
    "includeInIntelligence" | "reviewStatus"
  >
): boolean {
  if (!observation.includeInIntelligence) return false;
  return (
    observation.reviewStatus === "approved" ||
    observation.reviewStatus === "edited"
  );
}

export function filterAuthorisedObservations(
  observations: DevelopmentEvidenceObservation[]
): DevelopmentEvidenceObservation[] {
  return observations.filter(observationContributesToIntelligence);
}

export function toStructuredObservation(
  observation: DevelopmentEvidenceObservation
): StructuredEvidenceObservation {
  return {
    title: observation.title,
    description: observation.description,
    category: observation.category ?? undefined,
    behaviouralEvidence: observation.behaviouralEvidence ?? undefined,
    developmentImplication: observation.developmentImplication ?? undefined,
    sourceConfidence: observation.sourceConfidence,
    assessmentContext: observation.assessmentContext ?? undefined,
    limitations: observation.limitations ?? undefined,
    capabilityKey: observation.capabilityKey ?? undefined,
  };
}

/** Rebuild structured_evidence.observations from authorised observation rows. */
export function pruneStructuredEvidenceToAuthorisedObservations(input: {
  structured: StructuredEvidence;
  observations: DevelopmentEvidenceObservation[];
  includeEvidenceInIntelligence: boolean;
}): StructuredEvidence {
  const authorised = input.includeEvidenceInIntelligence
    ? filterAuthorisedObservations(input.observations)
    : [];

  return {
    ...input.structured,
    observations: authorised.map(toStructuredObservation),
  };
}
