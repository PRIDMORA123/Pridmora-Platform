import { findIncompleteCurrentSession } from "@/lib/relationship-workspace/session-workspace-state";
import { nextSessionNumber } from "@/lib/sessions";
import type { Session } from "@/lib/types";

export type AddSessionFormValues = {
  title: string;
  plannedDate: string;
  startTime: string;
  focus: string;
};

export type IncompleteSessionWarning = {
  sessionNumber: number;
  sessionId: string;
  message: string;
};

/**
 * Soft warning when adding another conversation while one remains incomplete.
 * Does not hard-block.
 */
export function getIncompleteSessionWarning(
  sessions: Session[]
): IncompleteSessionWarning | null {
  const incomplete = findIncompleteCurrentSession(sessions);
  if (!incomplete) return null;

  // Only warn when work is actively underway, not merely planned.
  if (
    incomplete.status !== "in_progress" &&
    incomplete.status !== "paused" &&
    incomplete.status !== "awaiting_completion"
  ) {
    return null;
  }

  return {
    sessionNumber: incomplete.sessionNumber,
    sessionId: incomplete.id,
    message: `Session ${incomplete.sessionNumber} is still in progress. Add another conversation anyway?`,
  };
}

export function allocateNextSessionNumber(sessions: Session[]): number {
  return nextSessionNumber(sessions);
}

export function defaultSessionTitle(sessionNumber: number): string {
  return `Session ${sessionNumber}`;
}
