/**
 * Display helpers for the Development stage snapshot.
 * Insight first; evidence and long narrative only on request.
 */

import type { SupportingContextItem } from "@/lib/relationship-meta";
import { SUPPORTING_CONTEXT_SOURCE_LABELS } from "@/lib/relationship-meta";

export type DevelopmentSnapshotModel = {
  direction: string;
  strengths: string[];
  priorities: string[];
  progress: string;
  coachingConsiderations: string;
  supportingContext: Array<{
    id: string;
    title: string;
    meta: string;
  }>;
};

function truncate(value: string, max = 180): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).replace(/\s+\S*$/, "").replace(/[.,;:!?]+$/, "")}…`;
}

export function buildDevelopmentSnapshotModel(input: {
  currentDirection?: string | null;
  strengths?: string[];
  priorities?: string[];
  progress?: string | null;
  coachingConsiderations?: string | null;
  supportingContext?: SupportingContextItem[];
}): DevelopmentSnapshotModel {
  const supportingContext = (input.supportingContext ?? []).map(item => {
    const source =
      SUPPORTING_CONTEXT_SOURCE_LABELS[item.sourceType] ?? "Supporting context";
    const date = item.sourceDate?.trim() || "";
    const usage = item.useForAiPreparation
      ? "Used for preparation"
      : "Reference only";
    return {
      id: item.id,
      title: item.title.trim() || source,
      meta: [date, usage].filter(Boolean).join(" · "),
    };
  });

  return {
    direction:
      truncate(input.currentDirection ?? "", 200) ||
      "A clearer development direction is still emerging.",
    strengths: (input.strengths ?? []).filter(Boolean).slice(0, 5),
    priorities: (input.priorities ?? []).filter(Boolean).slice(0, 5),
    progress: truncate(input.progress ?? "", 220),
    coachingConsiderations: truncate(input.coachingConsiderations ?? "", 220),
    supportingContext,
  };
}

export function formatSupportingContextSummary(
  items: SupportingContextItem[] | undefined | null
): string {
  const count = items?.length ?? 0;
  if (count === 0) return "None";
  return count === 1 ? "1 item" : `${count} items`;
}
