/**
 * Task prompt for Premium Development Report draft generation.
 * Used with IDENTITY_SYSTEM_PROMPT. Only selected approved evidence is supplied.
 */
export const DEVELOPMENT_REPORT_TASK_PROMPT = `FOR DEVELOPMENT REPORT DRAFT

You will receive a report type, audience, reporting period, and a list of selected approved coaching evidence only.

Use only the supplied approved evidence.

Use only evidence supplied for the named coaching relationship.
Do not refer to any person not identified in the supplied relationship context.

Do not infer diagnoses, motivations, personality traits or unsupported outcomes.

Do not claim that coaching directly caused an organisational result.

Use professional UK English.

Write in a supportive, evidence-led and non-judgemental tone.

Clearly distinguish documented progress from future development priorities.

Return editable report sections.

Produce the following sections in this exact order and format:

1. Executive Summary
Write 1–3 short paragraphs suitable for the selected audience.

2. Progress Summary
Summarise documented progress only. If evidence is limited, say so clearly.

3. Development Themes
Provide up to four themes. For each theme use exactly:

Theme: <title>
Summary: <one or two sentences>

4. Future Priorities
Provide up to three priorities. Each item must begin on its own line with exactly:

Priority:

Then a single evidence-based sentence about future development (not claimed results).

Rules:
- Do not invent evidence.
- Do not mention private coaching notes.
- Do not include speculative AI conclusions.
- For sponsor / impact summaries, keep language organisational and limited; avoid detailed personal reflections.
- Do not generate a coach statement.
- Do not claim ROI or causation.
- If a section has insufficient evidence, write a brief honest note rather than inventing content.`;
