export type PreparationTheme = {
  title: string;
  basis?: string;
};

export type PreparationIntelligence = {
  themes?: PreparationTheme[];
  exploration?: string;
  questions?: string[];
  reflectionPrompt?: string;
  developmentDirection?: string;
  outstandingCommitments?: string[];
};

export type CoachPreparationDraft = {
  purpose: string;
  desiredOutcome: string;
  topics: string[];
  questions: string[];
  reminders: string;
};

export type DraftSource = "coach" | "intelligence" | "empty";

const MAX_TOPICS = 4;
const MAX_QUESTIONS = 4;

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueStrings(values: unknown[], limit?: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const cleaned = cleanText(value);

    if (!cleaned) {
      continue;
    }

    const comparisonKey = cleaned.toLocaleLowerCase("en-GB");

    if (seen.has(comparisonKey)) {
      continue;
    }

    seen.add(comparisonKey);
    result.push(cleaned);

    if (limit && result.length >= limit) {
      break;
    }
  }

  return result;
}

function removeQuestionLikeTopics(values: string[]): string[] {
  return values.filter((value) => {
    const cleaned = value.trim();

    if (!cleaned) {
      return false;
    }

    if (cleaned.endsWith("?")) {
      return false;
    }

    if (cleaned.length > 80) {
      return false;
    }

    const wordCount = cleaned.split(/\s+/).length;

    return wordCount <= 10;
  });
}

function derivePurpose(
  intelligence: PreparationIntelligence,
): string {
  const exploration = cleanText(intelligence.exploration);

  if (exploration) {
    return exploration;
  }

  const themes = removeQuestionLikeTopics(
    uniqueStrings(
      (intelligence.themes ?? []).map((theme) => theme.title),
      3,
    ),
  );

  if (!themes.length) {
    return "";
  }

  if (themes.length === 1) {
    return `Explore the current position in relation to ${themes[0].toLocaleLowerCase(
      "en-GB",
    )}.`;
  }

  const finalTheme = themes[themes.length - 1];
  const precedingThemes = themes.slice(0, -1).join(", ");

  return `Explore the current position in relation to ${precedingThemes} and ${finalTheme.toLocaleLowerCase(
    "en-GB",
  )}.`;
}

function deriveOutcome(
  intelligence: PreparationIntelligence,
): string {
  const developmentDirection = cleanText(
    intelligence.developmentDirection,
  );

  if (developmentDirection) {
    return `Support the client to reflect on the current development position and identify a useful next step.`;
  }

  const commitments = uniqueStrings(
    intelligence.outstandingCommitments ?? [],
    1,
  );

  if (commitments.length) {
    return `Review what has happened since the previous commitment and agree any appropriate next step.`;
  }

  const themes = removeQuestionLikeTopics(
    uniqueStrings(
      (intelligence.themes ?? []).map((theme) => theme.title),
      2,
    ),
  );

  if (themes.length) {
    return `Help the client develop greater clarity and ownership in relation to the suggested focus.`;
  }

  return "";
}

export function deriveCoachPreparationDraft(
  intelligence: PreparationIntelligence,
): CoachPreparationDraft {
  const topicTitles = uniqueStrings(
    (intelligence.themes ?? []).map((theme) => theme.title),
  );

  const topics = removeQuestionLikeTopics(topicTitles).slice(
    0,
    MAX_TOPICS,
  );

  const questions = uniqueStrings(
    intelligence.questions ?? [],
    MAX_QUESTIONS,
  );

  return {
    purpose: derivePurpose(intelligence),
    desiredOutcome: deriveOutcome(intelligence),
    topics,
    questions,
    reminders: "",
  };
}

export function mergePreparationWithDraft(
  existing: Partial<CoachPreparationDraft> | undefined,
  generated: CoachPreparationDraft,
): CoachPreparationDraft {
  const existingTopics = removeQuestionLikeTopics(
    uniqueStrings(existing?.topics ?? []),
  );

  const existingQuestions = uniqueStrings(existing?.questions ?? []);

  return {
    purpose:
      cleanText(existing?.purpose) || generated.purpose,
    desiredOutcome:
      cleanText(existing?.desiredOutcome) ||
      generated.desiredOutcome,
    topics:
      existingTopics.length > 0
        ? existingTopics
        : generated.topics,
    questions:
      existingQuestions.length > 0
        ? existingQuestions
        : generated.questions,
    reminders: cleanText(existing?.reminders),
  };
}

export function hasCoachAuthoredPreparation(
  existing: Partial<CoachPreparationDraft> | undefined,
): boolean {
  return Boolean(
    cleanText(existing?.purpose) ||
      cleanText(existing?.desiredOutcome) ||
      uniqueStrings(existing?.topics ?? []).length ||
      uniqueStrings(existing?.questions ?? []).length ||
      cleanText(existing?.reminders),
  );
}

export function arePreparationsEqual(
  first: CoachPreparationDraft,
  second: CoachPreparationDraft,
): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}
