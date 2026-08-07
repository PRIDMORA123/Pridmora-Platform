import type { ConfidenceLevel } from "@/lib/organisation-intelligence/constants";
import { ORGANISATION_INTELLIGENCE_PRIVACY_THRESHOLD } from "@/lib/organisation-intelligence/constants";

export type ConfidenceInput = {
  evidenceCount: number;
  relationshipCount: number;
  sourceTypeCount: number;
  consistentDirection?: boolean;
  multiPeriod?: boolean;
  threshold?: number;
};

/**
 * Confidence describes strength of evidence, not certainty.
 * Low / moderate / high only.
 */
export function calculateConfidenceLevel(input: ConfidenceInput): ConfidenceLevel {
  const threshold = input.threshold ?? ORGANISATION_INTELLIGENCE_PRIVACY_THRESHOLD;
  const {
    evidenceCount,
    relationshipCount,
    sourceTypeCount,
    consistentDirection = false,
    multiPeriod = false,
  } = input;

  if (relationshipCount < threshold || evidenceCount < threshold) {
    return "low";
  }

  const substantialSample = relationshipCount >= threshold * 2 && evidenceCount >= threshold * 3;
  const multipleSources = sourceTypeCount >= 2;

  if (
    substantialSample &&
    multipleSources &&
    consistentDirection &&
    multiPeriod
  ) {
    return "high";
  }

  if (
    relationshipCount >= threshold &&
    evidenceCount >= threshold * 2 &&
    (multipleSources || consistentDirection)
  ) {
    return "moderate";
  }

  return "low";
}

export function confidenceBasis(input: ConfidenceInput): string {
  const level = calculateConfidenceLevel(input);
  if (level === "high") {
    return "Repeated evidence across a substantial sample, multiple periods and several source types with a consistent direction.";
  }
  if (level === "moderate") {
    return "Repeated evidence across several relationships with more than one source type or a broadly consistent direction.";
  }
  return "Minimum threshold met but evidence remains limited, narrow or inconsistent.";
}

export function confidenceDisplayLabel(level: ConfidenceLevel): string {
  if (level === "high") return "High confidence";
  if (level === "moderate") return "Moderate confidence";
  return "Low confidence";
}
