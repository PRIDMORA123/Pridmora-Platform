import { z } from "zod";
import { extractJsonObject } from "@/lib/intelligence/schema";
import type {
  CoachingPattern,
  CoachingPatternStatus,
  PatternCandidate,
  PatternEvidenceReference,
  PatternEvidenceSourceType,
  PatternStrength,
} from "@/lib/patterns/types";

const sourceTypes = [
  "session_notes",
  "approved_summary",
  "commitment",
  "development_observation",
  "supporting_context",
  "coaching_moment",
] as const satisfies readonly PatternEvidenceSourceType[];

const strengths = [
  "observation",
  "emerging",
  "established",
] as const satisfies readonly PatternStrength[];

const statuses = [
  "active",
  "strengthening",
  "reducing",
  "resolved",
  "unclear",
] as const satisfies readonly CoachingPatternStatus[];

const evidenceSchema = z.object({
  sourceType: z.enum(sourceTypes),
  sourceId: z.string().trim().min(1).max(200),
  sessionId: z.string().trim().min(1).max(80).nullable().optional(),
  sourceDate: z.string().trim().max(40).nullable().optional(),
  excerpt: z.string().trim().max(300).nullable().optional(),
});

const candidateSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(500),
  evidence: z.array(evidenceSchema).min(1).max(12),
  statusHint: z.enum(statuses).optional(),
});

const pendingSuggestionSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(500),
    strength: z.enum(strengths),
    status: z.enum(statuses),
    evidence: z.array(evidenceSchema).max(12),
    changeSummary: z.string().trim().max(400),
  })
  .nullable()
  .optional();

const patternSchema = z.object({
  id: z.string().trim().min(1).max(80),
  relationshipId: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(500),
  strength: z.enum(strengths),
  status: z.enum(statuses),
  evidenceCount: z.number().int().min(0).max(100),
  firstObservedAt: z.string().trim().max(40).nullable().optional(),
  lastObservedAt: z.string().trim().max(40).nullable().optional(),
  evidence: z.array(evidenceSchema).max(20),
  coachReviewed: z.boolean(),
  coachAccepted: z.boolean().nullable().optional(),
  coachComment: z.string().trim().max(1000).nullable().optional(),
  suppressed: z.boolean().optional(),
  evidenceFingerprint: z.string().trim().max(2000).nullable().optional(),
  pendingSuggestion: pendingSuggestionSchema,
});

export const patternCandidatesResponseSchema = z.object({
  patterns: z.array(candidateSchema).max(8).optional().default([]),
});

function toEvidenceRef(
  value: z.infer<typeof evidenceSchema>
): PatternEvidenceReference {
  return {
    sourceType: value.sourceType,
    sourceId: value.sourceId,
    sessionId: value.sessionId ?? null,
    sourceDate: value.sourceDate ?? null,
    excerpt: value.excerpt ?? null,
  };
}

export function parsePatternCandidates(value: unknown): PatternCandidate[] {
  const parsed = patternCandidatesResponseSchema.safeParse(value);
  if (!parsed.success) return [];
  return parsed.data.patterns.map(item => ({
    title: item.title,
    description: item.description,
    evidence: item.evidence.map(toEvidenceRef),
    statusHint: item.statusHint,
  }));
}

export function parsePatternCandidatesFromModel(text: string): PatternCandidate[] {
  try {
    return parsePatternCandidates(extractJsonObject(text));
  } catch {
    return [];
  }
}

export function parseCoachingPatterns(value: unknown): CoachingPattern[] {
  if (!Array.isArray(value)) return [];
  const patterns: CoachingPattern[] = [];
  for (const entry of value) {
    const parsed = patternSchema.safeParse(entry);
    if (!parsed.success) continue;
    const data = parsed.data;
    patterns.push({
      id: data.id,
      relationshipId: data.relationshipId,
      title: data.title,
      description: data.description,
      strength: data.strength,
      status: data.status,
      evidenceCount: data.evidenceCount,
      firstObservedAt: data.firstObservedAt ?? null,
      lastObservedAt: data.lastObservedAt ?? null,
      evidence: data.evidence.map(toEvidenceRef),
      coachReviewed: data.coachReviewed,
      coachAccepted: data.coachAccepted ?? null,
      coachComment: data.coachComment ?? null,
      suppressed: data.suppressed ?? false,
      evidenceFingerprint: data.evidenceFingerprint ?? null,
      pendingSuggestion: data.pendingSuggestion
        ? {
            title: data.pendingSuggestion.title,
            description: data.pendingSuggestion.description,
            strength: data.pendingSuggestion.strength,
            status: data.pendingSuggestion.status,
            evidence: data.pendingSuggestion.evidence.map(toEvidenceRef),
            changeSummary: data.pendingSuggestion.changeSummary,
          }
        : null,
    });
  }
  return patterns;
}

export function coachingPatternsToJson(patterns: CoachingPattern[]): unknown {
  return patterns;
}
