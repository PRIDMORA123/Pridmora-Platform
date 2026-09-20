/**
 * Deterministic My Development overview next-step selection.
 * Presentation-only — no AI, no new recommendation API.
 */

import type { CoachingAction } from "@/lib/types";

export type MyDevelopmentNextStep =
  | { kind: "action"; action: CoachingAction }
  | { kind: "reflect-or-talk" }
  | { kind: "set-focus" };

export function isActiveDevelopmentAction(action: CoachingAction): boolean {
  return action.status === "Open" || action.status === "In progress";
}
/**
 * True when an active action has reached its ISO due date.
 * Legacy display-only date strings are deliberately ignored.
 */
export function isDevelopmentActionDue(
  action: CoachingAction,
  today: string
): boolean {
  if (!isActiveDevelopmentAction(action) || !action.due) {
    return false;
  }

  const isoDate = /^\d{4}-\d{2}-\d{2}$/;

  if (!isoDate.test(action.due) || !isoDate.test(today)) {
    return false;
  }

  return action.due <= today;
}

/** Active (Open / In progress) actions in existing workspace order. */
export function listActiveDevelopmentActions(
  actions: CoachingAction[],
  limit = 3
): CoachingAction[] {
  return actions.filter(isActiveDevelopmentAction).slice(0, limit);
}

/**
 * Priority:
 * 1. First Open / In progress action
 * 2. Else if focus exists → reflect or talk
 * 3. Else → set focus
 * Evidence is never the first next step here.
 */
export function resolveMyDevelopmentNextStep(input: {
  focusCount: number;
  actions: CoachingAction[];
}): MyDevelopmentNextStep {
  const active = input.actions.find(isActiveDevelopmentAction);
  if (active) {
    return { kind: "action", action: active };
  }
  if (input.focusCount > 0) {
    return { kind: "reflect-or-talk" };
  }
  return { kind: "set-focus" };
}
