/**
 * Verified source excerpts for Development Evidence review.
 * Displayed text must always originate from authorised extracted_text —
 * never present unverified AI paraphrases as source quotes.
 */

export const MAX_VERIFIED_SOURCE_EXCERPT_CHARS = 280;
const MIN_MATCH_CHARS = 20;
const MIN_SOURCE_CHARS = 20;

export type VerifiedSourceExcerptResult = {
  excerpt: string | null;
  matchKind: "exact_behavioural" | "derived" | "none";
};

export function normalizeEvidenceText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Resolve a bounded excerpt that is always a contiguous slice of extractedText.
 */
export function resolveVerifiedSourceExcerpt(input: {
  extractedText: string | null | undefined;
  behaviouralEvidence?: string | null;
  observationTitle?: string | null;
  observationDescription?: string | null;
}): VerifiedSourceExcerptResult {
  const source = normalizeEvidenceText(input.extractedText ?? "");
  if (source.length < MIN_SOURCE_CHARS) {
    return { excerpt: null, matchKind: "none" };
  }

  const behavioural = normalizeEvidenceText(input.behaviouralEvidence ?? "");
  if (behavioural.length >= MIN_MATCH_CHARS) {
    const exact = findCaseInsensitiveSubstring(source, behavioural);
    if (exact) {
      return {
        excerpt: boundExcerptAround(source, exact.start, exact.length),
        matchKind: "exact_behavioural",
      };
    }
  }

  const query = normalizeEvidenceText(
    [
      input.observationTitle ?? "",
      input.observationDescription ?? "",
      behavioural,
    ].join(" ")
  );
  const derived = selectBestDerivedExcerpt(source, query);
  if (derived) {
    return { excerpt: derived, matchKind: "derived" };
  }

  return { excerpt: null, matchKind: "none" };
}

function findCaseInsensitiveSubstring(
  source: string,
  needle: string
): { start: number; length: number } | null {
  const lowerSource = source.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  const start = lowerSource.indexOf(lowerNeedle);
  if (start < 0) return null;
  return { start, length: needle.length };
}

function boundExcerptAround(
  source: string,
  start: number,
  length: number
): string {
  if (length <= MAX_VERIFIED_SOURCE_EXCERPT_CHARS) {
    return source.slice(start, start + length).trim();
  }
  return source.slice(start, start + MAX_VERIFIED_SOURCE_EXCERPT_CHARS).trim();
}

function selectBestDerivedExcerpt(
  source: string,
  query: string
): string | null {
  const queryTokens = significantTokens(query);
  if (queryTokens.length === 0) {
    return source.length <= MAX_VERIFIED_SOURCE_EXCERPT_CHARS
      ? source
      : source.slice(0, MAX_VERIFIED_SOURCE_EXCERPT_CHARS).trim();
  }

  const candidates = buildExcerptCandidates(source);
  let best: { text: string; score: number } | null = null;

  for (const candidate of candidates) {
    const score = scoreTokenOverlap(candidate, queryTokens);
    if (score <= 0) continue;
    if (
      !best ||
      score > best.score ||
      (score === best.score && candidate.length < best.text.length)
    ) {
      best = { text: candidate, score };
    }
  }

  if (!best || best.score < 2) {
    return null;
  }

  // Safety: must remain a contiguous substring of the authorised source.
  if (!source.includes(best.text)) {
    return null;
  }

  return best.text.length > MAX_VERIFIED_SOURCE_EXCERPT_CHARS
    ? best.text.slice(0, MAX_VERIFIED_SOURCE_EXCERPT_CHARS).trim()
    : best.text;
}

function buildExcerptCandidates(source: string): string[] {
  const sentences = source
    .split(/(?<=[.!?])\s+/)
    .map(part => part.trim())
    .filter(part => part.length >= MIN_MATCH_CHARS);

  const candidates: string[] = [];
  if (source.length <= MAX_VERIFIED_SOURCE_EXCERPT_CHARS) {
    candidates.push(source);
  }

  for (const sentence of sentences) {
    if (sentence.length <= MAX_VERIFIED_SOURCE_EXCERPT_CHARS) {
      candidates.push(sentence);
    } else {
      candidates.push(sentence.slice(0, MAX_VERIFIED_SOURCE_EXCERPT_CHARS).trim());
    }
  }

  // Sliding windows for short documents without clear sentence breaks.
  if (sentences.length <= 1 && source.length > MAX_VERIFIED_SOURCE_EXCERPT_CHARS) {
    const step = Math.max(40, Math.floor(MAX_VERIFIED_SOURCE_EXCERPT_CHARS / 2));
    for (
      let start = 0;
      start < source.length;
      start += step
    ) {
      const window = source
        .slice(start, start + MAX_VERIFIED_SOURCE_EXCERPT_CHARS)
        .trim();
      if (window.length >= MIN_MATCH_CHARS) candidates.push(window);
      if (start + MAX_VERIFIED_SOURCE_EXCERPT_CHARS >= source.length) break;
    }
  }

  return Array.from(new Set(candidates));
}

function significantTokens(value: string): string[] {
  return normalizeEvidenceText(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter(token => token.length >= 4);
}

function scoreTokenOverlap(candidate: string, queryTokens: string[]): number {
  const haystack = candidate.toLowerCase();
  let score = 0;
  for (const token of queryTokens) {
    if (haystack.includes(token)) score += 1;
  }
  return score;
}

export function formatObservationSourceLabel(input: {
  fileName?: string | null;
  evidenceTitle?: string | null;
  evidenceTypeLabel: string;
}): string {
  const title =
    normalizeEvidenceText(input.fileName ?? "") ||
    normalizeEvidenceText(input.evidenceTitle ?? "") ||
    "Uploaded document";
  return `${title} · ${input.evidenceTypeLabel}`;
}
