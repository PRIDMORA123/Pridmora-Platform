/**
 * Evidence Coverage — descriptive breadth, not a synthetic percentage.
 * LIMITED | DEVELOPING | BROAD
 */

import {
  COVERAGE_CATEGORY_LABELS,
  COVERAGE_DISPLAY_LABELS,
  EVIDENCE_COVERAGE_CATEGORIES,
  EVIDENCE_TYPE_TO_COVERAGE,
  type DevelopmentEvidenceType,
  type EvidenceCoverageCategory,
  type EvidenceCoverageLevel,
} from "@/lib/development-evidence/constants";
import type { EvidenceCoverageResult } from "@/lib/development-evidence/types";

export type CoverageEvidenceInput = {
  evidenceType: DevelopmentEvidenceType;
  includeInIntelligence: boolean;
  reviewStatus: string;
};

export function calculateEvidenceCoverage(
  evidence: CoverageEvidenceInput[]
): EvidenceCoverageResult {
  const included = evidence.filter(
    item =>
      item.includeInIntelligence &&
      item.reviewStatus !== "rejected" &&
      item.reviewStatus !== "excluded"
  );

  const representedSet = new Set<EvidenceCoverageCategory>();
  for (const item of included) {
    representedSet.add(EVIDENCE_TYPE_TO_COVERAGE[item.evidenceType]);
  }

  const represented = EVIDENCE_COVERAGE_CATEGORIES.filter(category =>
    representedSet.has(category)
  );
  const notRepresented = EVIDENCE_COVERAGE_CATEGORIES.filter(
    category => !representedSet.has(category)
  );

  let level: EvidenceCoverageLevel = "limited";
  if (represented.length >= 5) {
    level = "broad";
  } else if (represented.length >= 3) {
    level = "developing";
  } else {
    level = "limited";
  }

  const representedLabels = represented.map(
    category => COVERAGE_CATEGORY_LABELS[category]
  );
  const notRepresentedLabels = notRepresented.map(
    category => COVERAGE_CATEGORY_LABELS[category]
  );

  const summary =
    level === "broad"
      ? "Broad evidence base"
      : level === "developing"
        ? "Developing evidence base"
        : "Limited evidence base";

  return {
    level,
    label: COVERAGE_DISPLAY_LABELS[level],
    represented: [...represented],
    representedLabels,
    notRepresented: [...notRepresented],
    notRepresentedLabels,
    summary,
  };
}
