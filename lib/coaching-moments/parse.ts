import {
  parseCoachingMomentType,
  parseQuestions,
  parseRelevantContext,
  type CoachingMomentGuidance,
  type CoachingMomentInsight,
  type CoachingMomentType,
} from "@/lib/coaching-moments/coaching-moment";

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("Invalid JSON");
  }
}

export function parseGuidanceFromModel(text: string): {
  inferredType: CoachingMomentType;
  guidance: CoachingMomentGuidance;
} {
  const raw = extractJsonObject(text) as Record<string, unknown>;
  const intention =
    typeof raw.intention === "string" ? raw.intention.trim() : "";
  if (!intention) {
    throw new Error("Guidance missing intention.");
  }

  const questions = parseQuestions(raw.questions);
  const inferredType =
    parseCoachingMomentType(raw.inferredType) ?? "general";

  return {
    inferredType,
    guidance: {
      intention,
      opening:
        typeof raw.opening === "string" ? raw.opening.trim() || null : null,
      questions,
      consideration:
        typeof raw.consideration === "string"
          ? raw.consideration.trim() || null
          : null,
      relevantContext: parseRelevantContext(raw.relevantContext),
    },
  };
}

export function parseInsightFromModel(text: string): CoachingMomentInsight {
  const raw = extractJsonObject(text) as Record<string, unknown>;
  const summary = typeof raw.summary === "string" ? raw.summary.trim() : "";
  if (!summary) {
    throw new Error("Insight missing summary.");
  }

  return {
    summary,
    commitment:
      typeof raw.commitment === "string" ? raw.commitment.trim() || null : null,
    patternConnection:
      typeof raw.patternConnection === "string"
        ? raw.patternConnection.trim() || null
        : null,
    followUpQuestion:
      typeof raw.followUpQuestion === "string"
        ? raw.followUpQuestion.trim() || null
        : null,
  };
}

export function buildGuidanceFingerprint(parts: Array<string | null | undefined>): string {
  return parts
    .map(part => (part ?? "").trim())
    .join("|")
    .slice(0, 500);
}
