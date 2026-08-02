/**
 * Product analytics for Coaching Moments.
 * Track interaction events only — never conversation content.
 */

export type CoachingMomentAnalyticsEvent =
  | "coaching_moment_started"
  | "guidance_requested"
  | "guidance_succeeded"
  | "guidance_failed"
  | "continued_without_guidance"
  | "coaching_moment_captured"
  | "insight_requested"
  | "insight_accepted"
  | "insight_discarded";

export type CoachingMomentAnalyticsPayload = {
  event: CoachingMomentAnalyticsEvent;
  relationshipId?: string;
  momentId?: string;
  status?: string;
};

/**
 * Safe structured product event. Never include situation, notes, or AI text.
 */
export function trackCoachingMomentEvent(
  payload: CoachingMomentAnalyticsPayload
): void {
  try {
    console.info("[analytics]", {
      feature: "coaching_moments",
      event: payload.event,
      relationshipId: payload.relationshipId ?? null,
      momentId: payload.momentId ?? null,
      status: payload.status ?? null,
      at: new Date().toISOString(),
    });
  } catch {
    // Analytics must never break the product path.
  }
}
