/**
 * Display-only cleanup for visible product copy.
 * Strips internal markers and normalises AI-style punctuation habits.
 */

import { COMPREHENSIVE_MARKER } from "@/lib/summary-insights/types";
import { WORKFLOW_MARKER } from "@/lib/coach-notes";

const INTERNAL_MARKERS = [
  COMPREHENSIVE_MARKER,
  WORKFLOW_MARKER,
  "[[pridmora_",
] as const;

/** Remove internal template / packing markers from text shown to users. */
export function stripInternalMarkers(value: string | null | undefined): string {
  if (!value) return "";
  let text = value;
  for (const marker of INTERNAL_MARKERS) {
    const index = text.indexOf(marker);
    if (index !== -1) {
      text = text.slice(0, index);
    }
  }
  // Drop any remaining [[...]] style tokens that should never render.
  text = text.replace(/\[\[[^\]]*\]\]/g, "");
  return text.trim();
}

/**
 * Soften AI-style em/en dashes in prose into separate sentences where safe.
 * Keeps genuine compound hyphens (evidence-based, follow-up, one-to-one).
 */
export function normaliseProseDashes(value: string): string {
  if (!value) return "";
  return value
    .replace(/\s+[—–]\s+/g, ". ")
    .replace(/([a-zA-Z])[—–]([a-zA-Z])/g, "$1. $2")
    .replace(/\.\s+([a-z])/g, (_, letter: string) => `. ${letter.toUpperCase()}`)
    .replace(/\.\s*\./g, ".")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Prepare any stored text field for safe user-facing display. */
export function prepareVisibleText(value: string | null | undefined): string {
  return normaliseProseDashes(stripInternalMarkers(value));
}

export function containsInternalMarker(value: string | null | undefined): boolean {
  if (!value) return false;
  if (INTERNAL_MARKERS.some(marker => value.includes(marker))) return true;
  return /\[\[[^\]]*\]\]/.test(value);
}
