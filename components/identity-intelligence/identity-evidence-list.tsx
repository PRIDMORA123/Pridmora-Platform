import type { PatternEvidenceSourceType } from "@/lib/patterns/types";
import { formatSessionDateLabel } from "@/lib/session/session-display";
import { useState } from "react";

export type IdentityEvidenceItem = {
  id: string;
  /** Underlying source type — drives classification hierarchy. */
  sourceType?: PatternEvidenceSourceType | string;
  /** Human-readable evidence type, e.g. "Approved summary". */
  typeLabel?: string;
  /** e.g. "Session 1" */
  sessionLabel?: string;
  /** UK display date — never a raw ISO timestamp. */
  dateLabel?: string;
  /** ISO/sortable date for chronological presentation only. */
  sortKey?: string | null;
  /** Verbatim authorised excerpt for Manager judgement. */
  excerpt?: string | null;
  href?: string;
  onView?: () => void;
  /** @deprecated Prefer typeLabel + sessionLabel + dateLabel */
  title?: string;
  /** @deprecated Prefer structured fields */
  meta?: string;
};

const SOURCE_TYPE_LABELS: Record<PatternEvidenceSourceType, string> = {
  session_notes: "Session notes",
  approved_summary: "Approved summary",
  commitment: "Commitment / intention",
  development_observation: "Development observation",
  supporting_context: "Supporting context",
  coaching_moment: "Development moment",
};

export function evidenceTypeLabel(
  sourceType: string | PatternEvidenceSourceType
): string {
  if (sourceType in SOURCE_TYPE_LABELS) {
    return SOURCE_TYPE_LABELS[sourceType as PatternEvidenceSourceType];
  }
  return sourceType
    .replace(/_/g, " ")
    .replace(/\b\w/g, char => char.toUpperCase());
}

/**
 * Presentation classification for Pattern Review hierarchy.
 * Distinguishes intention from reported/observed behavioural evidence.
 */
export function evidenceClassificationLabel(
  sourceType?: string | null,
  typeLabel?: string | null
): string {
  const type = (sourceType ?? "").trim();
  if (type === "commitment") return "Commitment / intention";
  if (type === "supporting_context") return "Supporting context";
  if (type === "coaching_moment") return "Development moment";
  if (/commitment/i.test(typeLabel ?? "")) return "Commitment / intention";
  if (/supporting context/i.test(typeLabel ?? "")) return "Supporting context";
  if (/development moment/i.test(typeLabel ?? "")) return "Development moment";
  return "Reported behaviour";
}

/** Format evidence dates for display — UK long form, never raw ISO. */
export function formatEvidenceDateLabel(
  value?: string | null
): string | undefined {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return undefined;
  // Reject obvious raw ISO display by always formatting
  const label = formatSessionDateLabel(trimmed);
  if (!label || label === "Date not set") return undefined;
  // Strip time portion if present (evidence rows show date only)
  return label.split(" · ")[0];
}

/**
 * Display-only: strip a leading list marker so a dash/bullet from list
 * formatting is not shown as meaningful evidence content.
 * Does not rewrite or paraphrase the remainder of the excerpt.
 */
export function stripLeadingListMarker(excerpt: string): string {
  return excerpt.replace(/^\s*[-–—*•·]\s+/, "").trimStart();
}

export function dedupeEvidenceItems(
  items: IdentityEvidenceItem[]
): IdentityEvidenceItem[] {
  const seen = new Set<string>();
  const result: IdentityEvidenceItem[] = [];
  for (const item of items) {
    const type = (item.typeLabel || item.title || "").toLocaleLowerCase("en-GB");
    const softKey = [
      type,
      (item.sessionLabel ?? "").toLocaleLowerCase("en-GB"),
      (item.dateLabel ?? "").toLocaleLowerCase("en-GB"),
      (item.excerpt ?? "").toLocaleLowerCase("en-GB"),
      item.href ?? "",
    ].join("|");
    if (seen.has(softKey)) continue;
    seen.add(softKey);
    result.push(item);
  }
  return result;
}

/**
 * Presentation-only chronological order for Pattern Review scanning.
 * Does not mutate underlying evidence arrays or session numbering.
 */
