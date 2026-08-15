/**
 * Display-only longitudinal sections for Preparation Stage 1.
 * Derives from existing prep_ai_brief / adapter signals — no schema change.
 */

export type LongitudinalPreparationSections = {
  developmentSinceLast: string | null;
  whatToPayAttentionTo: string | null;
  evidenceWorthExploring: string[];
  whatProgressCouldLookLike: string | null;
};

function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function firstSentences(value: string, max = 2): string {
  const text = collapse(value);
  if (!text) return "";
  const parts = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [text];
  return parts
    .slice(0, max)
    .map(part => collapse(part))
    .filter(Boolean)
    .join(" ");
}

function comparisonKey(value: string): string {
  return collapse(value)
    .toLocaleLowerCase("en-GB")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ");
}

function isNearDuplicate(a: string, b: string): boolean {
  const left = comparisonKey(a);
  const right = comparisonKey(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.includes(right) || right.includes(left)) {
    const shorter = Math.min(left.length, right.length);
    const longer = Math.max(left.length, right.length);
    return shorter / longer >= 0.8;
  }
  return false;
}

function trimWords(value: string, maxWords: number): string {
  const words = collapse(value).split(" ").filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  return words.slice(0, maxWords).join(" ");
}

/**
 * Build optional richer preparation sections when evidence supports them.
 * Returns null/empty when content would be fabricated or duplicate.
 */
export function deriveLongitudinalPreparationSections(input: {
  isFirstSession?: boolean;
  primaryFocus?: string | null;
  exploration?: string | null;
  reflectionPrompt?: string | null;
  movementSummary?: string | null;
  previousConversationSummary?: string | null;
  themes?: Array<{ title?: string | null; basis?: string | null }> | null;
  patterns?: Array<{
    title?: string | null;
    description?: string | null;
    basis?: string | null;
  }> | null;
}): LongitudinalPreparationSections {
  if (input.isFirstSession) {
    return {
      developmentSinceLast: null,
      whatToPayAttentionTo: null,
      evidenceWorthExploring: [],
      whatProgressCouldLookLike: null,
    };
  }

  const primary = collapse(input.primaryFocus ?? "");
  const rivals = [primary];

  const exploration = firstSentences(input.exploration ?? "", 2);
  const previous = firstSentences(input.previousConversationSummary ?? "", 2);
  const movement = firstSentences(input.movementSummary ?? "", 2);

  let developmentSinceLast: string | null = null;
  for (const candidate of [exploration, previous, movement]) {
    if (!candidate) continue;
    if (rivals.some(rival => isNearDuplicate(candidate, rival))) continue;
    developmentSinceLast = trimWords(candidate, 70);
    rivals.push(developmentSinceLast);
    break;
  }

  const patternText = (input.patterns ?? [])
    .map(pattern => {
      const title = collapse(pattern.title ?? "");
      const detail = collapse(pattern.description || pattern.basis || "");
      if (title && detail && !isNearDuplicate(title, detail)) {
        return `${title}. ${detail}`;
      }
      return detail || title;
    })
    .map(collapse)
    .find(Boolean);

  let whatToPayAttentionTo: string | null = null;
  if (patternText && !rivals.some(rival => isNearDuplicate(patternText, rival))) {
    whatToPayAttentionTo = trimWords(patternText, 55);
    rivals.push(whatToPayAttentionTo);
  }

  const evidenceWorthExploring: string[] = [];
  for (const theme of input.themes ?? []) {
    const title = collapse(theme.title ?? "");
    const basis = collapse(theme.basis ?? "");
    if (!title) continue;
    // Skip the primary-focus theme (usually themes[0] / possibleFocus).
    if (rivals.some(rival => isNearDuplicate(title, rival))) continue;
    const isExploreCue =
      /explor|uncertain|gap|need|confirm|challenge|deepen|suggest/i.test(
        basis
      ) || evidenceWorthExploring.length < 2;
    if (!isExploreCue) continue;
    evidenceWorthExploring.push(trimWords(title, 28));
    rivals.push(title);
    if (evidenceWorthExploring.length >= 3) break;
  }

  const progress = collapse(input.reflectionPrompt ?? "");
  let whatProgressCouldLookLike: string | null = null;
  if (progress && !rivals.some(rival => isNearDuplicate(progress, rival))) {
    whatProgressCouldLookLike = trimWords(firstSentences(progress, 2), 55);
  }

  return {
    developmentSinceLast,
    whatToPayAttentionTo,
    evidenceWorthExploring,
    whatProgressCouldLookLike,
  };
}

export function looksLikeCommitmentRevisitTitle(value: string | null | undefined): boolean {
  return /^revisit the open commitment\b/i.test(collapse(value ?? ""));
}
