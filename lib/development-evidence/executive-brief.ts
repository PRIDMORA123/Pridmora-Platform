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

function themePhrase(labels: string[]): {
  name: string;
  isAre: "is" | "are";
  itThey: "It" | "They";
  themeNoun: string;
  emergingNoun: string;
} {
  const name = joinUk(labels);
  const singular = labels.length === 1;
  return {
    name,
    isAre: singular ? "is" : "are",
    itThey: singular ? "It" : "They",
    themeNoun: singular ? "theme" : "themes",
    emergingNoun: singular
      ? "an emerging development theme"
      : "emerging development themes",
  };
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

  const monitor = themes.filter(
    t =>
      t.recurring === true ||
      t.direction === "decreasing_prevalence" ||
      t.direction === "increasing_prevalence"
  );

  // Transitional: if caller still passes legacy string arrays without themes.
  const legacyIncreasing = input.strengthening ?? [];
  const legacyMonitor = input.attention ?? [];

  const visibleLabels = themes.map(theme => theme.label);
  const monitorLabels =
    monitor.length > 0
      ? monitor.map(theme => theme.label)
      : legacyMonitor.length > 0
        ? legacyMonitor
        : visibleLabels;
  const prevalenceLabels =
    visibleLabels.length > 0
      ? visibleLabels
      : legacyIncreasing;
  const postureThemes = themes.slice(0, 4);
  const postureLabels =
    postureThemes.length > 0
      ? postureThemes.map(theme => theme.label)
      : input.strongEvidenceAreas ?? [];

  const prevalence = themePhrase(prevalenceLabels);
  const watch = themePhrase(monitorLabels);
  const posture = themePhrase(postureLabels);

  const changingBody =
    prevalenceLabels.length > 0
      ? `${prevalence.name} ${prevalence.isAre} emerging as a recurring development ${prevalence.themeNoun}. Similar signals are appearing across several development relationships. This suggests ${prevalence.name} may be worth paying attention to, but the evidence does not yet tell us whether ${prevalence.name} ${prevalence.isAre} improving or declining.`
      : "There is not yet enough evidence to identify a recurring development theme.";

  const attentionBody =
    monitorLabels.length > 0
      ? `${watch.name} ${watch.isAre} a ${watch.themeNoun} worth watching. ${watch.itThey} ${watch.isAre} appearing repeatedly in the available evidence. This does not mean there is an organisation-wide problem or that managers are performing poorly. More evidence is needed before drawing wider conclusions.`
      : "There is not yet a theme worth watching. More evidence is needed before drawing wider conclusions.";

  const strongBody =
    postureLabels.length > 0
      ? `What we can say\nThere is enough evidence to identify ${posture.name} as ${posture.emergingNoun}.`
      : "What we can say\nThere is not yet enough evidence to identify an emerging development theme.";

  const limitedBody =
    "What we do not know yet\nThe current evidence is still limited. Any recommendations should therefore be treated as areas to explore rather than firm conclusions.";

  const recommendationLines =
    monitorLabels.length > 0
      ? `What to do next\nContinue to monitor the ${watch.themeNoun} and gather more evidence before making changes to organisational practice.`
      : "What to do next\nContinue to gather more evidence before making changes to organisational practice.";

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
      title: "What this evidence tells us",
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
    "What this evidence tells us",
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
