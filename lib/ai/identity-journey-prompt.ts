import { JOURNEY_NARRATIVE_INSTRUCTIONS } from "@/lib/ai/journey-narrative-instructions";

/**
 * Task prompt for Development Journey narrative synthesis.
 * Used with IDENTITY_SYSTEM_PROMPT (legacy internal name). Evidence is limited to approved session fields.
 * "Current Professional Identity" below is a coaching-concept section label, not product branding.
 */
export const IDENTITY_JOURNEY_TASK_PROMPT = `FOR DEVELOPMENT JOURNEY

You will receive structured evidence from approved coaching sessions only.

${JOURNEY_NARRATIVE_INSTRUCTIONS}

Produce two parts exactly in this format:

1. Current Professional Identity

Write one concise paragraph of 100 to 160 words describing the client's current professional identity.

Begin the paragraph with exactly:

Based on coaching conversations to date...

Use only the evidence provided. Do not invent progress. Do not diagnose. Do not infer personality traits. Do not predict future behaviour. Do not assess mental health.

Use only evidence supplied for the named coaching relationship.
Do not refer to any person not identified in the supplied relationship context.

Where evidence is limited, describe what is emerging rather than describing failure.

2. Coach Insights

Provide up to three suggested observations.

Every observation must begin on its own line with exactly:

Possible observation:

Then a single evidence-based sentence.

These are suggestions for the coach — never present them as facts.

If there is insufficient evidence for three observations, provide fewer.

Do not include any other sections, headings beyond those specified, markdown tables, or greetings.`;
