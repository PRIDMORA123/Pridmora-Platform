import type { PatternEvidenceSourceType } from "@/lib/patterns/types";
import { formatSessionDateLabel } from "@/lib/session/session-display";
import { useState } from "react";

export type IdentityEvidenceItem = {
  id: string;
  /** Human-readable evidence type, e.g. "Approved summary". */
  typeLabel?: string;
  /** e.g. "Session 1" */
  sessionLabel?: string;
  /** UK display date — never a raw ISO timestamp. */
  dateLabel?: string;
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

function formatSourceLine(item: IdentityEvidenceItem): string | null {
  const typeLabel = item.typeLabel || item.title || "Evidence";
  const parts = [item.sessionLabel, typeLabel].filter(Boolean);
  if (parts.length === 0) return null;
  if (item.sessionLabel && typeLabel) {
    return `Source: ${item.sessionLabel} · ${typeLabel}`;
  }
  if (item.dateLabel) {
    return `Source: ${typeLabel} · ${item.dateLabel}`;
  }
  return `Source: ${typeLabel}`;
}

function EvidenceListItem({ item }: { item: IdentityEvidenceItem }) {
  const [expanded, setExpanded] = useState(false);
  const excerpt = (item.excerpt ?? "").trim();
  const sourceLine = formatSourceLine(item);
  const hasExpandableExcerpt = excerpt.length > 0;
  const hasAction = Boolean(item.onView || item.href || hasExpandableExcerpt);

  return (
    <li className="identity-evidence-list__item">
      {excerpt ? (
        <blockquote className="identity-evidence-list__excerpt">
          {excerpt}
        </blockquote>
      ) : null}

      {sourceLine ? (
        <p className="identity-evidence-list__source">{sourceLine}</p>
      ) : (
        <p className="identity-evidence-list__type">
          {item.typeLabel || item.title || "Evidence"}
        </p>
      )}

      {item.dateLabel && item.sessionLabel ? (
        <p className="identity-evidence-list__meta">{item.dateLabel}</p>
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
 * Structured evidence list for Pridmora Intelligence panels.
 * Excerpt first; source metadata secondary; View full evidence for context.
 */
export function IdentityEvidenceList({
  items,
}: {
  items: IdentityEvidenceItem[];
}) {
  const unique = dedupeEvidenceItems(items);
  if (unique.length === 0) return null;

  return (
    <ul className="identity-evidence-list" role="list">
      {unique.map(item => (
        <EvidenceListItem key={item.id} item={item} />
      ))}
    </ul>
  );
}
