/**
 * Canonical observation authorisation for Development Intelligence.
 * Prefer observation-row inclusion/review state over stale structured_evidence JSON.
 */

import { isPridmoraCapabilityKey } from "@/lib/development-evidence/capabilities";
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

/**
 * Evidence-level capability_keys for Development Intelligence after human review.
 * Derived only from authorised included observations with a valid catalogue key.
 */
export function authorisedCapabilityKeysFromObservations(
  observations: ReadonlyArray<
    Pick<
      DevelopmentEvidenceObservation,
      "includeInIntelligence" | "reviewStatus" | "capabilityKey"
    >
  >,
  includeEvidenceInIntelligence: boolean
): string[] {
  if (!includeEvidenceInIntelligence) return [];
  const keys: string[] = [];
  for (const observation of observations) {
    if (!observationContributesToIntelligence(observation)) continue;
    const key = observation.capabilityKey;
    if (!key || !isPridmoraCapabilityKey(key)) continue;
    if (!keys.includes(key)) keys.push(key);
  }
  return keys;
}

/**
 * Validate a Manager-reviewed capability selection.
 * null / "" clears the capability. Arbitrary strings are rejected.
 */
export function parseReviewCapabilityKey(value: unknown): string | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new Error("Invalid capability key.");
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!isPridmoraCapabilityKey(trimmed)) {
    throw new Error("Invalid capability key.");
  }
  return trimmed;
}

export type CapabilityReviewDecisionOutcome =
  | "accepted"
  | "corrected"
  | "removed"
  | "unchanged_absent";

export function capabilityReviewDecisionOutcome(input: {
  proposedCapabilityKey: string | null;
  reviewedCapabilityKey: string | null;
}): CapabilityReviewDecisionOutcome {
  const proposed = input.proposedCapabilityKey;
  const reviewed = input.reviewedCapabilityKey;
  if (proposed && reviewed && proposed === reviewed) return "accepted";
  if (proposed && reviewed && proposed !== reviewed) return "corrected";
  if (proposed && !reviewed) return "removed";
  if (!proposed && reviewed) return "corrected";
  return "unchanged_absent";
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
