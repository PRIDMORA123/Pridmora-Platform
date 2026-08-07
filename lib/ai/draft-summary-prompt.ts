import { IDENTITY_SYSTEM_PROMPT } from "@/lib/ai/identity-system-prompt";

export type DraftSummaryDepthMode = "standard" | "comprehensive";

/**
 * Function-specific draft summary instructions.
 * Section purposes are distinct. Prevent material cross-section repetition.
 */
export function buildDraftSummaryInstructions(
  depthMode: DraftSummaryDepthMode = "standard"
): string {
  const isComprehensive = depthMode === "comprehensive";

  return `${IDENTITY_SYSTEM_PROMPT}

FOR THIS REQUEST — DRAFT SESSION SUMMARY OUTPUT FORMAT

When a Coaching Boundary Alert is required, include it as:
"coachingBoundaryAlert": "..."

Otherwise omit that field.

Return valid JSON only. Do not return numbered plain-text sections.
Do not include markdown headings.
Do not include dash-prefixed strings inside paragraph values.
Do not include section numbering inside any value.

Depth mode for this draft: ${isComprehensive ? "COMPREHENSIVE" : "STANDARD"}

Return ONLY valid JSON matching this shape:

{
  "sessionSummary": "objective summary of the conversation",
  "keyInsights": [
    {
      "title": "short theme title",
      "description": "interpretation supported by evidence"
    }
  ],
  "strengths": [
    {
      "title": "short strength title",
      "description": "behaviour + evidence + why it matters"
    }
  ],
  "developmentEvidence": [
    {
      "title": "short evidence title",
      "description": "previous pattern → current behaviour → development implication"
    }
  ],
  "coachingContext": "what should matter next time the manager works with this person",
  "commitments": [
    "explicitly agreed action"
  ],
  "possibleNextFocus": [
    "possible area for exploration"
  ],
  "evidenceQualification": "optional note when evidence is limited"${
    isComprehensive
      ? `,
  "comprehensive": {
    "developmentTrajectory": "how behaviour is changing across conversations",
    "behaviouralPatterns": [
      { "title": "pattern", "description": "supported longitudinal pattern" }
    ],
    "evidenceConfidenceNote": "why confidence is low, moderate or strong — no percentage",
    "evidenceCoverageNote": "what evidence types are represented or missing — no percentage",
    "contradictoryOrLimitedEvidence": [
      "what should not yet be over-interpreted"
    ],
    "developmentRisks": [
      "where progress may not yet be embedded"
    ],
    "recommendedNextConversation": "useful next development conversation focus"
  }`
      : ""
  }
}

SECTION PURPOSES — each section must add distinct value

sessionSummary:
- Question: What happened and what mattered?
- Context only.
- ${isComprehensive ? "Richer contextual summary up to 220 words." : "100–150 words."}
- Do not repeat detailed development interpretation already shown in later sections.

keyInsights:
- Question: What did we learn?
- Maximum 3.
- Each insight is an interpretation supported by evidence.
- Not tags. Not duplicated evidence. Not another summary.

strengths:
- Question: What positive management behaviour was actually demonstrated?
- Each strength needs behaviour, evidence and why it matters.
- Do not repeat Key Insight language.

developmentEvidence:
- Question: What observable change demonstrates development?
- Behavioural proof.
- Where possible compare previous pattern → current behaviour → development implication.
- Do not restate strengths or insights using different wording.

coachingContext:
- Question: What should matter when the manager next works with this person?
- Forward-looking management context only.

commitments:
- Only explicitly agreed actions.

possibleNextFocus:
- Question: What would be useful to explore next?
- Do not prescribe solutions.

${
  isComprehensive
    ? `COMPREHENSIVE REQUIREMENTS
- Populate the comprehensive object with longitudinal development intelligence.
- Use cross-conversation context where the notes support it.
- Include Evidence Confidence and Evidence Coverage notes without percentages.
- Surface contradictory or limited evidence honestly.
- Do not invent history. If longitudinal evidence is thin, say so.
- Comprehensive must add structural depth, not merely more prose.`
    : `STANDARD REQUIREMENTS
- Stay concise for everyday management use.
- Omit the comprehensive object entirely.
- Prefer clarity over completeness.`
}

Do not invent headings.
Do not repeat the same point across multiple sections.
Do not address the client directly.
Do not begin with greetings.
Do not write the output as an email or letter.

Return JSON only.`;
}

/** @deprecated Prefer buildDraftSummaryInstructions(depthMode) */
export const DRAFT_SUMMARY_INSTRUCTIONS = buildDraftSummaryInstructions("standard");

export function buildDraftSummaryInput(
  notes: string,
  depthMode: DraftSummaryDepthMode = "standard"
): string {
  return [
    "Create a draft Session Summary & Insights record from the conversation notes below.",
    `Use ${depthMode === "comprehensive" ? "COMPREHENSIVE" : "STANDARD"} depth.`,
    "Return valid JSON only.",
    "",
    "CONVERSATION NOTES",
    notes.trim(),
  ].join("\n");
}
