import type {
  AuthorisedPatternEvidencePoint,
  PatternEvidenceReference,
  PatternEvidenceSourceType,
} from "@/lib/patterns/types";

function asTrimmed(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function truncateExcerpt(value: string, max = 160): string {
  const cleaned = asTrimmed(value);
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1).trim()}…`;
}

/**
 * Build a stable canonical key so regenerated summaries / duplicates count once.
 */
export function evidenceCanonicalKey(input: {
  sourceType: PatternEvidenceSourceType;
  sourceId: string;
  sessionId?: string | null;
  content?: string;
}): string {
  const contentHash = asTrimmed(input.content)
    .toLowerCase()
    .slice(0, 120);
  return [
    input.sourceType,
    input.sourceId.trim(),
    (input.sessionId ?? "").trim(),
    contentHash,
  ].join("|");
}

/**
 * Deduplicate authorised evidence. Repeated boilerplate and regenerated
 * versions of the same source count once.
 */
export function deduplicateEvidence(
  points: AuthorisedPatternEvidencePoint[]
): AuthorisedPatternEvidencePoint[] {
  const seen = new Set<string>();
  const result: AuthorisedPatternEvidencePoint[] = [];

  for (const point of points) {
    const key = point.canonicalKey || evidenceCanonicalKey(point);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ ...point, canonicalKey: key });
  }

  return result;
}

/**
 * Filter to authorised evidence only for one relationship.
 */
export function filterAuthorisedEvidence(
  points: AuthorisedPatternEvidencePoint[],
  relationshipId: string
): AuthorisedPatternEvidencePoint[] {
  return points.filter(point => {
    if (point.relationshipId !== relationshipId) return false;
    if (point.isPrivate) return false;

    if (point.sourceType === "approved_summary") {
      if (point.isApproved === false) return false;
    }

    if (point.sourceType === "supporting_context") {
      if (point.aiEnabled !== true) return false;
    }

    if (point.sourceType === "coaching_moment") {
      if (point.isApproved === false) return false;
    }

    if (!asTrimmed(point.content) && !asTrimmed(point.excerpt ?? "")) {
      return false;
    }

    return true;
  });
}

/**
 * Collect → authorise → dedupe → chronological order.
 */
export function normaliseAuthorisedEvidence(
  points: AuthorisedPatternEvidencePoint[],
  relationshipId: string
): AuthorisedPatternEvidencePoint[] {
  const authorised = filterAuthorisedEvidence(points, relationshipId);
  const deduped = deduplicateEvidence(authorised);

  return deduped.sort((a, b) => {
    const left = a.sourceDate ? new Date(a.sourceDate).getTime() : 0;
    const right = b.sourceDate ? new Date(b.sourceDate).getTime() : 0;
    if (left !== right) return left - right;
    return a.sourceId.localeCompare(b.sourceId);
  });
}

export function toEvidenceReference(
  point: AuthorisedPatternEvidencePoint,
  includeExcerpt = false
): PatternEvidenceReference {
  return {
    sourceType: point.sourceType,
    sourceId: point.sourceId,
    sessionId: point.sessionId ?? null,
    sourceDate: point.sourceDate ?? null,
    excerpt: includeExcerpt
      ? truncateExcerpt(point.excerpt || point.content) || null
      : null,
  };
}

export function evidenceFingerprint(
  evidence: Array<Pick<PatternEvidenceReference, "sourceType" | "sourceId" | "sessionId">>
): string {
  return evidence
    .map(
      item =>
        `${item.sourceType}:${item.sourceId}:${item.sessionId ?? ""}`
    )
    .sort()
    .join("||");
}

export function distinctSessionIds(
  evidence: Array<Pick<PatternEvidenceReference, "sessionId">>
): string[] {
  const ids = new Set<string>();
  for (const item of evidence) {
    if (item.sessionId?.trim()) ids.add(item.sessionId.trim());
  }
  return Array.from(ids);
}

export function countDistinctEvidence(
  evidence: PatternEvidenceReference[]
): number {
  const keys = new Set(
    evidence.map(item =>
      evidenceCanonicalKey({
        sourceType: item.sourceType,
        sourceId: item.sourceId,
        sessionId: item.sessionId,
        content: item.excerpt ?? "",
      })
    )
  );
  return keys.size;
}
