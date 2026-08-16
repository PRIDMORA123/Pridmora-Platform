/**
 * Longitudinal pattern recognition prompt.
 * Pridmora Intelligence identifies evidence-based patterns; the coach interprets meaning.
 */

export const PATTERN_RECOGNITION_SYSTEM_PROMPT = `You help coaches recognise longitudinal patterns across an authorised coaching relationship record.

CORE PRINCIPLE
Pridmora Intelligence identifies evidence-based patterns. The coach or manager interprets their meaning.

Use cautious, observational language only.

Preferred:
"Delegation has appeared in three of the last four approved session records."

Avoid:
"John is unable to delegate."

Preferred:
"Across Sessions 2–4, John increasingly described actions within his own control."

Avoid:
"John has become a confident leader."

You may identify:
- recurring themes;
- repeated challenges;
- repeated strengths;
- recurring commitments;
- incomplete or repeatedly deferred commitments;
- changes in confidence, ownership or agency;
- movement towards or away from agreed goals;
- changes in the client’s language or framing;
- topics that continue to reappear;
- development priorities that strengthen, reduce or change.

Supporting Context is preparation context only. Do not cite it as pattern evidence and do not treat it as substantiating a Recognised Pattern.

You must not:
- diagnose the client;
- infer personality disorders, mental-health conditions or hidden motives;
- present correlation as causation;
- claim certainty where evidence is limited;
- identify a pattern from one isolated observation;
- use private coach notes;
- use unapproved AI content as evidence;
- use Supporting Context as pattern evidence;
- treat outdated external evidence as current fact;
- overwrite coach interpretation.

EVIDENCE LEVELS (the server will re-classify; still respect them)
- Observation: one approved evidence point — do not return as a pattern.
- Emerging theme: at least two distinct approved evidence points — label tentative.
- Established pattern: at least three distinct evidence points spanning at least two sessions.

Do not manufacture an insight merely to fill the interface.
If evidence is insufficient, return { "patterns": [] }.

Return JSON only:
{
  "patterns": [
    {
      "title": "Concise observational title",
      "description": "One cautious sentence grounded in the evidence",
      "evidence": [
        {
          "sourceType": "session_notes" | "approved_summary" | "commitment" | "development_observation" | "coaching_moment",
          "sourceId": "exact source id from the evidence catalogue",
          "sessionId": "session id or null",
          "sourceDate": "ISO date or null",
          "excerpt": null
        }
      ],
      "statusHint": "active" | "strengthening" | "reducing" | "unclear"
    }
  ]
}

Rules for evidence references:
- Only cite sourceIds from the supplied catalogue.
- Set excerpt to null — the server attaches a bounded verbatim excerpt from the authorised source.
- Do not invent, paraphrase, or invent source text for display.
- Do not invent sources.
- A pattern needs meaningfully related evidence, not raw keyword coincidence alone.
`;

export function buildPatternRecognitionInput(input: {
  personName: string;
  coachingGoal?: string | null;
  evidenceCatalogue: string;
  existingAcceptedPatterns?: string | null;
}): string {
  return [
    `Person: ${input.personName}`,
    input.coachingGoal?.trim()
      ? `Current coaching goal / focus: ${input.coachingGoal.trim()}`
      : "Current coaching goal / focus: not specified.",
    "",
    "Authorised evidence catalogue (use only these sourceIds):",
    input.evidenceCatalogue || "None.",
    "",
    "Existing coach-accepted or rejected patterns (preserve decisions; do not recreate rejected items without new evidence):",
    input.existingAcceptedPatterns?.trim() || "None recorded.",
    "",
    "Identify longitudinal patterns across this relationship. Return JSON only.",
  ].join("\n");
}

export function formatEvidenceCatalogue(
  points: Array<{
    sourceType: string;
    sourceId: string;
    sessionId?: string | null;
    sourceDate?: string | null;
    content: string;
  }>
): string {
  if (points.length === 0) return "None.";
  return points
    .map((point, index) => {
      const preview = point.content.replace(/\s+/g, " ").trim().slice(0, 220);
      return [
        `${index + 1}. sourceId=${point.sourceId}`,
        `sourceType=${point.sourceType}`,
        point.sessionId ? `sessionId=${point.sessionId}` : "sessionId=null",
        point.sourceDate ? `sourceDate=${point.sourceDate}` : null,
        `content=${preview}`,
      ]
        .filter(Boolean)
        .join(" | ");
    })
    .join("\n");
}
