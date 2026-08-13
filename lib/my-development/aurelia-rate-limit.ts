/**
 * Lightweight in-process rate limit for Manager Aurelia chat.
 * Pilot-scale only — not a billing subsystem.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function checkManagerAureliaRateLimit(input: {
  userId: string;
  organisationId: string;
  limit?: number;
  windowMs?: number;
}): { ok: true } | { ok: false; retryAfterSeconds: number } {
  const limit = input.limit ?? 30;
  const windowMs = input.windowMs ?? 10 * 60_000;
  const key = `${input.organisationId}:${input.userId}:aurelia-chat`;
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }

  if (existing.count >= limit) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return { ok: true };
}
