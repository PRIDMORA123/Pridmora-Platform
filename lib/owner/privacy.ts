/**
 * Owner Console privacy guards.
 * Operational metadata and counts are allowed.
 * Confidential coaching / development content must never be returned.
 */

const FORBIDDEN_OWNER_RESPONSE_KEYS = [
  "private_notes",
  "privateNotes",
  "summary_text",
  "summaryText",
  "ai_summary",
  "aiSummary",
  "coach_notes",
  "coachNotes",
  "reflection",
  "reflections",
  "conversation_text",
  "conversationText",
  "transcript",
  "evidence_text",
  "evidenceText",
  "preparation_brief",
  "preparationBrief",
  "development_notes",
  "developmentNotes",
  "password",
  "password_hash",
  "cvv",
  "cvc",
  "card_number",
  "pan",
];

export function assertOwnerPayloadIsSafe(
  payload: unknown,
  path = "root"
): void {
  if (payload === null || payload === undefined) return;

  if (Array.isArray(payload)) {
    payload.forEach((item, index) =>
      assertOwnerPayloadIsSafe(item, `${path}[${index}]`)
    );
    return;
  }

  if (typeof payload !== "object") return;

  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    if (
      FORBIDDEN_OWNER_RESPONSE_KEYS.some(
        forbidden => forbidden.toLowerCase() === key.toLowerCase()
      )
    ) {
      throw new Error(
        `Owner Console must not expose confidential field "${key}" at ${path}`
      );
    }
    assertOwnerPayloadIsSafe(value, `${path}.${key}`);
  }
}

/** Routes/content selectors that must never appear in owner API source. */
export const OWNER_FORBIDDEN_CONTENT_SELECTORS = [
  "private_notes",
  "summary_text",
  "ai_summary",
  "coach_notes",
  "reflection_text",
  "transcript",
] as const;
