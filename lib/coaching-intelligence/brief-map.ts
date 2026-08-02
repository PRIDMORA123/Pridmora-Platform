import type { PreparationAiBrief } from "@/lib/preparation-brief";
import { EMPTY_PREPARATION_AI_BRIEF } from "@/lib/preparation-brief";
import type { GeneratedPreparationBrief } from "@/types/coaching-intelligence";

export function emptyGeneratedBrief(): GeneratedPreparationBrief {
  return {
    previousConversation: null,
    outstandingActions: [],
    possibleFocus: null,
    purposeSuggestion: null,
    topicsToExplore: [],
    suggestedQuestions: [],
    desiredOutcomeSuggestion: null,
    coachingGuidance: null,
  };
}

/** Persist generated intelligence using the existing prep_ai_brief shape. */
export function generatedBriefToPreparationAiBrief(
  brief: GeneratedPreparationBrief,
  mode: "assisted" | "comprehensive"
): PreparationAiBrief {
  const questions = brief.suggestedQuestions.slice(
    0,
    mode === "assisted" ? 5 : 8
  );
  const primaryQuestions = questions.slice(0, 4);
  const additionalQuestions = questions.slice(4);

  const themes = [
    brief.possibleFocus
      ? { title: brief.possibleFocus, basis: "Suggested from reviewed evidence" }
      : null,
    ...brief.topicsToExplore.slice(0, 2).map(topic => ({
      title: topic,
      basis: "Suggested topic to explore",
    })),
  ].filter((item): item is { title: string; basis: string } => Boolean(item));

  const considerations =
    brief.coachingGuidance?.considerations.filter(Boolean) ?? [];

  return {
    ...EMPTY_PREPARATION_AI_BRIEF,
    themes: themes.slice(0, 3),
    exploration: [
      brief.previousConversation,
      brief.outstandingActions.length > 0
        ? `Outstanding actions: ${brief.outstandingActions.join("; ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
    questions: primaryQuestions,
    reflectionPrompt: brief.desiredOutcomeSuggestion ?? "",
    patterns:
      mode === "comprehensive"
        ? considerations.slice(0, 3).map(item => ({
            title: item.slice(0, 80),
            basis: item,
          }))
        : [],
    developmentDirection:
      mode === "comprehensive"
        ? brief.coachingGuidance?.framework ?? ""
        : "",
    historicalContext: [],
    additionalQuestions,
    removedSections: [],
  };
}

export function preparationAiBriefToGeneratedBrief(
  brief: PreparationAiBrief | null | undefined
): GeneratedPreparationBrief {
  if (!brief) return emptyGeneratedBrief();

  const suggestedQuestions = [
    ...brief.questions,
    ...brief.additionalQuestions,
  ].filter(Boolean);

  return {
    previousConversation: brief.exploration || null,
    outstandingActions: [],
    possibleFocus: brief.themes[0]?.title ?? null,
    purposeSuggestion: brief.themes[0]?.title ?? null,
    topicsToExplore: brief.themes.map(theme => theme.title).filter(Boolean),
    suggestedQuestions,
    desiredOutcomeSuggestion: brief.reflectionPrompt || null,
    coachingGuidance:
      brief.developmentDirection || brief.patterns.length > 0
        ? {
            framework: brief.developmentDirection || null,
            considerations: brief.patterns.map(
              pattern => pattern.basis || pattern.title
            ),
          }
        : null,
  };
}
