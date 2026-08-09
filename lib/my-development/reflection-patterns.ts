/**
 * Lightweight pattern surfacing across Manager reflections.
 * Distinguishes one-off observation vs emerging vs recurring —
 * never presents a single reflection as a behavioural conclusion.
 */

import type { DevelopmentEvidenceRecord } from "@/lib/development-evidence/types";

export type ReflectionPatternKind = "one_off" | "emerging" | "recurring";

export type ReflectionPatternInsight = {
  theme: string;
  occurrenceCount: number;
  reflectionIds: string[];
  patternKind: ReflectionPatternKind;
  statement: string;
};

function isReflectionEvidence(item: DevelopmentEvidenceRecord): boolean {
  return (
    (item.evidenceType === "personal_reflection" ||
      item.evidenceType === "reflection") &&
    !item.deletedAt &&
    item.includeInIntelligence &&
    item.reviewStatus !== "rejected" &&
    item.reviewStatus !== "excluded"
  );
}

function normalizeTheme(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function displayTheme(value: string): string {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) return cleaned;
  return cleaned.length > 80 ? `${cleaned.slice(0, 77)}…` : cleaned;
}

function collectThemesFromReflection(
  item: DevelopmentEvidenceRecord
): string[] {
  const themes: string[] = [];
  for (const signal of item.structuredEvidence.developmentSignals ?? []) {
    if (signal.trim()) themes.push(signal.trim());
  }
  for (const observation of item.structuredEvidence.observations ?? []) {
    const category = (observation.category ?? "").toLowerCase();
    if (
      category.includes("development") ||
      category.includes("priority") ||
      /practise next|difficult|differently/i.test(observation.title)
    ) {
      if (observation.description.trim()) {
        themes.push(observation.description.trim());
      }
    }
  }
  return themes;
}

function patternKindForCount(count: number): ReflectionPatternKind {
  if (count >= 3) return "recurring";
  if (count === 2) return "emerging";
  return "one_off";
}

function statementFor(
  theme: string,
  count: number,
  kind: ReflectionPatternKind
): string {
  const label = displayTheme(theme);
  if (kind === "recurring") {
    return `"${label}" has appeared across ${count} recent reflections.`;
  }
  if (kind === "emerging") {
    return `"${label}" is emerging across ${count} recent reflections.`;
  }
  return `"${label}" appears in one reflection — a one-off observation, not a behavioural conclusion.`;
}

/**
 * Build pattern insights from personal reflections only.
 * Exact theme text is grouped; one reflection alone never becomes "recurring".
 */
export function buildReflectionPatternInsights(
  records: DevelopmentEvidenceRecord[]
): ReflectionPatternInsight[] {
  const reflections = records.filter(isReflectionEvidence);
  const buckets = new Map<
    string,
    { theme: string; reflectionIds: Set<string> }
  >();

  for (const reflection of reflections) {
    const themes = collectThemesFromReflection(reflection);
    const seenInThisReflection = new Set<string>();
    for (const theme of themes) {
      const key = normalizeTheme(theme);
      if (!key || key.length < 3 || seenInThisReflection.has(key)) continue;
      seenInThisReflection.add(key);
      const existing = buckets.get(key);
      if (existing) {
        existing.reflectionIds.add(reflection.id);
      } else {
        buckets.set(key, {
          theme,
          reflectionIds: new Set([reflection.id]),
        });
      }
    }
  }

  return [...buckets.values()]
    .map(bucket => {
      const occurrenceCount = bucket.reflectionIds.size;
      const patternKind = patternKindForCount(occurrenceCount);
      return {
        theme: displayTheme(bucket.theme),
        occurrenceCount,
        reflectionIds: [...bucket.reflectionIds],
        patternKind,
        statement: statementFor(bucket.theme, occurrenceCount, patternKind),
      };
    })
    .sort((a, b) => {
      const rank = { recurring: 0, emerging: 1, one_off: 2 } as const;
      if (rank[a.patternKind] !== rank[b.patternKind]) {
        return rank[a.patternKind] - rank[b.patternKind];
      }
      return b.occurrenceCount - a.occurrenceCount;
    });
}

/** Themes safe to surface in DI without overclaiming from a single reflection. */
export function patternsSafeForIntelligence(
  patterns: ReflectionPatternInsight[]
): ReflectionPatternInsight[] {
  return patterns.filter(
    item => item.patternKind === "emerging" || item.patternKind === "recurring"
  );
}
