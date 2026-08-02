import { z } from "zod";
import { PROFILE_ENTRY_STATUSES } from "@/lib/development-updates/types";
import { extractJsonObject } from "@/lib/intelligence/schema";

/** Strip markdown fences and trim before JSON extraction. */
export function normalizeDevelopmentModelText(text: string): string {
  let normalised = text.trim();
  const fenced = normalised.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) {
    normalised = fenced[1].trim();
  }
  return normalised;
}

const profileStatusSchema = z.enum(PROFILE_ENTRY_STATUSES);

const profileItemChangeSchema = z.object({
  id: z.string().trim().min(1).optional(),
  value: z.string().trim().min(1).max(500),
  status: profileStatusSchema.optional(),
  reason: z.string().trim().max(1000).optional().default(""),
});

const removeItemSchema = z.union([
  z.string().trim().min(1).max(500),
  z.object({
    id: z.string().trim().min(1).optional(),
    value: z.string().trim().min(1).max(500).optional(),
  }),
]);

const categoryChangesSchema = z
  .object({
    add: z.array(profileItemChangeSchema).max(10).optional().default([]),
    update: z.array(profileItemChangeSchema).max(10).optional().default([]),
    remove: z.array(removeItemSchema).max(10).optional().default([]),
  })
  .optional();

const focusChangeSchema = z
  .object({
    action: z.literal("replace").default("replace"),
    value: z.string().trim().min(1).max(500),
    reason: z.string().trim().max(1000).optional().default(""),
  })
  .optional();

const commitmentChangesSchema = z
  .object({
    add: z
      .array(
        z.object({
          id: z.string().trim().min(1).optional(),
          value: z.string().trim().min(1).max(500),
          dueDate: z.string().trim().max(40).nullable().optional().default(null),
        })
      )
      .max(10)
      .optional()
      .default([]),
    complete: z.array(removeItemSchema).max(10).optional().default([]),
    remove: z.array(removeItemSchema).max(10).optional().default([]),
  })
  .optional();

export const proposedProfileChangesSchema = z.object({
  currentFocus: focusChangeSchema,
  strengths: categoryChangesSchema,
  values: categoryChangesSchema,
  motivators: categoryChangesSchema,
  emergingThemes: categoryChangesSchema,
  growthAreas: categoryChangesSchema,
  coachingPreferences: categoryChangesSchema,
  beliefs: categoryChangesSchema,
  patterns: categoryChangesSchema,
  commitments: commitmentChangesSchema,
  coachNote: z.string().trim().max(2000).optional(),
});

export const evidenceSummaryItemSchema = z.object({
  changeKey: z.string().trim().min(1).max(200),
  evidenceText: z.string().trim().min(1).max(2000),
  sourceExcerpt: z.string().trim().max(2000).optional().default(""),
  sessionId: z.string().uuid().nullable().optional(),
});

export const developmentUpdateGenerationSchema = z.object({
  conversationSummary: z.string().trim().min(1).max(4000),
  hasMeaningfulChanges: z.boolean(),
  proposedChanges: proposedProfileChangesSchema.default({}),
  evidence: z.array(evidenceSummaryItemSchema).max(30).default([]),
});

export type DevelopmentUpdateGenerationParsed = z.infer<
  typeof developmentUpdateGenerationSchema
>;

export function parseDevelopmentUpdateGeneration(
  text: string
): DevelopmentUpdateGenerationParsed {
  const raw = extractJsonObject(normalizeDevelopmentModelText(text));
  const parsed = developmentUpdateGenerationSchema.parse(raw);

  if (!parsed.hasMeaningfulChanges) {
    return {
      conversationSummary: parsed.conversationSummary,
      hasMeaningfulChanges: false,
      proposedChanges: {},
      evidence: [],
    };
  }

  return parsed;
}
