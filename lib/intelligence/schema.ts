import { z } from "zod";
import {
  CONFIDENCE_LABELS,
  EVIDENCE_TYPES,
  INTELLIGENCE_CATEGORIES,
  SIGNAL_DIRECTIONS,
} from "@/lib/intelligence/types";

const confidenceLabelSchema = z.enum(CONFIDENCE_LABELS);
const evidenceTypeSchema = z.enum(EVIDENCE_TYPES);
const categorySchema = z.enum(INTELLIGENCE_CATEGORIES);
const directionSchema = z.enum(SIGNAL_DIRECTIONS);

export const proposedInsightSchema = z.object({
  category: categorySchema,
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2000),
  confidenceScore: z.number().min(0).max(100),
  confidenceLabel: confidenceLabelSchema,
  evidence: z
    .array(
      z.object({
        evidenceText: z.string().trim().min(1).max(2000),
        evidenceType: evidenceTypeSchema,
        sourceExcerpt: z.string().trim().max(2000).default(""),
      })
    )
    .min(1)
    .max(8),
  relationshipToExistingInsight: z.object({
    type: z.enum(["new", "supports", "challenges", "duplicates"]),
    existingInsightId: z.string().uuid().nullable(),
  }),
});

export const aiInterpretationSchema = z.object({
  proposedInsights: z.array(proposedInsightSchema).max(5),
  suggestedQuestions: z
    .array(
      z.object({
        question: z.string().trim().min(1).max(500),
        reason: z.string().trim().max(1000).default(""),
        relatedInsightIds: z.array(z.string().uuid()).default([]),
      })
    )
    .max(5),
  developmentSignals: z
    .array(
      z.object({
        signalName: z.string().trim().min(1).max(200),
        direction: directionSchema,
        evidenceSummary: z.string().trim().max(1000).default(""),
      })
    )
    .max(5),
  nextSessionFocus: z.object({
    title: z.string().trim().min(1).max(200),
    reason: z.string().trim().max(1000).default(""),
  }),
});

export type AiInterpretationParsed = z.infer<typeof aiInterpretationSchema>;

/** Normalise confidence: low evidence must remain an early signal. */
export function enforceEvidenceConfidence<T extends AiInterpretationParsed>(
  payload: T
): T {
  return {
    ...payload,
    proposedInsights: payload.proposedInsights.map(insight => {
      const evidenceCount = insight.evidence.length;
      let label = insight.confidenceLabel;
      let score = insight.confidenceScore;

      if (evidenceCount <= 1) {
        label = "early signal";
        score = Math.min(score, 35);
      } else if (evidenceCount === 2 && (label === "supported" || label === "strongly supported")) {
        label = "emerging";
        score = Math.min(score, 55);
      }

      return { ...insight, confidenceLabel: label, confidenceScore: score };
    }),
  };
}

export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("AI response was not valid JSON.");
  }
}

export function parseAiInterpretation(text: string): AiInterpretationParsed {
  const raw = extractJsonObject(text);
  const parsed = aiInterpretationSchema.parse(raw);
  return enforceEvidenceConfidence(parsed);
}
