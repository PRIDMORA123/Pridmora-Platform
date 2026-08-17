/**
 * Premium Executive Brief sections for Organisation Intelligence.
 * Lead-safe deterministic narrative only — prevalence and posture, not progress.
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

/** Theme rows already filtered to Lead-visible / non-suppressed. */
export type ExecutiveBriefThemeInput = {
  label: string;
  direction: string | null;
  evidencePosture?: string | null;
  recurring?: boolean;
  relationshipCount: number;
};

export type ExecutiveBriefInput = {
  organisationName: string;
  periodLabel: string;
  confidenceLevel: ConfidenceLevel;
  sourceRelationshipCount: number;
  sourceConversationCount: number;
  sourceEvidenceCount: number;
  /** @deprecated Prefer visibleThemes — retained for transitional callers. */
  strengthening?: string[];
  /** @deprecated Prefer visibleThemes */
  attention?: string[];
  /** @deprecated Prefer visibleThemes */
  strongEvidenceAreas?: string[];
  /** @deprecated Prefer visibleThemes */
  limitedEvidenceAreas?: string[];
  /** Lead-safe visible themes only. */
  visibleThemes?: ExecutiveBriefThemeInput[];
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

function posturePhrase(posture: string | null | undefined, themeLabel: string): string {
  if (posture === "developing") {
    return `Authorised evidence for ${themeLabel} comes from more than one supported evidence modality.`;
  }
  if (posture === "emerging" || !posture) {
    return `Evidence is sufficient to surface ${themeLabel} as an emerging organisational development theme.`;
  }
  return `There is not enough reportable authorised evidence to draw an organisational conclusion about ${themeLabel}.`;
}

function prevalenceSentence(theme: ExecutiveBriefThemeInput): string {
  const label = theme.label;
  if (theme.direction === "increasing_prevalence") {
    return `${label} appears across more reportable development relationships than in the previous comparable period.`;
  }
  if (theme.direction === "decreasing_prevalence") {
    return `${label} appears across fewer reportable development relationships than in the previous comparable period.`;
  }
  if (theme.direction === "unchanged_prevalence") {
    return `${label} continues to recur across a similar number of reportable development relationships.`;
  }
  return `${label} is reportable in the current period, but there is not yet enough comparable earlier evidence to describe a prevalence change.`;
}

/**
 * Deterministic premium executive brief from Lead-safe structured aggregates.
 * Prevalence is not proof of improvement or deterioration.
 */
export function buildPremiumExecutiveBrief(
  input: ExecutiveBriefInput
): ExecutiveBriefView {
  const confidence = confidenceDisplayLabel(input.confidenceLevel);
  const themes = input.visibleThemes ?? [];

  const increasing = themes.filter(t => t.direction === "increasing_prevalence");
  const decreasing = themes.filter(t => t.direction === "decreasing_prevalence");
  const unchanged = themes.filter(t => t.direction === "unchanged_prevalence");
  const monitor = themes.filter(
    t =>
      t.recurring === true ||
      t.direction === "decreasing_prevalence" ||
      t.direction === "increasing_prevalence"
  );

  // Transitional: if caller still passes legacy string arrays without themes.
  const legacyIncreasing = input.strengthening ?? [];
  const legacyMonitor = input.attention ?? [];

  const changingBody =
    themes.length > 0
      ? [
          increasing.length > 0
            ? `${joinUk(increasing.map(t => t.label))} ${
                increasing.length === 1 ? "appears" : "appear"
              } across more reportable development relationships than in the previous comparable period.`
            : null,
          unchanged.length > 0
            ? `${joinUk(unchanged.map(t => t.label))} ${
                unchanged.length === 1 ? "continues" : "continue"
              } to recur across a similar number of reportable development relationships.`
            : null,
          decreasing.length > 0
            ? `${joinUk(decreasing.map(t => t.label))} ${
                decreasing.length === 1 ? "appears" : "appear"
              } across fewer reportable development relationships than previously.`
            : null,
          increasing.length === 0 &&
          unchanged.length === 0 &&
          decreasing.length === 0
            ? `Reportable organisational themes are visible for ${input.organisationName} in ${input.periodLabel.toLowerCase()}, but comparable prevalence change is not yet established.`
            : null,
          "Prevalence describes how widely authorised signals appear. It is not proof of behavioural improvement or deterioration.",
          `Evidence Confidence: ${confidence}.`,
        ]
          .filter(Boolean)
          .join(" ")
      : legacyIncreasing.length > 0
        ? `Reportable themes with increasing prevalence: ${joinUk(legacyIncreasing)}. Prevalence is not proof of behavioural improvement. Evidence Confidence: ${confidence}.`
        : `There is not enough reportable authorised evidence to describe organisation-wide theme prevalence for ${input.organisationName} in ${input.periodLabel.toLowerCase()}. Evidence Confidence: ${confidence}.`;

  const attentionBody =
    themes.length > 0
      ? monitor.length > 0
        ? `${joinUk(monitor.map(t => t.label))} ${
            monitor.length === 1 ? "is" : "are"
          } a recurring or widening organisational theme to monitor. This does not establish difficulty, weakness or poor performance. Where the sample remains limited, organisation-wide conclusions would be premature.`
        : `No additional reportable themes are flagged for monitoring beyond the prevalence picture above. Continue gathering authorised development evidence before drawing firmer conclusions.`
      : legacyMonitor.length > 0
        ? `${joinUk(legacyMonitor)} ${
            legacyMonitor.length === 1 ? "is" : "are"
          } a theme to monitor. This does not establish difficulty or weakness.`
        : `No organisation-wide monitoring signal is visible yet. Continue gathering authorised development evidence before drawing firmer conclusions.`;

  const postureThemes = themes.slice(0, 4);
  const strongBody =
    postureThemes.length > 0
      ? postureThemes.map(t => posturePhrase(t.evidencePosture, t.label)).join(" ")
      : input.strongEvidenceAreas && input.strongEvidenceAreas.length > 0
        ? `Reportable themes include ${joinUk(input.strongEvidenceAreas)}. Treat posture as emerging unless a broader evidence modality is recorded.`
        : `There is not enough reportable authorised evidence to describe theme evidence posture yet.`;

  const emergingOnly = themes.filter(
    t => !t.evidencePosture || t.evidencePosture === "emerging" || t.evidencePosture === "observed"
  );
  const limitedBody =
    themes.length > 0
      ? emergingOnly.length > 0
        ? `Evidence posture remains limited (emerging) for ${joinUk(
            emergingOnly.map(t => t.label)
          )}. Treat related recommendations as exploratory.`
        : `Reportable themes have been surfaced; continue monitoring whether authorised evidence modalities broaden over time.`
      : input.limitedEvidenceAreas && input.limitedEvidenceAreas.length > 0
        ? `Evidence remains limited around ${joinUk(input.limitedEvidenceAreas)}. Treat related recommendations as exploratory.`
        : `Coverage depends on consistency and recency of authorised evidence.`;

  const recommendationLines =
    input.recommendations.length > 0
      ? input.recommendations
          .slice(0, 3)
          .map(
            item =>
              `Consider: ${item.recommendation} (${confidenceDisplayLabel(item.confidenceLevel)}).`
          )
          .join(" ")
      : "Recommended next focus is continued monitoring and additional authorised evidence gathering where samples remain small.";

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
      title: "What the evidence shows about theme prevalence",
      body: changingBody,
    },
    {
      key: "what_needs_attention",
      title: "Themes to monitor",
      body: attentionBody,
    },
    {
      key: "where_evidence_is_strong",
      title: "Evidence posture",
      body: strongBody,
    },
    {
      key: "where_evidence_is_limited",
      title: "Where evidence remains limited",
      body: limitedBody,
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
    plainText: sections
      .map(section => `${section.title}\n\n${section.body}`)
      .join("\n\n"),
  };
}

