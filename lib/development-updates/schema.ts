import { z, type ZodError, type ZodIssue } from "zod";
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

/**
 * Safe Zod diagnostic — paths, codes, and constraint metadata only.
 * Never includes model text / coaching content.
 */
export type DevelopmentSchemaValidationDiagnostic = {
  fieldPath: string | null;
  issueCode: string | null;
  expectedType: string | null;
  receivedType: string | null;
  minimum: number | null;
  maximum: number | null;
};

export function buildDevelopmentSchemaValidationDiagnostic(
  error: ZodError
): DevelopmentSchemaValidationDiagnostic {
  const issue = error.issues[0] as ZodIssue | undefined;
  if (!issue) {
    return {
      fieldPath: null,
      issueCode: null,
      expectedType: null,
      receivedType: null,
      minimum: null,
      maximum: null,
    };
  }

  const expectedType =
    "expected" in issue && issue.expected != null
      ? String(issue.expected)
      : null;
  const receivedType =
    "received" in issue && issue.received != null
      ? String(issue.received)
      : null;
  const minimum =
    "minimum" in issue && typeof issue.minimum === "number"
      ? issue.minimum
      : null;
  const maximum =
    "maximum" in issue && typeof issue.maximum === "number"
      ? issue.maximum
      : null;

  return {
    fieldPath: issue.path.length > 0 ? issue.path.join(".") : null,
    issueCode: issue.code ?? null,
    expectedType,
    receivedType,
    minimum,
    maximum,
  };
}

/**
 * Models sometimes emit update rows as `{ from, to, reason }` instead of
 * `{ value, status?, reason? }`. Map narrowly before Zod validation.
 * Does not invent content — only renames known alternate keys.
 */
export function normalizeDevelopmentUpdateModelPayload(
  raw: unknown
): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const root = { ...(raw as Record<string, unknown>) };
  const proposed = root.proposedChanges;
  if (!proposed || typeof proposed !== "object" || Array.isArray(proposed)) {
    return root;
  }

  const nextProposed: Record<string, unknown> = {
    ...(proposed as Record<string, unknown>),
  };

  for (const [key, category] of Object.entries(nextProposed)) {
    if (key === "currentFocus" || key === "coachNote") continue;
    if (key === "commitments") {
      nextProposed.commitments = normalizeCommitmentChanges(category);
      continue;
    }
    nextProposed[key] = normalizeCategoryChanges(category);
  }

  root.proposedChanges = nextProposed;
  return root;
}

function normalizeCategoryChanges(category: unknown): unknown {
  if (!category || typeof category !== "object" || Array.isArray(category)) {
    return category;
  }
  const next = { ...(category as Record<string, unknown>) };
  for (const key of ["add", "update", "remove"] as const) {
    if (!Array.isArray(next[key])) continue;
    next[key] = next[key].map(item => normalizeProfileItemChange(item));
  }
  return next;
}

function normalizeCommitmentChanges(category: unknown): unknown {
  if (!category || typeof category !== "object" || Array.isArray(category)) {
    return category;
  }
  const next = { ...(category as Record<string, unknown>) };
  for (const key of ["add", "complete", "remove"] as const) {
    if (!Array.isArray(next[key])) continue;
    next[key] = next[key].map(item => normalizeProfileItemChange(item));
  }
  return next;
}

function normalizeProfileItemChange(item: unknown): unknown {
  if (typeof item === "string") return item;
  if (!item || typeof item !== "object" || Array.isArray(item)) return item;
  const row = { ...(item as Record<string, unknown>) };
  const hasValue =
    typeof row.value === "string" && row.value.trim().length > 0;
  if (!hasValue) {
    if (typeof row.to === "string" && row.to.trim()) {
      row.value = row.to;
    } else if (typeof row.from === "string" && row.from.trim()) {
      row.value = row.from;
    }
  }
  delete row.to;
  delete row.from;
  return row;
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
  const normalised = normalizeDevelopmentUpdateModelPayload(raw);
  const parsed = developmentUpdateGenerationSchema.parse(normalised);

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
