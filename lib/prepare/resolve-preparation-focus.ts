/**
 * Preparation focus hierarchy using existing fields only.
 * Development focus (longitudinal) must never be replaced by session focus.
 */

export function resolveDevelopmentFocus(input: {
  profileCurrentFocus?: string | null;
  clientCurrentFocus?: string | null;
}): string {
  return (
    input.profileCurrentFocus?.trim() ||
    input.clientCurrentFocus?.trim() ||
    ""
  );
}

/**
 * Conversation focus for this session.
 * Coach-authored prep_purpose / focus wins when deliberate; otherwise AI/adapter.
 */
export function resolveConversationFocus(input: {
  prepPurpose?: string | null;
  sessionFocus?: string | null;
  aiSuggestion?: string | null;
  intelligenceSuggestion?: string | null;
  adapterSuggestion?: string | null;
  briefSummary?: string | null;
  isFirstSession?: boolean;
  isBoilerplate?: (value: string) => boolean;
}): string {
  const prepPurpose = input.prepPurpose?.trim() || "";
  const sessionFocus = input.sessionFocus?.trim() || "";
  const stored = prepPurpose || sessionFocus;
  const isBoilerplate = input.isBoilerplate ?? (() => false);
  const storedIsBoilerplate = Boolean(stored && isBoilerplate(stored));
  const coachAuthored = Boolean(
    stored && (input.isFirstSession || !storedIsBoilerplate)
  );

  if (coachAuthored) return stored;

  if (input.isFirstSession) {
    return (
      stored ||
      input.adapterSuggestion?.trim() ||
      input.intelligenceSuggestion?.trim() ||
      input.briefSummary?.trim() ||
      ""
    );
  }

  return (
    input.aiSuggestion?.trim() ||
    input.intelligenceSuggestion?.trim() ||
    input.adapterSuggestion?.trim() ||
    (storedIsBoilerplate ? "" : stored) ||
    input.briefSummary?.trim() ||
    ""
  );
}

/** Retired adapter fallbacks — must not be the normal path when evidence exists. */
export const RETIRED_GENERIC_PREPARATION_FALLBACK_QUESTIONS = [
  "Where does the current development edge feel most alive in day-to-day work?",
  "What would be most useful to clarify about the current development priority?",
  "What would make this conversation useful given where development currently stands?",
] as const;

export function isRetiredGenericPreparationFallbackQuestion(
  value: string
): boolean {
  const normalised = value.replace(/\s+/g, " ").trim().toLocaleLowerCase("en-GB");
  return RETIRED_GENERIC_PREPARATION_FALLBACK_QUESTIONS.some(
    item => item.toLocaleLowerCase("en-GB") === normalised
  );
}
