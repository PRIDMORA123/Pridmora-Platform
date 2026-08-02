import { z } from "zod";
import type { PreparationStyle } from "@/lib/preparation-style";
import { isPreparationStyle, parsePreparationStyle } from "@/lib/preparation-style";
import { extractJsonObject } from "@/lib/intelligence/schema";

export type PreparationTheme = {
  title: string;
  basis: string;
};

export type PreparationPattern = {
  title: string;
  basis: string;
};

export type PreparationHistoricalItem = {
  title: string;
  detail: string;
};

export type PreparationAiBrief = {
  themes: PreparationTheme[];
  exploration: string;
  questions: string[];
  reflectionPrompt: string;
  patterns: PreparationPattern[];
  developmentDirection: string;
  historicalContext: PreparationHistoricalItem[];
  additionalQuestions: string[];
  /** Section keys the coach has removed from this draft. */
  removedSections: string[];
};

export type PreparationAiBriefState = {
  brief: PreparationAiBrief | null;
  generatedAt: string;
  style: PreparationStyle;
  confirmedAt: string;
  sourceFingerprint: string;
};

export const EMPTY_PREPARATION_AI_BRIEF: PreparationAiBrief = {
  themes: [],
  exploration: "",
  questions: [],
  reflectionPrompt: "",
  patterns: [],
  developmentDirection: "",
  historicalContext: [],
  additionalQuestions: [],
  removedSections: [],
};

const themeSchema = z.object({
  title: z.string().trim().min(1).max(200),
  basis: z.string().trim().max(500).optional().default(""),
});

const patternSchema = z.object({
  title: z.string().trim().min(1).max(200),
  basis: z.string().trim().max(500).optional().default(""),
});

const historicalSchema = z.object({
  title: z.string().trim().min(1).max(200),
  detail: z.string().trim().max(800).optional().default(""),
});

export const preparationAiBriefSchema = z.object({
  themes: z.array(themeSchema).max(3).optional().default([]),
  exploration: z.string().trim().max(800).optional().default(""),
  questions: z.array(z.string().trim().min(1).max(300)).max(4).optional().default([]),
  reflectionPrompt: z.string().trim().max(500).optional().default(""),
  patterns: z.array(patternSchema).max(3).optional().default([]),
  developmentDirection: z.string().trim().max(1200).optional().default(""),
  historicalContext: z.array(historicalSchema).max(4).optional().default([]),
  additionalQuestions: z
    .array(z.string().trim().min(1).max(300))
    .max(4)
    .optional()
    .default([]),
  removedSections: z.array(z.string().trim().min(1).max(80)).max(20).optional().default([]),
});

export function parsePreparationAiBrief(value: unknown): PreparationAiBrief | null {
  if (!value || typeof value !== "object") return null;
  const parsed = preparationAiBriefSchema.safeParse(value);
  if (!parsed.success) return null;
  return {
    themes: parsed.data.themes.slice(0, 3),
    exploration: parsed.data.exploration,
    questions: parsed.data.questions.slice(0, 4),
    reflectionPrompt: parsed.data.reflectionPrompt,
    patterns: parsed.data.patterns.slice(0, 3),
    developmentDirection: parsed.data.developmentDirection,
    historicalContext: parsed.data.historicalContext.slice(0, 4),
    additionalQuestions: parsed.data.additionalQuestions.slice(0, 4),
    removedSections: parsed.data.removedSections,
  };
}

export function parsePreparationAiBriefFromModel(text: string): PreparationAiBrief {
  const parsed = preparationAiBriefSchema.parse(extractJsonObject(text));
  return {
    themes: parsed.themes.slice(0, 3),
    exploration: parsed.exploration,
    questions: parsed.questions.slice(0, 4),
    reflectionPrompt: parsed.reflectionPrompt,
    patterns: parsed.patterns.slice(0, 3),
    developmentDirection: parsed.developmentDirection,
    historicalContext: parsed.historicalContext.slice(0, 4),
    additionalQuestions: parsed.additionalQuestions.slice(0, 4),
    removedSections: [],
  };
}

export function hasPreparationAiContent(brief: PreparationAiBrief | null | undefined): boolean {
  if (!brief) return false;
  return Boolean(
    brief.themes.length ||
      brief.exploration.trim() ||
      brief.questions.length ||
      brief.reflectionPrompt.trim() ||
      brief.patterns.length ||
      brief.developmentDirection.trim() ||
      brief.historicalContext.length ||
      brief.additionalQuestions.length
  );
}

export function buildSourceFingerprint(parts: Array<string | null | undefined>): string {
  return parts
    .map(part => (part ?? "").trim())
    .filter(Boolean)
    .join("|");
}

export function isPreparationBriefStale(
  state: Pick<PreparationAiBriefState, "generatedAt" | "sourceFingerprint"> | null | undefined,
  currentFingerprint: string
): boolean {
  if (!state?.generatedAt) return false;
  if (!state.sourceFingerprint || !currentFingerprint) return false;
  return state.sourceFingerprint !== currentFingerprint;
}

/** Formats an ISO timestamp as "25 July 2026 at 18:22". */
export function formatPreparationGeneratedAt(iso: string): string {
  const trimmed = iso.trim();
  if (!trimmed) return "";
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return trimmed;
  const day = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  return `${day} at ${time}`;
}

export function preparationBriefStateFromRow(row: {
  prep_ai_brief?: unknown;
  prep_ai_brief_generated_at?: string | null;
  prep_ai_brief_style?: string | null;
  prep_ai_brief_confirmed_at?: string | null;
  prep_ai_brief_source_fingerprint?: string | null;
}): PreparationAiBriefState {
  const style = isPreparationStyle(row.prep_ai_brief_style)
    ? row.prep_ai_brief_style
    : parsePreparationStyle(row.prep_ai_brief_style);
  return {
    brief: parsePreparationAiBrief(row.prep_ai_brief),
    generatedAt: row.prep_ai_brief_generated_at ?? "",
    style,
    confirmedAt: row.prep_ai_brief_confirmed_at ?? "",
    sourceFingerprint: row.prep_ai_brief_source_fingerprint ?? "",
  };
}

export type AiSectionKey =
  | "themes"
  | "exploration"
  | "questions"
  | "reflectionPrompt"
  | "patterns"
  | "developmentDirection"
  | "historicalContext"
  | "additionalQuestions";

export function removeAiSection(
  brief: PreparationAiBrief,
  section: AiSectionKey
): PreparationAiBrief {
  const next: PreparationAiBrief = {
    ...brief,
    removedSections: Array.from(new Set([...brief.removedSections, section])),
  };
  switch (section) {
    case "themes":
      next.themes = [];
      break;
    case "exploration":
      next.exploration = "";
      break;
    case "questions":
      next.questions = [];
      break;
    case "reflectionPrompt":
      next.reflectionPrompt = "";
      break;
    case "patterns":
      next.patterns = [];
      break;
    case "developmentDirection":
      next.developmentDirection = "";
      break;
    case "historicalContext":
      next.historicalContext = [];
      break;
    case "additionalQuestions":
      next.additionalQuestions = [];
      break;
  }
  return next;
}
