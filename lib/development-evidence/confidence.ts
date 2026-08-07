/**
 * Deterministic Evidence Confidence.
 * AI may explain the result; AI must not choose the level arbitrarily.
 * Levels: LOW | MODERATE | STRONG — not a pseudo-scientific percentage.
 */

import {
  CONFIDENCE_DISPLAY_LABELS,
  type DevelopmentEvidenceType,
  type EvidenceConfidenceLevel,
  type EvidenceFreshnessClass,
  PSYCHOMETRIC_EVIDENCE_TYPES,
} from "@/lib/development-evidence/constants";
import type { EvidenceConfidenceResult } from "@/lib/development-evidence/types";

export type ConfidenceEvidenceInput = {
  id: string;
  evidenceType: DevelopmentEvidenceType;
  sourceType: string;
  freshnessClass: EvidenceFreshnessClass;
  includeInIntelligence: boolean;
  reviewStatus: string;
  /** Stable fingerprint for de-duplication (hash, title+type, or source record). */
  independenceKey: string;
  hasBehaviouralSpecificity?: boolean;
  capabilityKeys?: string[];
  contradictionCount?: number;
};

export type CalculateEvidenceConfidenceInput = {
  evidence: ConfidenceEvidenceInput[];
  /** Optional target capability for scoped confidence. */
  capabilityKey?: string;
  now?: Date;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Deduplicate near-identical sources so 100 duplicated notes cannot create Strong.
 */
export function independentSourceKeys(
  evidence: ConfidenceEvidenceInput[]
): string[] {
  const keys = new Set<string>();
  for (const item of evidence) {
    if (!item.includeInIntelligence) continue;
    if (item.reviewStatus === "rejected" || item.reviewStatus === "excluded") {
      continue;
    }
    keys.add(item.independenceKey || `${item.evidenceType}:${item.id}`);
  }
  return Array.from(keys);
}

export function calculateEvidenceConfidence(
  input: CalculateEvidenceConfidenceInput
): EvidenceConfidenceResult {
  const scoped = input.evidence.filter(item => {
    if (!item.includeInIntelligence) return false;
    if (item.reviewStatus === "rejected" || item.reviewStatus === "excluded") {
      return false;
    }
    if (!input.capabilityKey) return true;
    return (item.capabilityKeys ?? []).includes(input.capabilityKey);
  });

  const independentKeys = independentSourceKeys(scoped);
  const independentSources = independentKeys.length;

  const recentSources = scoped.filter(
    item => item.freshnessClass === "current"
  ).length;
  const ageingOrHistoric = scoped.filter(
    item => item.freshnessClass !== "current"
  ).length;

  const behaviouralItems = scoped.filter(item => item.hasBehaviouralSpecificity);
  const repeatedBehaviours = behaviouralItems.length;

  const typeSet = new Set(scoped.map(item => item.evidenceType));
  const hasConversation = [...typeSet].some(type =>
    ["development_conversation", "summary_insights"].includes(type)
  );
  const hasAssessment = [...typeSet].some(type =>
    (PSYCHOMETRIC_EVIDENCE_TYPES as readonly string[]).includes(type) ||
    type === "leadership_assessment" ||
    type === "competency_assessment"
  );
  const hasFeedback = [...typeSet].some(type =>
    ["feedback_360", "stakeholder_feedback", "appraisal_review"].includes(type)
  );
  const hasReflection = [...typeSet].some(type =>
    ["reflection", "personal_reflection", "manager_observation"].includes(type)
  );

  const distinctModalities = [
    hasConversation,
    hasAssessment,
    hasFeedback,
    hasReflection,
  ].filter(Boolean).length;

  const contradictionCount = scoped.reduce(
    (sum, item) => sum + (item.contradictionCount ?? 0),
    0
  );

  const humanValidated = scoped.some(
    item =>
      item.reviewStatus === "approved" ||
      item.reviewStatus === "edited" ||
      item.sourceType === "internal_reference"
  );

  const specificityScore = clamp(
    behaviouralItems.length / Math.max(independentSources, 1),
    0,
    1
  );

  const consistencyScore = clamp(
    distinctModalities / 4 -
      contradictionCount * 0.15 +
      (ageingOrHistoric > independentSources ? -0.1 : 0),
    0,
    1
  );

  const relevanceScore = clamp(
    recentSources / Math.max(independentSources, 1),
    0,
    1
  );

  let level: EvidenceConfidenceLevel = "low";

  if (independentSources === 0) {
    level = "low";
  } else if (
    independentSources >= 4 &&
    distinctModalities >= 3 &&
    humanValidated &&
    contradictionCount === 0 &&
    specificityScore >= 0.4 &&
    relevanceScore >= 0.4 &&
    consistencyScore >= 0.55
  ) {
    level = "strong";
  } else if (
    independentSources >= 2 &&
    distinctModalities >= 2 &&
    humanValidated &&
    contradictionCount <= 1 &&
    (specificityScore >= 0.25 || repeatedBehaviours >= 2)
  ) {
    level = "moderate";
  } else if (
    independentSources >= 3 &&
    humanValidated &&
    contradictionCount === 0 &&
    relevanceScore >= 0.5
  ) {
    level = "moderate";
  } else {
    level = "low";
  }

  // Assessment-only evidence cannot be Strong without behavioural corroboration.
  if (level === "strong" && !hasConversation && !hasReflection && !hasFeedback) {
    level = "moderate";
  }

  // Thin single source remains Low.
  if (independentSources <= 1 && repeatedBehaviours < 2) {
    level = "low";
  }

  const basis = confidenceBasis({
    level,
    independentSources,
    distinctModalities,
    contradictionCount,
    humanValidated,
    recentSources,
  });

  return {
    level,
    label: CONFIDENCE_DISPLAY_LABELS[level],
    basis,
    independentSourceCount: independentSources,
    factors: {
      independentSources,
      recentSources,
      repeatedBehaviours,
      consistencyScore: Number(consistencyScore.toFixed(2)),
      humanValidated,
      contradictionCount,
      specificityScore: Number(specificityScore.toFixed(2)),
      relevanceScore: Number(relevanceScore.toFixed(2)),
    },
  };
}

function confidenceBasis(input: {
  level: EvidenceConfidenceLevel;
  independentSources: number;
  distinctModalities: number;
  contradictionCount: number;
  humanValidated: boolean;
  recentSources: number;
}): string {
  if (input.independentSources === 0) {
    return "No reviewed evidence is currently included in Development Intelligence.";
  }

  if (input.level === "strong") {
    return `Supported by ${input.independentSources} independent evidence sources across multiple modalities, with human validation and no unresolved contradictions.`;
  }

  if (input.level === "moderate") {
    const contradictionNote =
      input.contradictionCount > 0
        ? " Some contradictory signals reduce certainty."
        : "";
    return `Supported by ${input.independentSources} independent evidence sources${
      input.distinctModalities >= 2 ? " across more than one source type" : ""
    }.${contradictionNote}`;
  }

  if (!input.humanValidated) {
    return "Evidence remains limited until reviewed evidence is included.";
  }

  if (input.recentSources === 0) {
    return "Available evidence is limited or largely historic, so current confidence remains low.";
  }

  return `Supported by ${input.independentSources} independent evidence ${
    input.independentSources === 1 ? "source" : "sources"
  }. Additional corroborating evidence would strengthen confidence.`;
}
