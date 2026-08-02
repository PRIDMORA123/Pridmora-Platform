import { z } from "zod";
import { extractJsonObject } from "@/lib/intelligence/schema";
import { emptyGeneratedBrief } from "@/lib/coaching-intelligence/brief-map";
import type { GeneratedPreparationBrief } from "@/types/coaching-intelligence";

const LIMITS = {
  previousConversation: 1200,
  outstandingAction: 300,
  possibleFocus: 400,
  purposeSuggestion: 400,
  topic: 300,
  question: 300,
  desiredOutcomeSuggestion: 400,
  framework: 200,
  consideration: 400,
} as const;

function clampText(value: unknown, max: number): unknown {
  if (typeof value !== "string") return value;
  return value.trim().slice(0, max);
}

function clampStringArray(value: unknown, maxItem: number): unknown {
  if (!Array.isArray(value)) return value;
  return value.map(item => clampText(item, maxItem));
}

/**
 * Soft-clamp overlong model strings before schema validation.
 * Prevents PREPARATION_SCHEMA_INVALID when the model exceeds field budgets.
 */
export function clampGeneratedBriefPayload(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;

  const source = raw as Record<string, unknown>;
  const next: Record<string, unknown> = { ...source };

  next.previousConversation = clampText(
    next.previousConversation,
    LIMITS.previousConversation
  );
  next.outstandingActions = clampStringArray(
    next.outstandingActions,
    LIMITS.outstandingAction
  );
  next.possibleFocus = clampText(next.possibleFocus, LIMITS.possibleFocus);
  next.purposeSuggestion = clampText(
    next.purposeSuggestion,
    LIMITS.purposeSuggestion
  );
  next.topicsToExplore = clampStringArray(next.topicsToExplore, LIMITS.topic);
  next.suggestedQuestions = clampStringArray(
    next.suggestedQuestions,
    LIMITS.question
  );
  next.desiredOutcomeSuggestion = clampText(
    next.desiredOutcomeSuggestion,
    LIMITS.desiredOutcomeSuggestion
  );

  if (
    next.coachingGuidance &&
    typeof next.coachingGuidance === "object" &&
    !Array.isArray(next.coachingGuidance)
  ) {
    const guidance = {
      ...(next.coachingGuidance as Record<string, unknown>),
    };
    guidance.framework = clampText(guidance.framework, LIMITS.framework);
    guidance.considerations = clampStringArray(
      guidance.considerations,
      LIMITS.consideration
    );
    next.coachingGuidance = guidance;
  }

  return next;
}

const generatedBriefSchema = z.object({
  previousConversation: z.string().trim().max(LIMITS.previousConversation).nullable().optional(),
  outstandingActions: z
    .array(z.string().trim().min(1).max(LIMITS.outstandingAction))
    .max(12)
    .optional()
    .default([]),
  possibleFocus: z.string().trim().max(LIMITS.possibleFocus).nullable().optional(),
  purposeSuggestion: z.string().trim().max(LIMITS.purposeSuggestion).nullable().optional(),
  topicsToExplore: z
    .array(z.string().trim().min(1).max(LIMITS.topic))
    .max(8)
    .optional()
    .default([]),
  suggestedQuestions: z
    .array(z.string().trim().min(1).max(LIMITS.question))
    .max(8)
    .optional()
    .default([]),
  desiredOutcomeSuggestion: z
    .string()
    .trim()
    .max(LIMITS.desiredOutcomeSuggestion)
    .nullable()
    .optional(),
  coachingGuidance: z
    .object({
      framework: z.string().trim().max(LIMITS.framework).nullable().optional(),
      considerations: z
        .array(z.string().trim().min(1).max(LIMITS.consideration))
        .max(8)
        .optional()
        .default([]),
    })
    .nullable()
    .optional(),
});

export function parseGeneratedPreparationBrief(
  value: unknown,
  mode: "assisted" | "comprehensive"
): GeneratedPreparationBrief {
  const extracted =
    typeof value === "string" ? extractJsonObject(value) ?? value : value;
  const raw = clampGeneratedBriefPayload(extracted);
  const parsed = generatedBriefSchema.safeParse(raw);
  if (!parsed.success) {
    throw parsed.error;
  }

  const maxQuestions = mode === "assisted" ? 5 : 8;
  const guidance = parsed.data.coachingGuidance;

  return {
    ...emptyGeneratedBrief(),
    previousConversation: parsed.data.previousConversation ?? null,
    outstandingActions: parsed.data.outstandingActions,
    possibleFocus: parsed.data.possibleFocus ?? null,
    purposeSuggestion: parsed.data.purposeSuggestion ?? null,
    topicsToExplore: parsed.data.topicsToExplore,
    suggestedQuestions: parsed.data.suggestedQuestions.slice(0, maxQuestions),
    desiredOutcomeSuggestion: parsed.data.desiredOutcomeSuggestion ?? null,
    coachingGuidance:
      mode === "comprehensive" && guidance
        ? {
            framework: guidance.framework ?? null,
            considerations: guidance.considerations,
          }
        : null,
  };
}