export type ExecutiveBriefScanSummary = {
  overallPosition: string;
  strengthening: string[];
  needsAttention: string[];
  momentumValue: string | null;
  momentumDirection: string | null;
};

function firstBriefParagraph(executiveBrief: string | null | undefined): string {
  if (!executiveBrief?.trim()) return "";
  const firstBlock = executiveBrief
    .split(/\n\s*\n/)
    .map(block => block.trim())
    .find(Boolean);
  if (!firstBlock) return "";

  const lines = firstBlock.split("\n").filter(Boolean);
  const knownTitles = [
    "What is changing",
    "What the evidence shows about theme prevalence",
    "What needs attention",
    "Themes to monitor",
    "Where evidence is strong",
    "Evidence posture",
    "Where evidence is limited",
    "Recommended questions / actions",
    "Evidence base",
  ];
  if (lines.length >= 2 && knownTitles.includes(lines[0] ?? "")) {
    return lines.slice(1).join(" ").trim();
  }
  return firstBlock.replace(/\n/g, " ").trim();
}

/**
 * Scannable executive brief summary from snapshot fields.
 * Uses prevalence language; does not invent difficulty or progress.
 */
export function buildExecutiveBriefScanSummary(input: {
  executiveBrief: string | null;
  themes: Array<{
    themeLabel: string;
    direction?: string | null;
    suppressed?: boolean;
    metadata?: { recurring?: boolean };
  }>;
  capabilities: Array<{ label: string; direction: string; suppressed?: boolean }>;
  attentionAreas: Array<{ label: string }>;
  momentum?: {
    displayValue: string;
    direction?: string | null;
    suppressed?: boolean;
  } | null;
  organisationName: string;
  periodLabel: string;
}): ExecutiveBriefScanSummary {
  const fromBrief = firstBriefParagraph(input.executiveBrief);

  const visibleThemes = input.themes.filter(theme => !theme.suppressed);

  const strengthening = Array.from(
    new Set(
      visibleThemes
        .filter(theme => theme.direction === "increasing_prevalence")
        .map(theme => theme.themeLabel)
    )
  ).slice(0, 3);

  const needsAttention = Array.from(
    new Set([
      ...visibleThemes
        .filter(
          theme =>
            theme.direction === "decreasing_prevalence" ||
            theme.metadata?.recurring === true
        )
        .map(theme => theme.themeLabel),
      ...input.attentionAreas.map(area => area.label),
    ])
  ).slice(0, 3);

  const momentumMetric = input.momentum;
  const overallPosition =
    fromBrief ||
    (strengthening.length > 0 || needsAttention.length > 0
      ? `Across ${input.organisationName} in ${input.periodLabel.toLowerCase()}, anonymised authorised development evidence shows reportable organisational themes. Prevalence is not behavioural progress.`
      : `Across ${input.organisationName} in ${input.periodLabel.toLowerCase()}, organisation intelligence is still forming from authorised development evidence.`);

  return {
    overallPosition,
    strengthening,
    needsAttention,
    momentumValue:
      momentumMetric && !momentumMetric.suppressed
        ? momentumMetric.displayValue
        : null,
    momentumDirection: momentumMetric?.direction ?? null,
  };
}
