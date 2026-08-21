/**
 * Canonical observation authorisation for Development Intelligence.
 * Prefer observation-row inclusion/review state over stale structured_evidence JSON.
 */

import {
  isPridmoraCapabilityKey,
  mapToPridmoraCapabilityKey,
} from "@/lib/development-evidence/capabilities";
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

export const UNEXPECTED_CAPABILITY_SELECTION_MESSAGE =
  "The capability could not be saved. You can still accept this evidence without a capability assigned.";

export type ObservationReviewEdit = {
  title?: string;
  description?: string;
  include?: boolean;
  capabilityKey?: string | null;
};

export type ObservationReviewDecision = {
  observationId: string;
  reviewStatus: "approved" | "edited" | "rejected" | "excluded";
  title?: string;
  description?: string;
  capabilityKey: string | null;
  includeInIntelligence: boolean;
};

/**
 * Map a Manager-reviewed capability selection to a catalogue key.
 * null / "" clears the capability. Human-readable names are mapped to keys.
 * Unmappable strings leave the capability unassigned so review can proceed.
 * Unexpected non-string values surface a safe user-facing error.
 *
 * This is the only capability parser on the Accept evidence path
 * (reviewEvidence → observationDecisions.capabilityKey).
 */
export function parseReviewCapabilityKey(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") {
    throw new Error(UNEXPECTED_CAPABILITY_SELECTION_MESSAGE);
  }
  return mapToPridmoraCapabilityKey(value);
}

/**
 * Capability value the review UI must submit.
 * Always canonicalises persisted display names / invented keys so the Accept
 * payload never forwards a raw Aurelia string to parseReviewCapabilityKey.
 */
export function capabilityKeyForReviewSubmission(input: {
  persistedCapabilityKey: string | null | undefined;
  edited?: ObservationReviewEdit | null;
}): string | null {
  const edited = input.edited;
  const raw =
    edited && Object.prototype.hasOwnProperty.call(edited, "capabilityKey")
      ? edited.capabilityKey
      : input.persistedCapabilityKey;
  return mapToPridmoraCapabilityKey(raw);
}

/**
 * Exact observationDecisions body built when the Manager clicks Approve.
 * Used by the review UI so tests can reproduce Kate's Accept payload.
 */
export function buildObservationReviewDecisions(input: {
  observations: ReadonlyArray<{
    id: string;
    title: string;
    description: string;
    capabilityKey: string | null;
  }>;
  editMap: Record<string, ObservationReviewEdit | undefined>;
  decision: "approve" | "reject" | "exclude";
}): ObservationReviewDecision[] {
  return input.observations.map(observation => {
    const edited = input.editMap[observation.id];
    const include = edited?.include ?? false;
    const proposedMapped = mapToPridmoraCapabilityKey(observation.capabilityKey);
    const capabilityKey = capabilityKeyForReviewSubmission({
      persistedCapabilityKey: observation.capabilityKey,
      edited,
    });
    const titleChanged =
      (edited?.title ?? observation.title) !== observation.title;
    const descriptionChanged =
      (edited?.description ?? observation.description) !==
      observation.description;
    const capabilityChanged = capabilityKey !== proposedMapped;
    return {
      observationId: observation.id,
      reviewStatus: include
        ? titleChanged || descriptionChanged || capabilityChanged
          ? ("edited" as const)
          : ("approved" as const)
        : ("excluded" as const),
      title: edited?.title,
      description: edited?.description,
      capabilityKey,
      includeInIntelligence: include && input.decision === "approve",
    };
  });
}

/**
 * Exact reviewEvidence branch: when capabilityKey is present on a decision,
 * canonicalise it; otherwise leave the stored observation value untouched.
 */
export function reviewedCapabilityKeyFromDecision(input: {
  decision: { capabilityKey?: string | null };
  existingCapabilityKey: string | null;
}): string | null {
  if (!Object.prototype.hasOwnProperty.call(input.decision, "capabilityKey")) {
    return input.existingCapabilityKey;
  }
  return parseReviewCapabilityKey(input.decision.capabilityKey);
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
