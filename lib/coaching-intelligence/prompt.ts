import {
  getModePrompt,
  PREPARATION_INTELLIGENCE_PROMPT,
} from "@/lib/coaching-intelligence/rules";
import type { ResolvedIntelligenceSources } from "@/lib/coaching-intelligence/resolve-sources";
import {
  buildIsolationRetryPromptAddon,
  buildRelationshipIsolationPromptBlock,
  RELATIONSHIP_AI_PROMPT_RULE,
} from "@/lib/relationship-scope";

export function buildPreparationIntelligenceInstructions(input: {
  mode: "assisted" | "comprehensive";
  clientDisplayName: string;
  isolationRetry?: boolean;
}) {
  return [
    PREPARATION_INTELLIGENCE_PROMPT.trim(),
    getModePrompt(input.mode).trim(),
    "",
    RELATIONSHIP_AI_PROMPT_RULE.trim(),
    "",
    buildRelationshipIsolationPromptBlock(input.clientDisplayName),
    input.isolationRetry
      ? `\n${buildIsolationRetryPromptAddon(input.clientDisplayName)}`
      : "",
    "",
    "Return valid JSON only with this shape:",
    `{
  "previousConversation": "string or null",
  "outstandingActions": ["..."],
  "possibleFocus": "string or null",
  "purposeSuggestion": "string or null",
  "topicsToExplore": ["..."],
  "suggestedQuestions": ["..."],
  "desiredOutcomeSuggestion": "string or null",
  "coachingGuidance": {
    "framework": "string or null",
    "considerations": ["..."]
  } | null
}`,
  ].join("\n");
}

export function buildPreparationIntelligenceInput(input: {
  mode: "assisted" | "comprehensive";
  personContext: string;
  coachingPurpose: string;
  sources: ResolvedIntelligenceSources;
  clientDisplayName: string;
  isolationRetry?: boolean;
}): string {
  const maxQuestions = input.mode === "assisted" ? 5 : 8;

  return [
    `Coaching intelligence mode: ${input.mode}`,
    `Maximum suggested questions: ${maxQuestions}`,
    "",
    buildRelationshipIsolationPromptBlock(input.clientDisplayName),
    input.isolationRetry
      ? `\n${buildIsolationRetryPromptAddon(input.clientDisplayName)}`
      : "",
    "",
    "Person context:",
    input.personContext || "None recorded.",
    "",
    "Coaching purpose:",
    input.coachingPurpose || "Not recorded.",
    "",
    "Previous conversations:",
    input.sources.previousConversations.length > 0
      ? input.sources.previousConversations
          .map(item =>
            [
              `Conversation ${item.sessionNumber}`,
              item.date ? `Date: ${item.date}` : "",
              item.focus ? `Focus: ${item.focus}` : "",
              item.summary ? `Summary: ${item.summary}` : "",
              item.commitments ? `Commitments: ${item.commitments}` : "",
              item.emergingThemes ? `Themes: ${item.emergingThemes}` : "",
            ]
              .filter(Boolean)
              .join("\n")
          )
          .join("\n\n")
      : "None available.",
    "",
    "Approved summaries:",
    input.sources.approvedSummaries.length > 0
      ? input.sources.approvedSummaries
          .map(item => item.summary)
          .join("\n\n")
      : "None available.",
    "",
    "Open commitments:",
    input.sources.openCommitments.length > 0
      ? input.sources.openCommitments
          .map(item =>
            item.dueDate
              ? `${item.statement} (due ${item.dueDate})`
              : item.statement
          )
          .join("\n")
      : "None recorded.",
    "",
    "Approved reflections (shareable only):",
    input.sources.approvedReflections.length > 0
      ? input.sources.approvedReflections
          .map(item => item.summary)
          .join("\n\n")
      : "None available.",
    "",
    "Journey evidence:",
    input.sources.journeyEvidence.length > 0
      ? input.sources.journeyEvidence
          .map(item =>
            [item.focus, item.summary].filter(Boolean).join(" — ")
          )
          .join("\n")
      : "None available.",
    "",
    "Development themes:",
    input.sources.developmentThemes.length > 0
      ? input.sources.developmentThemes.join("; ")
      : "None available.",
    "",
    "Approved reports:",
    input.sources.approvedReports.length > 0
      ? input.sources.approvedReports
          .map(item => `${item.title}\n${item.summary}`)
          .join("\n\n")
      : "None available.",
    "",
    "Private coach notes are excluded and must not be invented or requested.",
  ].join("\n");
}
