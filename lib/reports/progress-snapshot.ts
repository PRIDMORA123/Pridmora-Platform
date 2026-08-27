import { COMPREHENSIVE_MARKER } from "@/lib/summary-insights/types";
import type { ReportEvidenceItem } from "@/lib/reports/types";

export const SNAPSHOT_EVIDENCE_MAX_ITEMS = 3;
export const SNAPSHOT_EVIDENCE_MAX_CHARS = 280;

export function stripInternalStructuredPayload(text: string): string {
  const markerIndex = text.indexOf(COMPREHENSIVE_MARKER);
  const withoutMarker =
    markerIndex >= 0 ? text.slice(0, markerIndex) : text;
  return withoutMarker.replace(/\s+/g, " ").trim();
}

export function truncateSnapshotEvidence(
  text: string,
  max = SNAPSHOT_EVIDENCE_MAX_CHARS
): string {
  const cleaned = stripInternalStructuredPayload(text);
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1).trim()}…`;
}

/**
 * Concise shareable excerpt for Progress Snapshot only.
 * Approved reflections prefer the first shareable block (session summary)
 * rather than concatenated interpretation / implication / next-action fields.
 */
export function snapshotEvidenceExcerpt(item: ReportEvidenceItem): string {
  const raw = item.evidence ?? "";
  if (item.sourceType === "approved_reflection") {
    const firstBlock = raw.split(/\n\s*\n/)[0] ?? raw;
    return truncateSnapshotEvidence(firstBlock);
  }
  return truncateSnapshotEvidence(raw);
}

/**
 * Progress Snapshot evidence list: at most three bounded bullets, no purpose
 * duplicate when Current coaching focus is already shown, no internal payloads.
 * Does not invent items. Provenance fields (id, sourceType, sourceId) are kept.
 */
export function evidenceItemsForProgressSnapshot(
  items: ReportEvidenceItem[],
  coachingPurpose?: string | null
): ReportEvidenceItem[] {
  const purposeAlreadyShown = Boolean(coachingPurpose?.trim());
  const selected = purposeAlreadyShown
    ? items.filter(item => item.sourceType !== "coaching_purpose")
    : items;

  return selected.slice(0, SNAPSHOT_EVIDENCE_MAX_ITEMS).map(item => ({
    ...item,
    evidence: snapshotEvidenceExcerpt(item),
  }));
}
