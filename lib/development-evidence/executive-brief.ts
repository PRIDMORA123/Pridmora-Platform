/**
 * Premium Executive Brief sections for Organisation Intelligence.
 * Extends existing org intelligence brief with structured sections.
 */

import type { ConfidenceLevel } from "@/lib/organisation-intelligence/constants";
import { confidenceDisplayLabel } from "@/lib/organisation-intelligence/confidence";

export type ExecutiveBriefSection = {
  key:
    | "what_is_changing"
    | "what_needs_attention"
    | "where_evidence_is_strong"
    | "where_evidence_is_limited"
    | "recommended_questions_actions"
    | "evidence_base";
  title: string;
  body: string;
};

export type ExecutiveBriefView = {
  sections: ExecutiveBriefSection[];
  plainText: string;
};

export type ExecutiveBriefInput = {
  organisationName: string;
  periodLabel: string;
  confidenceLevel: ConfidenceLevel;
  sourceRelationshipCount: number;
  sourceConversationCount: number;
  sourceEvidenceCount: number;
  strengthening: string[];
  attention: string[];
  strongEvidenceAreas: string[];
  limitedEvidenceAreas: string[];
  recommendations: Array<{
    title: string;
    recommendation: string;
    confidenceLevel: ConfidenceLevel;
  }>;
  restrictedEvidenceExcluded?: boolean;
};

function joinUk(parts: string[]): string {
  const unique = Array.from(new Set(parts.filter(Boolean)));
  if (unique.length === 0) return "";
  if (unique.length === 1) return unique[0]!;
  if (unique.length === 2) return `${unique[0]} and ${unique[1]}`;
  return `${unique.slice(0, -1).join(", ")} and ${unique[unique.length - 1]}`;
}

/**
 * Deterministic premium executive brief.
 * No hype. No unsupported causation. No individual identification.
 */
export function buildPremiumExecutiveBrief(
  input: ExecutiveBriefInput
): ExecutiveBriefView {
  const confidence = confidenceDisplayLabel(input.confidenceLevel);

  const changing =
    input.strengthening.length > 0
      ? `Evidence suggests ${joinUk(input.strengthening)} behaviours are strengthening across ${input.organisationName}, supported by repeated evidence from development conversations and related reviewed sources. Evidence Confidence: ${confidence}.`
      : `There is not yet a clear organisation-wide strengthening pattern for ${input.organisationName} in ${input.periodLabel.toLowerCase()}. Evidence Confidence: ${confidence}.`;

  const attention =
    input.attention.length > 0
      ? `${joinUk(input.attention)} continues to show recurring difficulty in the available evidence. Where evidence is concentrated in one function or a small sample, organisation-wide conclusions would be premature.`
      : `No strong organisation-wide attention signal is visible yet. Continue gathering approved development evidence before drawing firmer conclusions.`;

  const strong =
    input.strongEvidenceAreas.length > 0
      ? `Evidence is comparatively strong around ${joinUk(input.strongEvidenceAreas)}. These areas have broader corroboration across contributing relationships.`
      : `Evidence is not yet strong enough in any capability area to support firm organisational action.`;

  const limited =
    input.limitedEvidenceAreas.length > 0
      ? `Evidence remains limited around ${joinUk(input.limitedEvidenceAreas)}. Treat related recommendations as exploratory.`
      : `Coverage is relatively broad, though confidence still depends on consistency and recency.`;

  const recommendationLines =
    input.recommendations.length > 0
      ? input.recommendations
          .slice(0, 3)
          .map(
            item =>
              `Consider: ${item.recommendation} (${confidenceDisplayLabel(item.confidenceLevel)}).`
          )
          .join(" ")
      : "Recommended next focus is continued monitoring and additional evidence gathering where samples remain small.";

  const evidenceBase = [
    `Evidence base for ${input.periodLabel.toLowerCase()}: ${input.sourceRelationshipCount} contributing relationships, ${input.sourceConversationCount} conversations, ${input.sourceEvidenceCount} reviewed evidence items.`,
    `Overall evidence confidence: ${confidence}.`,
    input.restrictedEvidenceExcluded
      ? "Restricted evidence was excluded from organisational reporting."
      : "No restricted evidence was included in this organisational view.",
  ].join(" ");

  const sections: ExecutiveBriefSection[] = [
    {
      key: "what_is_changing",
      title: "What is changing",
      body: changing,
    },
    {
      key: "what_needs_attention",
      title: "What needs attention",
      body: attention,
    },
    {
      key: "where_evidence_is_strong",
      title: "Where evidence is strong",
      body: strong,
    },
    {
      key: "where_evidence_is_limited",
      title: "Where evidence is limited",
      body: limited,
    },
    {
      key: "recommended_questions_actions",
      title: "Recommended questions / actions",
      body: recommendationLines,
    },
    {
      key: "evidence_base",
      title: "Evidence base",
      body: evidenceBase,
    },
  ];

  return {
    sections,
    plainText: sections.map(section => `${section.title}\n\n${section.body}`).join("\n\n"),
  };
}
