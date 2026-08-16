import { distinctSessionIds } from "@/lib/patterns/evidence";
import type {
  AuthorisedPatternEvidencePoint,
  PatternCandidate,
  PatternEvidenceReference,
} from "@/lib/patterns/types";
import { toEvidenceReference } from "@/lib/patterns/evidence";

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "being",
  "could",
  "their",
  "there",
  "these",
  "those",
  "which",
  "would",
  "while",
  "where",
  "other",
  "should",
  "still",
  "through",
  "under",
  "until",
  "with",
  "from",
  "have",
  "this",
  "that",
  "they",
  "them",
  "were",
  "when",
  "what",
  "your",
  "into",
  "more",
  "some",
  "than",
  "then",
  "also",
  "over",
  "only",
  "just",
  "like",
  "been",
  "much",
  "very",
  "client",
  "coach",
  "session",
  "discussed",
  "agreed",
]);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map(part => part.trim())
    .filter(part => part.length >= 4 && !STOP_WORDS.has(part));
}

function titleCase(phrase: string): string {
  return phrase
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Deterministic continuity detection across authorised evidence.
 * Does not manufacture insights — returns empty when evidence is insufficient.
 */
export function detectPatternCandidates(
  points: AuthorisedPatternEvidencePoint[]
): PatternCandidate[] {
  if (points.length < 2) return [];

  const termToEvidence = new Map<string, AuthorisedPatternEvidencePoint[]>();

  for (const point of points) {
    const unique = Array.from(new Set(tokens(point.content)));
    for (const term of unique) {
      const list = termToEvidence.get(term) ?? [];
      list.push(point);
      termToEvidence.set(term, list);
    }
  }

  const candidates: PatternCandidate[] = [];
  const usedKeys = new Set<string>();

  const ranked = Array.from(termToEvidence.entries())
    .map(([term, evidencePoints]) => {
      const uniquePoints = dedupePoints(evidencePoints);
      const refs = uniquePoints.map(point => toEvidenceReference(point, true));
      return { term, refs, sessions: distinctSessionIds(refs) };
    })
    .filter(item => item.refs.length >= 2)
    .sort((a, b) => {
      if (b.sessions.length !== a.sessions.length) {
        return b.sessions.length - a.sessions.length;
      }
      return b.refs.length - a.refs.length;
    });

  for (const item of ranked) {
    const key = item.refs
      .map(ref => ref.sourceId)
      .sort()
      .join("|");
    if (usedKeys.has(key)) continue;
    // Skip if heavily overlapping an existing stronger candidate
    if (
      candidates.some(existing =>
        evidenceOverlap(existing.evidence, item.refs) >= 0.8
      )
    ) {
      continue;
    }
    usedKeys.add(key);

    const sessionLabel =
      item.sessions.length >= 2
        ? `${item.sessions.length} approved sessions`
        : "approved evidence sources";

    candidates.push({
      title: titleCase(item.term),
      description: `${titleCase(item.term)} has appeared across ${sessionLabel}.`,
      evidence: item.refs,
      statusHint: item.sessions.length >= 2 ? "active" : "active",
    });

    if (candidates.length >= 6) break;
  }

  return candidates;
}

function dedupePoints(
  points: AuthorisedPatternEvidencePoint[]
): AuthorisedPatternEvidencePoint[] {
  const seen = new Set<string>();
  const result: AuthorisedPatternEvidencePoint[] = [];
  for (const point of points) {
    if (seen.has(point.canonicalKey)) continue;
    seen.add(point.canonicalKey);
    result.push(point);
  }
  return result;
}

function evidenceOverlap(
  a: PatternEvidenceReference[],
  b: PatternEvidenceReference[]
): number {
  if (a.length === 0 || b.length === 0) return 0;
  const keys = new Set(a.map(item => item.sourceId));
  const shared = b.filter(item => keys.has(item.sourceId)).length;
  return shared / Math.max(a.length, b.length);
}
