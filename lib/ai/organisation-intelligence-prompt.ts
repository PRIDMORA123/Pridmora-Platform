/**
 * Organisation Intelligence executive brief prompt.
 * Receives aggregated anonymised evidence only.
 */

export const ORGANISATION_INTELLIGENCE_SYSTEM_PROMPT = `You write executive development intelligence briefs for authorised organisational leaders using Pridmora.

You receive anonymised aggregated coaching evidence only.

You must never invent people, events, percentages or commercial recommendations.

Write in natural UK English.
Do not use unnecessary dashes.
Do not use an Oxford comma unless needed for clarity.
Do not use GPT-style headings or dramatic phrasing.
Do not claim certainty beyond the evidence.
Do not assess individuals.
Do not recommend Pridmora products or programmes.

Use language such as:
- Evidence suggests
- A recurring pattern is emerging
- The available evidence indicates
- There is not yet enough evidence to conclude

Avoid:
- The organisation is
- This proves
- AI predicts with certainty
- Definitive
- Guaranteed
- Coaching caused
- Coaching delivered

Structure the brief as exactly four short paragraphs and no more than 250 words:
1. What is improving
2. What requires attention
3. What is stable or uncertain
4. Recommended next focus

Every paragraph must stay within the supplied metrics, themes, confidence levels and suppression status.
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
};

export function buildOrganisationIntelligencePromptInput(
  input: OrganisationIntelligencePromptInput
): string {
  return [
    "Organisation intelligence aggregate context (anonymised):",
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
    "Metrics:",
    ...input.metrics.map(
      metric =>
        `- ${metric.label} [${metric.key}]: value=${metric.value}; direction=${
          metric.direction ?? "n/a"
        }; confidence=${metric.confidence}; evidence=${metric.evidenceCount}; relationships=${
          metric.relationshipCount
        }; suppressed=${metric.suppressed ? "yes" : "no"}`
    ),
    "",
    "Visible themes (threshold already applied):",
    ...(input.themes.length > 0
      ? input.themes.map(
          theme =>
            `- ${theme.label} [${theme.key}]: direction=${
              theme.direction ?? "n/a"
            }; confidence=${theme.confidence}; evidence=${theme.evidenceCount}; relationships=${
              theme.relationshipCount
            }; summary=${theme.summary ?? "n/a"}`
        )
      : ["- None visible after privacy suppression."]),
    "",
    "Capability trends:",
    ...input.capabilities.map(
      capability =>
        `- ${capability.label}: direction=${capability.direction}; confidence=${capability.confidence}; evidence=${capability.evidenceCount}; relationships=${capability.relationshipCount}; suppressed=${
          capability.suppressed ? "yes" : "no"
        }`
    ),
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
  "Stay inside the aggregate evidence supplied.",
  "Return plain text only.",
].join(" ");
