import { redis } from '../db/redis.js';

export interface RateResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

/**
 * Fixed-window counter. A sliding window would be more precise, but this is a
 * brute-force brake, not a billing meter — boring wins.
 *
 * The TTL is set only on the first increment, so a burst cannot keep extending
 * its own window.
 */
export async function consumeAttempt(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateResult> {
  const count = await redis.incr(key);

  if (count === 1) {
    await redis.expire(key, windowSeconds);
  }

  if (count <= limit) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const ttl = await redis.ttl(key);
  return { allowed: false, retryAfterSeconds: ttl > 0 ? ttl : windowSeconds };
}

/** Called after a successful login so a user is not punished for earlier typos. */
export async function resetAttempts(key: string): Promise<void> {
  await redis.del(key);
}
