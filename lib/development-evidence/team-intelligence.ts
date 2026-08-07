/**
 * Team Intelligence — safe aggregation for manager / authorised team scope.
 * No ranking, no confidential content, no individual weakness labels.
 */

import { capabilityLabel } from "@/lib/development-evidence/capabilities";
import { calculateEvidenceConfidence } from "@/lib/development-evidence/confidence";
import { calculateEvidenceCoverage } from "@/lib/development-evidence/coverage";
import type {
  DevelopmentEvidenceRecord,
  TeamIntelligenceView,
} from "@/lib/development-evidence/types";

export const TEAM_INTELLIGENCE_PRIVACY_NOTE =
  "Team Intelligence aggregates reviewed development evidence only. Confidential conversation content and private identity are never shown. People are not ranked.";

export type TeamMemberEvidenceBundle = {
  relationshipId: string;
  /** Public display label only — never private real name. */
  publicLabel: string;
  identityMode: "standard" | "confidential";
  evidence: DevelopmentEvidenceRecord[];
};

export function buildTeamIntelligenceView(input: {
  members: TeamMemberEvidenceBundle[];
  privacyThreshold?: number;
}): TeamIntelligenceView {
  const threshold = input.privacyThreshold ?? 2;
  const contributing = input.members.filter(member =>
    member.evidence.some(
      item =>
        item.includeInIntelligence &&
        !item.restricted &&
        !item.deletedAt &&
        item.reviewStatus !== "rejected" &&
        item.reviewStatus !== "excluded"
    )
  );

  const allIncluded = contributing.flatMap(member =>
    member.evidence.filter(
      item =>
        item.includeInIntelligence &&
        !item.restricted &&
        !item.deletedAt &&
        member.identityMode !== "confidential" &&
        item.reviewStatus !== "rejected" &&
        item.reviewStatus !== "excluded"
    )
  );

  // Confidential relationships contribute only to counts, never content.
  const confidentialContributors = contributing.filter(
    member => member.identityMode === "confidential"
  ).length;

  const aggregatedConfidence = calculateEvidenceConfidence({
    evidence: allIncluded.map(item => ({
      id: item.id,
      evidenceType: item.evidenceType,
      sourceType: item.sourceType,
      freshnessClass: item.freshnessClass,
      includeInIntelligence: item.includeInIntelligence,
      reviewStatus: item.reviewStatus,
      independenceKey:
        item.contentHash ||
        item.sourceRecordId ||
        `${item.evidenceType}:${item.title}`,
      hasBehaviouralSpecificity: Boolean(
        item.structuredEvidence.observations?.some(
          observation => observation.behaviouralEvidence
        )
      ),
      capabilityKeys: item.capabilityKeys,
      contradictionCount:
        item.structuredEvidence.contradictoryEvidence?.length ?? 0,
    })),
  });

  const coverage = calculateEvidenceCoverage(allIncluded);

  const capabilityCounts = new Map<string, number>();
  for (const item of allIncluded) {
    for (const key of item.capabilityKeys) {
      capabilityCounts.set(key, (capabilityCounts.get(key) ?? 0) + 1);
    }
  }

  const strengtheningCapabilities = [...capabilityCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([key]) => capabilityLabel(key));

  const recurringThemes = Array.from(
    new Set(
      allIncluded.flatMap(
        item => item.structuredEvidence.developmentSignals ?? []
      )
    )
  ).slice(0, 5);

  const improvingBehaviours = Array.from(
    new Set(
      allIncluded.flatMap(item => item.structuredEvidence.strengthSignals ?? [])
    )
  ).slice(0, 5);

  const shareableStrengths = improvingBehaviours.slice(0, 4);

  const limitedEvidenceAreas =
    coverage.notRepresentedLabels.length > 0
      ? coverage.notRepresentedLabels.map(
          label => `${label} remains thinly represented across the team.`
        )
      : ["Evidence coverage is relatively broad across available categories."];

  const conversationsNeedingAttention =
    contributing.length >= threshold
      ? recurringThemes
          .slice(0, 3)
          .map(
            theme =>
              `Conversations may need attention where evidence repeatedly surfaces ${theme.toLowerCase()}.`
          )
      : [
          "There is not yet enough team evidence to highlight conversations needing attention.",
        ];

  return {
    strengtheningCapabilities:
      contributing.length >= threshold
        ? strengtheningCapabilities
        : [],
    recurringThemes: contributing.length >= threshold ? recurringThemes : [],
    limitedEvidenceAreas,
    improvingBehaviours:
      contributing.length >= threshold ? improvingBehaviours : [],
    conversationsNeedingAttention,
    shareableStrengths:
      contributing.length >= threshold ? shareableStrengths : [],
    aggregatedConfidence,
    privacyNote:
      confidentialContributors > 0
        ? `${TEAM_INTELLIGENCE_PRIVACY_NOTE} ${confidentialContributors} confidential relationship(s) contributed to activity counts only.`
        : TEAM_INTELLIGENCE_PRIVACY_NOTE,
    contributingRelationshipCount: contributing.length,
  };
}
