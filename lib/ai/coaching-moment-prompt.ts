import { IDENTITY_SYSTEM_PROMPT } from "@/lib/ai/identity-system-prompt";

export const COACHING_MOMENT_PREPARATION_PROMPT = `${IDENTITY_SYSTEM_PROMPT}

---

FUNCTION: Coaching Moment preparation

Support a coach or manager preparing for a brief workplace coaching interaction.

The user needs concise, practical support that can be reviewed in under 30 seconds.

Use only the authorised relationship evidence supplied.

Produce:

- one clear intention;
- one optional opening statement;
- no more than three open questions;
- one practical consideration;
- one relevant accepted pattern or commitment only where directly useful.

Do not:

- diagnose;
- infer hidden motives;
- overstate the evidence;
- use generic question banks;
- overwhelm the user;
- produce a full coaching plan;
- treat the interaction as a formal coaching session;
- create a pattern from this interaction alone;
- use private notes;
- use unauthorised Supporting Context.

If confidence in the conversation type is low, set inferredType to "general".

Use calm, professional British English.

Return valid JSON only:

{
  "inferredType": "feedback | delegation | accountability | difficult_conversation | recognition | performance | conflict | wellbeing | career | change | stakeholder | check_in | general",
  "intention": "...",
  "opening": "... or null",
  "questions": ["...", "...", "..."],
  "consideration": "... or null",
  "relevantContext": {
    "title": "...",
    "description": "...",
    "evidenceIds": ["..."]
  } or null
}
`;

export const COACHING_MOMENT_INSIGHT_PROMPT = `${IDENTITY_SYSTEM_PROMPT}

---

FUNCTION: Coaching Moment insight

Create a concise draft insight from a completed Coaching Moment.

Use only:

- the user’s saved outcome notes;
- explicitly agreed commitment;
- follow-up;
- authorised relationship evidence needed to establish continuity.

Produce:

- a concise interaction summary;
- the confirmed commitment, if any;
- a cautious connection to an accepted or emerging pattern, if supported;
- one optional follow-up question.

Do not create a full session summary.
Do not diagnose.
Do not invent outcomes.
Do not create a longitudinal pattern from this interaction alone.
Do not expose private notes.
Do not create values, strengths, identity-development or personality sections unless directly supported and genuinely relevant.

Use calm, professional British English.

Return valid JSON only:

{
  "summary": "...",
  "commitment": "... or null",
  "patternConnection": "... or null",
  "followUpQuestion": "... or null"
}
`;

export function buildCoachingMomentPreparationInput(input: {
  personName: string;
  organisation?: string | null;
  role?: string | null;
  situation: string;
  desiredOutcome?: string | null;
  authorisedEvidence: string;
  acceptedPatterns?: string | null;
  confirmedCommitments?: string | null;
}): string {
  return [
    "Prepare guidance for a brief Coaching Moment.",
    "",
    `Person: ${input.personName}`,
    input.organisation ? `Organisation: ${input.organisation}` : "",
    input.role ? `Role: ${input.role}` : "",
    "",
    "Current situation (user-entered):",
    input.situation.trim(),
    "",
    input.desiredOutcome?.trim()
      ? `Desired outcome (optional, user-entered):\n${input.desiredOutcome.trim()}`
      : "Desired outcome: not provided.",
    "",
    "Authorised relationship evidence:",
    input.authorisedEvidence.trim() || "None supplied.",
    "",
    "Accepted patterns (coach-reviewed only):",
    input.acceptedPatterns?.trim() || "None.",
    "",
    "Confirmed commitments:",
    input.confirmedCommitments?.trim() || "None.",
    "",
    "Remember: private notes and unauthorised supporting context are not available.",
  ]
    .filter(line => line !== undefined)
    .join("\n");
}

export function buildCoachingMomentInsightInput(input: {
  personName: string;
  situation: string;
  desiredOutcome?: string | null;
  outcomeNotes?: string | null;
  agreedCommitment?: string | null;
  noCommitmentAgreed?: boolean;
  followUp?: string | null;
  inferredType?: string | null;
  authorisedEvidence?: string | null;
  acceptedPatterns?: string | null;
}): string {
  return [
    "Create a concise draft insight for a saved Coaching Moment.",
    "",
    `Person: ${input.personName}`,
    input.inferredType ? `Inferred type: ${input.inferredType}` : "",
    "",
    `Situation prepared for:\n${input.situation.trim()}`,
    input.desiredOutcome?.trim()
      ? `Desired outcome:\n${input.desiredOutcome.trim()}`
      : "",
    "",
    `What happened:\n${input.outcomeNotes?.trim() || "Not recorded."}`,
    input.noCommitmentAgreed
      ? "Commitment: none agreed."
      : `Agreed commitment:\n${input.agreedCommitment?.trim() || "None recorded."}`,
    input.followUp?.trim()
      ? `Follow-up:\n${input.followUp.trim()}`
      : "Follow-up: none.",
    "",
    "Authorised continuity evidence:",
    input.authorisedEvidence?.trim() || "None.",
    "",
    "Accepted patterns:",
    input.acceptedPatterns?.trim() || "None.",
    "",
    "Do not use private notes. Do not invent outcomes.",
  ]
    .filter(Boolean)
    .join("\n");
}
