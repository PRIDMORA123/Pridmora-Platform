/**
 * Shared semantic overlap checks for intelligence composition.
 * Prefer fixing generation/recomposition here over UI redesign.
 */

const STRONG_OVERLAP = 0.72;

function collapseSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function comparisonKey(value: string): string {
  return collapseSpaces(value)
    .toLocaleLowerCase("en-GB")
    .replace(/^continue exploring:\s*/i, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(value: string): Set<string> {
  return new Set(
    comparisonKey(value)
      .split(" ")
      .filter(token => token.length > 2)
  );
}

/** True when two phrases are exact, nested, or strongly token-overlapping. */
export function isStrongDuplicate(a: string, b: string): boolean {
  const left = comparisonKey(a);
  const right = comparisonKey(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.includes(right) || right.includes(left)) {
    const shorter = Math.min(left.length, right.length);
    const longer = Math.max(left.length, right.length);
    if (shorter / longer >= 0.85) return true;
  }

  const aTokens = tokenSet(a);
  const bTokens = tokenSet(b);
  if (aTokens.size === 0 || bTokens.size === 0) return false;

  let overlap = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) overlap += 1;
  }
  const ratio = overlap / Math.min(aTokens.size, bTokens.size);
  return ratio >= STRONG_OVERLAP;
}

/**
 * Keep values that do not strongly overlap blocked rivals or earlier kept items.
 */
export function filterSemanticDuplicates(
  values: string[],
  blocked: string[] = [],
  options?: { max?: number }
): string[] {
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (blocked.some(rival => isStrongDuplicate(trimmed, rival))) continue;
    if (result.some(existing => isStrongDuplicate(trimmed, existing))) continue;
    result.push(trimmed);
    if (options?.max != null && result.length >= options.max) break;
  }
  return result;
}
