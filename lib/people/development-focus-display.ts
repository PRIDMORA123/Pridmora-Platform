/**
 * Display-only development-focus shortening for People rows.
 * Deterministic — never calls AI.
 */

import {
  createConciseFocus,
  normaliseDisplayText,
} from "@/lib/relationship-workspace/current-position-display";

export const DEVELOPMENT_FOCUS_MAX_LENGTH = 120;

/**
 * Concise development-focus preview.
 * Ends on a complete word; adds an ellipsis only after a complete word.
 */
export function getConciseDevelopmentFocus(
  text?: string | null,
  maxLength = DEVELOPMENT_FOCUS_MAX_LENGTH
): string {
  const source = normaliseDisplayText(text);
  if (!source) return "";

  const concise = createConciseFocus(source, maxLength);
  if (!concise) return "";

  if (concise.length <= maxLength) {
    return concise;
  }

  return clipAtCompleteWord(concise, maxLength);
}

function clipAtCompleteWord(value: string, maxLength: number): string {
  const text = normaliseDisplayText(value);
  if (!text || text.length <= maxLength) return text;

  const limit = Math.max(1, maxLength - 1);
  const slice = text.slice(0, limit);
  const lastSpace = slice.lastIndexOf(" ");

  if (lastSpace < Math.floor(maxLength * 0.4)) {
    const safe = slice.replace(/\s+\S*$/, "").trim();
    if (!safe) return `${slice.trim()}…`;
    return `${safe.replace(/[.,;:!?]+$/, "")}…`;
  }

  return `${slice.slice(0, lastSpace).replace(/[.,;:!?]+$/, "")}…`;
}
