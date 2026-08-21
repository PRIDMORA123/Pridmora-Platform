/**
 * Deterministic post-AI constraints for Development Evidence observations.
 * Keeps analyse output suitable for human review without unbounded narrative.
 */

import { mapToPridmoraCapabilityKey } from "@/lib/development-evidence/capabilities";
import {
  EVIDENCE_ANALYSIS_MAX_OBSERVATIONS,
  EVIDENCE_ANALYSIS_MAX_OBSERVATIONS_PSYCHOMETRIC,
  type DevelopmentEvidenceType,
} from "@/lib/development-evidence/constants";
import { isPsychometricEvidenceType } from "@/lib/development-evidence/psychometrics";
import type {
  StructuredEvidence,
  StructuredEvidenceObservation,
} from "@/lib/development-evidence/types";

const NORMAL_TITLE_MAX = 120;
const NORMAL_DESCRIPTION_MAX = 320;
const NORMAL_BEHAVIOURAL_MAX = 240;
const NORMAL_IMPLICATION_MAX = 200;

function clipField(
  value: string | undefined,
  maxChars: number
): string | undefined {
  if (value == null) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length <= maxChars) return trimmed;
  return trimmed.slice(0, maxChars).trimEnd();
}

function isUsableObservation(
  observation: StructuredEvidenceObservation
): boolean {
  return (
    String(observation.title ?? "").trim().length > 0 &&
    String(observation.description ?? "").trim().length > 0
  );
}

export function maxObservationsForEvidenceType(
  evidenceType: DevelopmentEvidenceType
): number {
  return isPsychometricEvidenceType(evidenceType)
    ? EVIDENCE_ANALYSIS_MAX_OBSERVATIONS_PSYCHOMETRIC
    : EVIDENCE_ANALYSIS_MAX_OBSERVATIONS;
}

/**
 * Enforce observation count and field discipline after model parse.
 * Oversized arrays are truncated to the first usable observations (by order).
 * Non-psychometric responses drop assessmentContext (not required for ordinary
 * management evidence).
 */
export function constrainStructuredEvidenceObservations(
  structured: StructuredEvidence,
  evidenceType: DevelopmentEvidenceType
): StructuredEvidence {
  const max = maxObservationsForEvidenceType(evidenceType);
  const psychometric = isPsychometricEvidenceType(evidenceType);

  const constrained = (structured.observations ?? [])
    .filter(isUsableObservation)
    .slice(0, max)
    .map(observation => {
      const capabilityKey =
        mapToPridmoraCapabilityKey(observation.capabilityKey) ?? undefined;
      if (psychometric) {
        return {
          ...observation,
          title: clipField(observation.title, NORMAL_TITLE_MAX) ?? observation.title,
          description:
            clipField(observation.description, NORMAL_DESCRIPTION_MAX) ??
            observation.description,
          behaviouralEvidence: clipField(
            observation.behaviouralEvidence,
            NORMAL_BEHAVIOURAL_MAX
          ),
          developmentImplication: clipField(
            observation.developmentImplication,
            NORMAL_IMPLICATION_MAX
          ),
          capabilityKey,
        };
      }

      return {
        title: clipField(observation.title, NORMAL_TITLE_MAX) ?? observation.title,
        description:
          clipField(observation.description, NORMAL_DESCRIPTION_MAX) ??
          observation.description,
        behaviouralEvidence: clipField(
          observation.behaviouralEvidence,
          NORMAL_BEHAVIOURAL_MAX
        ),
        developmentImplication: clipField(
          observation.developmentImplication,
          NORMAL_IMPLICATION_MAX
        ),
        sourceConfidence: observation.sourceConfidence,
        capabilityKey,
        category: observation.category,
        limitations: observation.limitations,
        // Ordinary management evidence does not need assessment framing.
      };
    });

  return {
    ...structured,
    observations: constrained,
    // Discourage parallel narrative arrays from dominating the payload.
    strengthSignals: (structured.strengthSignals ?? []).slice(0, 3),
    developmentSignals: (structured.developmentSignals ?? []).slice(0, 3),
    capabilitySignals: (structured.capabilitySignals ?? []).slice(0, 3),
    contradictoryEvidence: (structured.contradictoryEvidence ?? []).slice(0, 3),
    context: (structured.context ?? []).slice(0, 3),
    limitations: (structured.limitations ?? []).slice(0, 4),
  };
}
