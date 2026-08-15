import type {
  CategoryChanges,
  EvidenceSummaryItem,
  ProposedProfileChanges,
  ProfileEntryStatus,
} from "@/lib/development-updates/types";
import { profileEntryStatusLabel } from "@/lib/development-updates/types";
import { stripBracketedEvidenceStatusMarkers } from "@/lib/development-updates/evidence-status";

export type ChangeDisplayItem = {
  key: string;
  categoryKey: keyof ProposedProfileChanges | "currentFocus" | "commitments";
  categoryLabel: string;
  title: string;
  body: string;
  statusLabel?: string;
  kind: "focus" | "add" | "update" | "remove" | "complete";
};

const CATEGORY_LABELS: Array<{
  key: keyof ProposedProfileChanges;
  label: string;
}> = [
  { key: "strengths", label: "Strength" },
  { key: "values", label: "Value" },
  { key: "motivators", label: "Motivator" },
  { key: "emergingThemes", label: "Development theme" },
  { key: "growthAreas", label: "Recommended development focus" },
  { key: "coachingPreferences", label: "Coaching preference" },
  { key: "beliefs", label: "Belief" },
  { key: "patterns", label: "Pattern" },
];

function statusFrom(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return profileEntryStatusLabel(value as ProfileEntryStatus);
}

function categoryItems(
  categoryKey: keyof ProposedProfileChanges,
  categoryLabel: string,
  changes: CategoryChanges | undefined
): ChangeDisplayItem[] {
  if (!changes) return [];
  const items: ChangeDisplayItem[] = [];

  (changes.add ?? []).forEach((entry, index) => {
    items.push({
      key: `${categoryKey}.add.${index}`,
      categoryKey,
      categoryLabel,
      title: categoryLabel,
      body: stripBracketedEvidenceStatusMarkers(entry.value),
      statusLabel: statusFrom(entry.status),
      kind: "add",
    });
  });

  (changes.update ?? []).forEach((entry, index) => {
    items.push({
      key: `${categoryKey}.update.${index}`,
      categoryKey,
      categoryLabel,
      title: `Updated ${categoryLabel.toLowerCase()}`,
      body: stripBracketedEvidenceStatusMarkers(entry.value),
      statusLabel: statusFrom(entry.status),
      kind: "update",
    });
  });

  (changes.remove ?? []).forEach((entry, index) => {
    const value =
      typeof entry === "string" ? entry : entry.value || entry.id || "Removed item";
    items.push({
      key: `${categoryKey}.remove.${index}`,
      categoryKey,
      categoryLabel,
      title: `Remove ${categoryLabel.toLowerCase()}`,
      body: stripBracketedEvidenceStatusMarkers(value),
      kind: "remove",
    });
  });

  return items;
}

export function buildChangeDisplayItems(
  changes: ProposedProfileChanges
): ChangeDisplayItem[] {
  const items: ChangeDisplayItem[] = [];

  if (changes.currentFocus?.value?.trim()) {
    items.push({
      key: "currentFocus",
      categoryKey: "currentFocus",
      categoryLabel: "Recommended development position",
      title: "Recommended development position",
      body: stripBracketedEvidenceStatusMarkers(changes.currentFocus.value.trim()),
      kind: "focus",
    });
  }

  for (const category of CATEGORY_LABELS) {
    items.push(
      ...categoryItems(
        category.key,
        category.label,
        changes[category.key] as CategoryChanges | undefined
      )
    );
  }

  const commitments = changes.commitments;
  if (commitments) {
    (commitments.add ?? []).forEach((entry, index) => {
      items.push({
        key: `commitments.add.${index}`,
        categoryKey: "commitments",
        categoryLabel: "Commitment",
        title: "Commitment",
        body: stripBracketedEvidenceStatusMarkers(entry.value),
        kind: "add",
      });
    });
    (commitments.complete ?? []).forEach((entry, index) => {
      const value =
        typeof entry === "string" ? entry : entry.value || entry.id || "Commitment";
      items.push({
        key: `commitments.complete.${index}`,
        categoryKey: "commitments",
        categoryLabel: "Commitment",
        title: "Completed commitment",
        body: stripBracketedEvidenceStatusMarkers(value),
        kind: "complete",
      });
    });
    (commitments.remove ?? []).forEach((entry, index) => {
      const value =
        typeof entry === "string" ? entry : entry.value || entry.id || "Commitment";
      items.push({
        key: `commitments.remove.${index}`,
        categoryKey: "commitments",
        categoryLabel: "Commitment",
        title: "Remove commitment",
        body: stripBracketedEvidenceStatusMarkers(value),
        kind: "remove",
      });
    });
  }

  return items;
}

export function evidenceForChange(
  evidence: EvidenceSummaryItem[],
  changeKey: string
): EvidenceSummaryItem[] {
  return evidence.filter(item => item.changeKey === changeKey);
}

export function cloneProposedChanges(
  changes: ProposedProfileChanges
): ProposedProfileChanges {
  return JSON.parse(JSON.stringify(changes)) as ProposedProfileChanges;
}

export function removeChangeByKey(
  changes: ProposedProfileChanges,
  key: string
): ProposedProfileChanges {
  const next = cloneProposedChanges(changes);

  if (key === "currentFocus") {
    delete next.currentFocus;
    return next;
  }

  const [category, action, indexText] = key.split(".");
  const index = Number(indexText);
  if (!category || !action || Number.isNaN(index)) return next;

  if (category === "commitments") {
    const bucket = next.commitments;
    if (!bucket) return next;
    if (action === "add" && bucket.add) {
      bucket.add = bucket.add.filter((_, i) => i !== index);
    }
    if (action === "complete" && bucket.complete) {
      bucket.complete = bucket.complete.filter((_, i) => i !== index);
    }
    if (action === "remove" && bucket.remove) {
      bucket.remove = bucket.remove.filter((_, i) => i !== index);
    }
    return next;
  }

  const categoryKey = category as keyof ProposedProfileChanges;
  const bucket = next[categoryKey] as CategoryChanges | undefined;
  if (!bucket) return next;
  if (action === "add" && bucket.add) {
    bucket.add = bucket.add.filter((_, i) => i !== index);
  }
  if (action === "update" && bucket.update) {
    bucket.update = bucket.update.filter((_, i) => i !== index);
  }
  if (action === "remove" && bucket.remove) {
    bucket.remove = bucket.remove.filter((_, i) => i !== index);
  }
  return next;
}

export function updateChangeValueByKey(
  changes: ProposedProfileChanges,
  key: string,
  value: string
): ProposedProfileChanges {
  const next = cloneProposedChanges(changes);
  const trimmed = value.trim();

  if (key === "currentFocus") {
    if (!next.currentFocus) {
      next.currentFocus = { action: "replace", value: trimmed };
    } else {
      next.currentFocus.value = trimmed;
    }
    return next;
  }

  const [category, action, indexText] = key.split(".");
  const index = Number(indexText);
  if (!category || !action || Number.isNaN(index)) return next;

  if (category === "commitments") {
    if (action === "add" && next.commitments?.add?.[index]) {
      next.commitments.add[index] = {
        ...next.commitments.add[index],
        value: trimmed,
      };
    }
    return next;
  }

  const categoryKey = category as keyof ProposedProfileChanges;
  const bucket = next[categoryKey] as CategoryChanges | undefined;
  if (!bucket) return next;
  if (action === "add" && bucket.add?.[index]) {
    bucket.add[index] = { ...bucket.add[index], value: trimmed };
  }
  if (action === "update" && bucket.update?.[index]) {
    bucket.update[index] = { ...bucket.update[index], value: trimmed };
  }
  return next;
}
