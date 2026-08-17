/**
 * Organisation Intelligence executive brief prompt.
 * Receives Lead-safe aggregated anonymised evidence only.
 */

export const ORGANISATION_INTELLIGENCE_SYSTEM_PROMPT = `You write executive development intelligence briefs for authorised organisational leaders using Pridmora.

You receive anonymised aggregated coaching evidence only — themes that already passed the privacy threshold.

You must never invent people, events, percentages or commercial recommendations.
You must never claim behavioural improvement, deterioration, difficulty or performance from prevalence alone.
You must never mention Six Foundations / capability categories unless they appear as visible theme labels in the supplied data.
You must never mention a theme that is not in the visible themes list.

Write in natural UK English.
Do not use unnecessary dashes.
Do not use an Oxford comma unless needed for clarity.
Do not use GPT-style headings or dramatic phrasing.
Do not claim certainty beyond the evidence.
Do not assess individuals.
Do not recommend Pridmora products or programmes.

Use language such as:
- Evidence suggests
- A recurring theme is appearing more widely
- The available evidence indicates
- There is not yet enough evidence to conclude
- Prevalence is not proof of behavioural change

Avoid:
- behaviours are strengthening
- improving
- recurring difficulty
- comparatively strong
- requiring attention
- capability is improving
- development is progressing
- The organisation is
- This proves
- AI predicts with certainty
- Definitive
- Guaranteed
- Coaching caused
- Coaching delivered

Structure the brief as exactly four short paragraphs and no more than 250 words:
1. Theme prevalence (increasing / unchanged / decreasing) among reportable themes
2. Themes to monitor (not problems or difficulties)
3. Evidence posture (emerging / developing) and limitations
4. Recommended next focus

Every paragraph must stay within the supplied metrics, visible themes, confidence levels and evidence posture.
If evidence is thin, say so plainly.
Distinguish evidence from interpretation.
Return plain text paragraphs separated by blank lines. No markdown headings.`;

export type OrganisationIntelligencePromptInput = {
  organisationName: string;
  periodLabel: string;
  comparisonLabel: string;
  comparisonAvailable: boolean;
  confidenceLevel: string;
  sourceRelationshipCount: number;
  sourceConversationCount: number;
  sourceEvidenceCount: number;
  restrictedEvidenceExcluded: boolean;
  privacyThreshold: number;
  metrics: Array<{
    key: string;
    label: string;
    value: string;
    direction: string | null;
    confidence: string;
    evidenceCount: number;
    relationshipCount: number;
    suppressed: boolean;
  }>;
  themes: Array<{
    key: string;
    label: string;
    direction: string | null;
    confidence: string;
    evidenceCount: number;
    relationshipCount: number;
    summary: string | null;
    evidencePosture?: string | null;
  }>;
  capabilities: Array<{
    key: string;
    label: string;
    direction: string;
    confidence: string;
    evidenceCount: number;
    relationshipCount: number;
    suppressed: boolean;
  }>;
  recommendations: Array<{
    title: string;
    rationale: string;
    recommendation: string;
    confidence: string;
  }>;
  visibleThemeKeys?: string[];
  visibleThemeLabels?: string[];
};

export function buildOrganisationIntelligencePromptInput(
  input: OrganisationIntelligencePromptInput
): string {
  return [
    "Organisation intelligence aggregate context (Lead-safe, anonymised):",
    `Organisation name: ${input.organisationName}`,
    `Period: ${input.periodLabel}`,
    `Comparison: ${
      input.comparisonAvailable
        ? input.comparisonLabel
        : "No earlier comparison is available."
    }`,
    `Overall confidence: ${input.confidenceLevel}`,
    `Source relationships: ${input.sourceRelationshipCount}`,
    `Source conversations: ${input.sourceConversationCount}`,
    `Source evidence items: ${input.sourceEvidenceCount}`,
    `Privacy threshold: ${input.privacyThreshold}`,
    `Restricted evidence excluded: ${
      input.restrictedEvidenceExcluded ? "yes" : "no"
    }`,
    "",
    "Metrics (non-suppressed only):",
    ...input.metrics.map(
      metric =>
        `- ${metric.label} [${metric.key}]: value=${metric.value}; direction=${
          metric.direction ?? "n/a"
        }; confidence=${metric.confidence}; evidence=${metric.evidenceCount}; relationships=${
          metric.relationshipCount
        }`
    ),
    "",
    "Visible themes only (threshold already applied — do not invent others):",
    ...(input.themes.length > 0
      ? input.themes.map(
          theme =>
            `- ${theme.label} [${theme.key}]: direction=${
              theme.direction ?? "n/a"
            }; posture=${theme.evidencePosture ?? "n/a"}; confidence=${
              theme.confidence
            }; evidence=${theme.evidenceCount}; relationships=${
              theme.relationshipCount
            }; summary=${theme.summary ?? "n/a"}`
        )
      : ["- None visible after privacy suppression."]),
    "",
    "Allowed visible theme labels (exclusive):",
    input.visibleThemeLabels && input.visibleThemeLabels.length > 0
      ? input.visibleThemeLabels.map(label => `- ${label}`).join("\n")
      : "- None",
    "",
    "Foundation / capability category roll-ups are excluded from this brief. Do not invent them.",
    "",
    "Draft priority areas (evidence-led, non-commercial):",
    ...(input.recommendations.length > 0
      ? input.recommendations.map(
          row =>
            `- ${row.title}: ${row.rationale} Suggested response: ${row.recommendation} Confidence: ${row.confidence}`
        )
      : ["- None yet."]),
    "",
    "Write the four-paragraph executive brief now.",
  ].join("\n");
}

export const ORGANISATION_INTELLIGENCE_RETRY_ADDON = [
  "Your previous draft was rejected by privacy and evidence validation.",
  "Remove any names, emails, telephone numbers and confidential references.",
  "Remove unsupported numbers and certainty or promotional language.",
  "Remove progress language (strengthening, improving, progressing) and difficulty language.",
  "Mention only visible theme labels supplied in the context.",
  "Stay inside the aggregate evidence supplied.",
  "Return plain text only.",
].join(" ");
