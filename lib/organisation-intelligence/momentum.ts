import { MOMENTUM_METHODOLOGY } from "@/lib/organisation-intelligence/constants";
import type { TrendDirection } from "@/lib/organisation-intelligence/constants";

export type MomentumInputs = {
  completedConversations: number;
  completedActions: number;
  completedReflections: number;
  developmentUpdates: number;
  evidenceItems: number;
  previousCompletedConversations: number;
  previousCompletedActions: number;
  previousCompletedReflections: number;
  previousDevelopmentUpdates: number;
  previousEvidenceItems: number;
  hasEarlierPeriodActivity: boolean;
};

/**
 * Development Momentum — transparent weighted directional measure.
 * Not a psychological score.
 *
 * Weights (sum 1.0):
 * - completed conversations 0.25
 * - completed actions 0.25
 * - completed reflections 0.15
 * - development updates 0.20
 * - evidence progression 0.15
 *
 * Each component is scaled relative to a soft activity ceiling so the
 * score sits roughly 0–100 for typical organisational volumes.
 */
export const MOMENTUM_WEIGHTS = {
  conversations: 0.25,
  actions: 0.25,
  reflections: 0.15,
  developmentUpdates: 0.2,
  evidence: 0.15,
} as const;

const WEIGHTS = MOMENTUM_WEIGHTS;

const SOFT_CEILINGS = {
  conversations: 40,
  actions: 40,
  reflections: 30,
  developmentUpdates: 30,
  evidence: 60,
} as const;

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function componentScore(count: number, ceiling: number): number {
  if (count <= 0) return 0;
  return Math.min(1, count / ceiling) * 100;
}

export function calculateDevelopmentMomentum(input: MomentumInputs): {
  value: number;
  previousValue: number | null;
  direction: TrendDirection;
  comparisonAvailable: boolean;
  methodology: string;
  components: Record<string, number>;
  previousComponents: Record<string, number> | null;
} {
  const components = {
    conversations: componentScore(
      input.completedConversations,
      SOFT_CEILINGS.conversations
    ),
    actions: componentScore(input.completedActions, SOFT_CEILINGS.actions),
    reflections: componentScore(
      input.completedReflections,
      SOFT_CEILINGS.reflections
    ),
    developmentUpdates: componentScore(
      input.developmentUpdates,
      SOFT_CEILINGS.developmentUpdates
    ),
    evidence: componentScore(input.evidenceItems, SOFT_CEILINGS.evidence),
  };

  const value = clampScore(
    components.conversations * WEIGHTS.conversations +
      components.actions * WEIGHTS.actions +
      components.reflections * WEIGHTS.reflections +
      components.developmentUpdates * WEIGHTS.developmentUpdates +
      components.evidence * WEIGHTS.evidence
  );

  const comparisonAvailable = input.hasEarlierPeriodActivity;
  let previousValue: number | null = null;
  let direction: TrendDirection = "unavailable";
  let previousComponents: Record<string, number> | null = null;

  if (comparisonAvailable) {
    previousComponents = {
      conversations: componentScore(
        input.previousCompletedConversations,
        SOFT_CEILINGS.conversations
      ),
      actions: componentScore(
        input.previousCompletedActions,
        SOFT_CEILINGS.actions
      ),
      reflections: componentScore(
        input.previousCompletedReflections,
        SOFT_CEILINGS.reflections
      ),
      developmentUpdates: componentScore(
        input.previousDevelopmentUpdates,
        SOFT_CEILINGS.developmentUpdates
      ),
      evidence: componentScore(
        input.previousEvidenceItems,
        SOFT_CEILINGS.evidence
      ),
    };
    previousValue = clampScore(
      previousComponents.conversations * WEIGHTS.conversations +
        previousComponents.actions * WEIGHTS.actions +
        previousComponents.reflections * WEIGHTS.reflections +
        previousComponents.developmentUpdates * WEIGHTS.developmentUpdates +
        previousComponents.evidence * WEIGHTS.evidence
    );

    const delta = value - previousValue;
    if (Math.abs(delta) <= 3) direction = "stable";
    else if (delta > 3) direction = "up";
    else direction = "down";
  }

  return {
    value,
    previousValue,
    direction,
    comparisonAvailable,
    methodology: MOMENTUM_METHODOLOGY,
    components,
    previousComponents,
  };
}

export function rateFromCounts(completed: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((completed / total) * 1000) / 10;
}

export function compareNumericDirection(
  current: number | null,
  previous: number | null,
  comparisonAvailable: boolean,
  epsilon = 0.5
): TrendDirection {
  if (!comparisonAvailable || current == null || previous == null) {
    return "unavailable";
  }
  const delta = current - previous;
  if (Math.abs(delta) <= epsilon) return "stable";
  return delta > 0 ? "up" : "down";
}
