import type { AvailableEvidenceItem } from "@/lib/reports/types";

export function EvidenceSelectionItem({
  item,
  selected,
  onChange,
}: {
  item: AvailableEvidenceItem;
  selected: boolean;
  onChange: (selected: boolean) => void;
}) {
  return (
    <label className="evidence-selection-item">
      <input
        type="checkbox"
        checked={selected}
        onChange={event => onChange(event.target.checked)}
      />

      <span>
        <strong>{item.title}</strong>
        <span>{item.summary}</span>
        <small>{item.sourceLabel}</small>
      </span>
    </label>
  );
}
