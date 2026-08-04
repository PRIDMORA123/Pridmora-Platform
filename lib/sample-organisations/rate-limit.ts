/**
 * Lightweight in-process rate limit for sample organisation mutating routes.
 * Not a substitute for permission checks or database locks.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function checkSampleOrganisationRateLimit(input: {
  userId: string;
  action: string;
  limit?: number;
  windowMs?: number;
}): { ok: true } | { ok: false; retryAfterSeconds: number } {
  const limit = input.limit ?? 5;
  const windowMs = input.windowMs ?? 60_000;
  const key = `${input.userId}:${input.action}`;
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
