import { IDENTITY_SYSTEM_PROMPT } from "@/lib/ai/identity-system-prompt";

/**
 * Function-specific draft summary instructions.
 * Preserves evidence and safety rules from IDENTITY_SYSTEM_PROMPT (legacy internal name),
 * and requires structured JSON for Summary & Insights rendering.
 */
export const DRAFT_SUMMARY_INSTRUCTIONS = `${IDENTITY_SYSTEM_PROMPT}

FOR THIS REQUEST — DRAFT SESSION SUMMARY OUTPUT FORMAT

When a Coaching Boundary Alert is required, include it as:
"coachingBoundaryAlert": "..."

Otherwise omit that field.

Return valid JSON only. Do not return numbered plain-text sections.
Do not include markdown headings.
Do not include dash-prefixed strings inside paragraph values.
Do not include section numbering inside any value.

Return ONLY valid JSON matching this shape:

{
  "sessionSummary": "objective summary of the conversation",
  "keyInsights": [
    {
      "title": "short theme title",
      "description": "supported insight in one short paragraph"
    }
  ],
  "strengths": [
    {
      "title": "short strength title",
      "description": "evidence-backed strength description"
    }
  ],
  "developmentEvidence": [
    {
      "title": "short evidence title",
      "description": "supported development evidence"
    }
  ],
  "coachingContext": "short paragraph of clearly evidenced contextual factors",
  "commitments": [
    "explicitly agreed action"
  ],
  "possibleNextFocus": [
    "possible area for exploration"
  ],
  "evidenceQualification": "optional note when evidence is limited"
}

Limits:
- sessionSummary: maximum 120 words
- keyInsights: maximum 4
- strengths: maximum 3
- developmentEvidence: maximum 3
- commitments: maximum 4
- possibleNextFocus: maximum 3
- each description: maximum 55 words

Content rules for this JSON (in addition to the evidence rules above):

sessionSummary:
- Provide an objective summary.
- Describe what was discussed without unsupported interpretation.
- Do not force professional-identity, confidence, resilience, values or career-grief narratives unless evidenced.

keyInsights:
- Identify themes supported by the notes.
- Themes may relate to leadership, management, communication, delegation, accountability, relationships, decision-making, workload, professional identity, career development or another supported coaching context.
- Do not include a theme merely because it appears in these instructions.

strengths:
- Include only strengths or capabilities directly evidenced in the notes.
- If insufficient evidence, return an empty array and set evidenceQualification accordingly.

developmentEvidence:
- Describe supported evidence of increased awareness, attempted behaviour, learning, changed behaviour, or progress against an agreed objective.
- Distinguish Emerging, Developing and Demonstrated where relevant.
- Do not describe awareness or intention as demonstrated change.
- If no development evidence is present, return an empty array and explain the limitation in evidenceQualification.

coachingContext:
- Summarise clearly evidenced contextual factors only.
- Do not force professional identity, values, confidence, resilience or career grief when they are not relevant.
- If none are evidenced, return an empty string.

commitments:
- Only include actions explicitly agreed during the session.
- Do not invent actions.
- Distinguish ideas discussed and possible actions from explicitly agreed actions.
- If none were agreed, return an empty array.

possibleNextFocus:
- Provide possible areas for exploration based on the supplied evidence.
- Do not prescribe solutions.
- Do not tell the coach what they must do.

Do not invent headings.
Do not repeat the same point across multiple sections unless necessary for clarity.
Do not address the client directly.
Do not begin with greetings.
Do not write the output as an email or letter.

Return JSON only.`;

export function buildDraftSummaryInput(notes: string): string {
  return [
    "Create a draft Session Summary & Insights record from the coaching notes below.",
    "Return valid JSON only.",
    "",
    "COACHING NOTES",
    notes.trim(),
  ].join("\n");
}
