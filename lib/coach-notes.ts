/**
 * Protect human-entered coaching text from legacy workflow metadata.
 * Workflow envelopes must never be shown or re-saved into coach-facing fields.
 */

import { COMPREHENSIVE_MARKER } from "@/lib/summary-insights/types";

export const WORKFLOW_MARKER = "---IDENTITY_WORKFLOW_V1---";

export type LegacyWorkflowPayload = {
  status?: string;
  title?: string;
  durationMinutes?: number;
  location?: string;
  completedAt?: string;
  notesSavedAt?: string;
  summaryStatus?: string;
  prepPurpose?: string;
  prepTopics?: string;
  prepQuestions?: string;
  prepCommitmentsReview?: string;
  prepRisks?: string;
  prepPrivateNotes?: string;
  commitments?: string;
  parkingLot?: string;
  outcomes?: string;
  reflectWhatShifted?: string;
  reflectWhatSurprised?: string;
  reflectWhatWorked?: string;
  reflectDifferently?: string;
  reflectProfessionalLearning?: string;
  reflectPrivate?: string;
};

export function extractVisibleCoachNotes(
  storedValue: string | null | undefined
): string {
  if (!storedValue) return "";

  let text = storedValue;
  const workflowIndex = text.indexOf(WORKFLOW_MARKER);
  if (workflowIndex !== -1) {
    text = text.slice(0, workflowIndex);
  }
  const comprehensiveIndex = text.indexOf(COMPREHENSIVE_MARKER);
  if (comprehensiveIndex !== -1) {
    text = text.slice(0, comprehensiveIndex);
  }
  // Never show residual internal tokens.
  text = text.replace(/\[\[[^\]]*\]\]/g, "");
  return text.trim();
}

export function parseLegacyWorkflowPayload(
  storedValue: string | null | undefined
): LegacyWorkflowPayload | null {
  if (!storedValue) return null;

  const markerIndex = storedValue.indexOf(WORKFLOW_MARKER);

  if (markerIndex === -1) return null;

  const rawPayload = storedValue
    .slice(markerIndex + WORKFLOW_MARKER.length)
    .trim();

  if (!rawPayload) return null;

  try {
    return JSON.parse(rawPayload) as LegacyWorkflowPayload;
  } catch (error) {
    // Never surface parsing failures to coaches.
    console.error("Failed to parse legacy workflow payload", {
      error: error instanceof Error ? error.message : "unknown",
      payloadLength: rawPayload.length,
    });
    return null;
  }
}

export function containsWorkflowMetadata(value: string | null | undefined): boolean {
  if (!value) return false;
  if (value.includes(WORKFLOW_MARKER)) return true;
  const trimmed = value.trim();
  return (
    trimmed.startsWith('{"status":') ||
    trimmed.startsWith('{"conversationId":')
  );
}

export function validateHumanTextField(value: string, fieldName: string): void {
  if (value.includes(WORKFLOW_MARKER)) {
    throw new Error(`${fieldName} contains prohibited workflow metadata.`);
  }

  const trimmed = value.trim();

  if (
    trimmed.startsWith('{"status":') ||
    trimmed.startsWith('{"conversationId":')
  ) {
    throw new Error(`${fieldName} appears to contain a workflow payload.`);
  }
}

const HUMAN_TEXT_FIELDS = [
  "preparation",
  "prepPurpose",
  "prepTopics",
  "prepQuestions",
  "prepCommitmentsReview",
  "prepRisks",
  "prepPrivateNotes",
  "notes",
  "commitments",
  "parkingLot",
  "reflection",
  "reflectWhatShifted",
  "reflectWhatSurprised",
  "reflectWhatWorked",
  "reflectDifferently",
  "reflectProfessionalLearning",
  "reflectPrivate",
  "summary",
  "emergingThemes",
  "strengthsObserved",
  "valuesBecomingVisible",
  "professionalIdentityDevelopment",
  "agreedActions",
  "outcomes",
  "suggestedFocus",
  "coachReflection",
  "focus",
  "title",
  "location",
] as const;

export type HumanTextSessionFields = Record<
  (typeof HUMAN_TEXT_FIELDS)[number],
  string
>;

/**
 * Strip legacy envelopes from any human-readable session text fields
 * and validate that no workflow payload remains.
 */
export function sanitizeSessionHumanTextFields<T extends Partial<HumanTextSessionFields>>(
  session: T
): T {
  const next = { ...session };

  for (const field of HUMAN_TEXT_FIELDS) {
    const value = next[field];
    if (typeof value !== "string") continue;
    const cleaned = extractVisibleCoachNotes(value);
    validateHumanTextField(cleaned, field);
    (next as Record<string, string>)[field] = cleaned;
  }

  return next;
}
