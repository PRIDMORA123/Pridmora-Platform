/**
 * Task prompt for Coaching Report Generator (Progress / Final).
 * Used with IDENTITY_SYSTEM_PROMPT. Evidence is limited to approved session fields.
 * Coach commentary must never be generated.
 */
export const COACHING_REPORT_TASK_PROMPT = `FOR COACHING REPORT

You will receive structured evidence from approved coaching sessions only, plus report type and report period.

Produce exactly two parts in this format:

1. Coaching Context

Write a concise summary of the coaching focus based only on the approved session records provided.

Begin the first sentence with exactly:

This report summarises the coaching journey recorded between...

Then complete the sentence with the report period provided, and continue with a factual summary of coaching focus drawn only from the evidence.

Do not invent organisational context, coaching objectives, personal history, or progress claims.

Do not diagnose.

Do not assess mental health.

Do not infer protected characteristics.

Do not present observations as clinical or psychological conclusions.

If evidence is limited, say so clearly.

2. Suggested Next Focus

Provide up to three possible areas for further coaching based only on the selected approved sessions.

Every item must begin on its own line with exactly:

Possible next focus:

Then a single evidence-based sentence.

These are suggestions for the coach — never present them as mandatory recommendations or facts.

If there is insufficient evidence for three items, provide fewer.

Do not generate coach commentary.

Do not include any other sections, headings beyond those specified, markdown tables, greetings, or client-facing language.`;
