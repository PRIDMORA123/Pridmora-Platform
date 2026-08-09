import type { PatternEvidenceSourceType } from "@/lib/patterns/types";
import { formatSessionDateLabel } from "@/lib/session/session-display";

export type IdentityEvidenceItem = {
  id: string;
  /** Human-readable evidence type, e.g. "Approved summary". */
  typeLabel?: string;
  /** e.g. "Session 1" */
  sessionLabel?: string;
  /** UK display date — never a raw ISO timestamp. */
  dateLabel?: string;
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
  commitment: "Commitment",
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
      item.href ?? "",
    ].join("|");
    if (seen.has(softKey)) continue;
    seen.add(softKey);
    result.push(item);
  }
  return result;
}

/**
 * Structured evidence list for Pridmora Intelligence panels.
 * Legacy internal component namespace retained for compatibility.
 * Type · session · readable date · View evidence action.
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
      {unique.map(item => {
        const typeLabel = item.typeLabel || item.title || "Evidence";
        const metaParts = [item.sessionLabel, item.dateLabel].filter(Boolean);
        const legacyMeta = item.meta && metaParts.length === 0 ? item.meta : null;
        const hasAction = Boolean(item.href || item.onView);

        return (
          <li key={item.id} className="identity-evidence-list__item">
            <p className="identity-evidence-list__type">{typeLabel}</p>
            {metaParts.length > 0 ? (
              <p className="identity-evidence-list__meta">
                {metaParts.join(" · ")}
              </p>
            ) : legacyMeta ? (
              <p className="identity-evidence-list__meta">{legacyMeta}</p>
            ) : null}
            {hasAction ? (
              item.onView ? (
                <button
                  type="button"
                  className="identity-text-action identity-evidence-list__action"
                  onClick={item.onView}
                >
                  View evidence
                </button>
              ) : (
                <a
                  href={item.href}
                  className="identity-text-action identity-evidence-list__action"
                >
                  View evidence
                </a>
              )
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