export function sortEvidenceItemsChronologically(
  items: IdentityEvidenceItem[]
): IdentityEvidenceItem[] {
  return [...items].sort((left, right) => {
    const leftTime = parseSortTime(left);
    const rightTime = parseSortTime(right);
    if (leftTime !== rightTime) return leftTime - rightTime;
    const leftSession = parseSessionNumber(left.sessionLabel);
    const rightSession = parseSessionNumber(right.sessionLabel);
    if (leftSession !== rightSession) return leftSession - rightSession;
    return left.id.localeCompare(right.id);
  });
}

function parseSortTime(item: IdentityEvidenceItem): number {
  const raw = (item.sortKey || item.dateLabel || "").trim();
  if (!raw) return Number.POSITIVE_INFINITY;
  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) return parsed;
  // UK long dates from formatEvidenceDateLabel are not reliably Date.parse-able;
  // fall through to session number / id.
  return Number.POSITIVE_INFINITY;
}

function parseSessionNumber(label?: string): number {
  const match = (label ?? "").match(/(\d+)/);
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
}

function formatSessionLine(item: IdentityEvidenceItem): string | null {
  const typeLabel = item.typeLabel || item.title || "";
  const classification = evidenceClassificationLabel(
    item.sourceType,
    typeLabel
  );
  const isCommitment = /commitment/i.test(classification);

  if (item.sessionLabel && typeLabel && !isCommitment) {
    return `${item.sessionLabel} · ${typeLabel}`;
  }
  if (item.sessionLabel) return item.sessionLabel;
  if (typeLabel && !isCommitment) return typeLabel;
  return null;
}

function EvidenceListItem({ item }: { item: IdentityEvidenceItem }) {
  const [expanded, setExpanded] = useState(false);
  const rawExcerpt = (item.excerpt ?? "").trim();
  const excerpt = rawExcerpt ? stripLeadingListMarker(rawExcerpt) : "";
  const classification = evidenceClassificationLabel(
    item.sourceType,
    item.typeLabel || item.title
  );
  const sessionLine = formatSessionLine(item);
  const hasExpandableExcerpt = excerpt.length > 0;
  const hasAction = Boolean(item.onView || item.href || hasExpandableExcerpt);

  return (
    <li
      className="identity-evidence-list__item"
      data-evidence-class={
        /commitment/i.test(classification)
          ? "commitment"
          : /supporting context/i.test(classification)
            ? "supporting-context"
            : /development moment/i.test(classification)
              ? "development-moment"
              : "reported-behaviour"
      }
    >
      <p className="identity-evidence-list__classification">{classification}</p>

      {sessionLine ? (
        <p className="identity-evidence-list__session">{sessionLine}</p>
      ) : null}

      {item.dateLabel ? (
        <p className="identity-evidence-list__meta">{item.dateLabel}</p>
      ) : null}

      {excerpt ? (
        <p className="identity-evidence-list__excerpt">{excerpt}</p>
      ) : null}

      {expanded && excerpt ? (
        <div className="identity-evidence-list__full" role="region">
          <p className="identity-evidence-list__full-label">
            Authorised source excerpt
          </p>
          <p className="identity-evidence-list__full-body">{excerpt}</p>
        </div>
      ) : null}

      {hasAction ? (
        item.onView ? (
          <button
            type="button"
            className="identity-text-action identity-evidence-list__action"
            onClick={item.onView}
          >
            View full evidence
          </button>
        ) : hasExpandableExcerpt ? (
          <button
            type="button"
            className="identity-text-action identity-evidence-list__action"
            aria-expanded={expanded}
            onClick={() => setExpanded(current => !current)}
          >
            {expanded ? "Hide full evidence" : "View full evidence"}
          </button>
        ) : item.href ? (
          <a
            href={item.href}
            className="identity-text-action identity-evidence-list__action"
          >
            View full evidence
          </a>
        ) : null
      ) : null}
    </li>
  );
}

/**
 * Structured evidence list for Pattern Review and related panels.
 * Hierarchy: classification → session/date → body excerpt → view action.
 */
export function IdentityEvidenceList({
  items,
  chronological = false,
}: {
  items: IdentityEvidenceItem[];
  /** When true, present items oldest→newest for review scanning. */
  chronological?: boolean;
}) {
  const unique = dedupeEvidenceItems(items);
  const ordered = chronological
    ? sortEvidenceItemsChronologically(unique)
    : unique;
  if (ordered.length === 0) return null;

  return (
    <ul className="identity-evidence-list" role="list">
      {ordered.map(item => (
        <EvidenceListItem key={item.id} item={item} />
      ))}
    </ul>
  );
}
