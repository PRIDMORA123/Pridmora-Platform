import type { DevelopmentStatus } from "@/components/identity/development-status-chip";
import { developmentStatusFromConfidence } from "@/lib/development-status";
import type { DevelopmentProfileViewModel } from "@/types/development-profile";
import { distinctSessionIds } from "@/lib/patterns/evidence";
import type { CoachingPattern } from "@/lib/patterns/types";

export type DevelopmentSnapshotArea = {
  id: string;
  label: string;
  status: DevelopmentStatus;
};

export type DevelopmentSnapshotModel = {
  hasEnoughEvidence: boolean;
  currentDirection: string;
  progressSinceLabel: string;
  areas: DevelopmentSnapshotArea[];
  currentFocus: string;
  evidenceNote: string;
};

function sessionRangeLabel(sessionNumbers: number[]): string {
  const unique = [...new Set(sessionNumbers.filter(n => n > 0))].sort(
    (a, b) => a - b
  );
  if (unique.length === 0) return "";
  if (unique.length === 1) return `Session ${unique[0]}`;
  return `Sessions ${unique[0]}–${unique[unique.length - 1]}`;
}

/**
 * Relationship-level Development Snapshot from approved evidence only.
 * Qualitative states — no percentages or invented progress.
 */
export function buildRelationshipDevelopmentSnapshot(input: {
  data: DevelopmentProfileViewModel;
  patterns?: CoachingPattern[];
  sessionNumbers?: Map<string, number>;
  completedSessionCount?: number;
}): DevelopmentSnapshotModel {
  const { data, patterns = [], sessionNumbers } = input;
  const completedSessionCount =
    input.completedSessionCount ??
    Math.max(
      data.milestones.filter(m => m.sourceType === "conversation" || m.sourceType === "summary")
        .length,
      0
    );

  const areas: DevelopmentSnapshotArea[] = data.themes.slice(0, 4).map(theme => ({
    id: theme.id,
    label: theme.name,
    status: developmentStatusFromConfidence(theme.confidence, theme.evidenceCount),
  }));

  const patternSessionNumbers: number[] = [];
  for (const pattern of patterns) {
    if (pattern.coachAccepted === false || pattern.suppressed) continue;
    for (const id of distinctSessionIds(pattern.evidence)) {
      const number = sessionNumbers?.get(id);
      if (number != null) patternSessionNumbers.push(number);
    }
  }

  const range =
    sessionRangeLabel(patternSessionNumbers) ||
    (completedSessionCount > 0
      ? completedSessionCount === 1
        ? "Session 1"
        : `Sessions 1–${completedSessionCount}`
      : "");

  const hasEnoughEvidence =
    areas.length > 0 &&
    (completedSessionCount >= 1 ||
      Boolean(data.currentDirection?.trim()) ||
      data.behaviouralEvidence.length > 0 ||
      patterns.some(p => p.coachAccepted !== false && !p.suppressed));

  const currentFocus =
    data.lookingAhead[0]?.replace(/^Continue exploring:\s*/i, "").trim() ||
    data.currentDirection?.trim() ||
    "";

  return {
    hasEnoughEvidence,
    currentDirection:
      data.currentDirection?.trim() ||
      "A clearer development direction is still emerging.",
    progressSinceLabel:
      completedSessionCount > 0
        ? `Progress since Session 1`
        : "Progress",
    areas,
    currentFocus,
    evidenceNote: range
      ? `Based on approved coaching evidence from ${range}.`
      : "Based on approved coaching evidence.",
  };
}
