import { LIMITS } from '@bmf/shared';
import { sql } from '../../db/client.js';
import { redis } from '../../db/redis.js';

/**
 * Presence lives in Redis, not Postgres (spec section 5): it changes on every
 * heartbeat and is worthless after a restart, so writing it to disk would be
 * pure cost.
 *
 * One sorted set per user, device id scored by the last heartbeat. A device that
 * stops sending is dropped by score rather than by an explicit goodbye, which is
 * what makes a killed process or a lost connection resolve itself.
 */
const key = (userId: string) => `presence:${userId}`;

/**
 * When the person was last seen, kept apart from the device set.
 *
 * The set is swept as devices go stale, so it cannot answer "был(а) 5 минут
 * назад" — the entry that knew is exactly the one removed. This survives.
 */
const seenKey = (userId: string) => `presence:last:${userId}`;

/**
 * When each device last saw its machine actually being used, scored by that
 * moment rather than by the heartbeat.
 *
 * An idle device still heartbeats — that is the point of a heartbeat — so the
 * two facts cannot share a set. Keeping the moment of activity rather than the
 * idle span means the number stays true between pings instead of ageing into a
 * lie, and a device that goes quiet is swept by the same TTL as the rest.
 */
const activeKey = (userId: string) => `presence:active:${userId}`;

/** Two missed heartbeats before a device is considered gone. */
const STALE_MS = LIMITS.wsHeartbeatMs * 2 + 5_000;

/** The set outlives the last heartbeat only long enough to be swept. */
const KEY_TTL_SECONDS = Math.ceil((STALE_MS * 2) / 1000);

/** Long enough to be useful, short enough not to accumulate forever. */
const SEEN_TTL_SECONDS = 30 * 24 * 60 * 60;

export async function touch(
  userId: string,
  deviceId: string,
  idleSeconds?: number,
): Promise<void> {
  const now = Date.now();
  // A client that cannot measure idleness counts as active: guessing "away" for
  // a browser tab would mark people away for sitting in one.
  const activeAt = now - Math.max(0, idleSeconds ?? 0) * 1000;

  await redis
    .multi()
    .zadd(key(userId), now, deviceId)
    .expire(key(userId), KEY_TTL_SECONDS)
    .zadd(activeKey(userId), activeAt, deviceId)
    .expire(activeKey(userId), KEY_TTL_SECONDS)
    .set(seenKey(userId), now, 'EX', SEEN_TTL_SECONDS)
    .exec();
}

export async function drop(userId: string, deviceId: string): Promise<void> {
  // The moment of leaving is the moment last seen.
  await redis
    .multi()
    .zrem(key(userId), deviceId)
    .zrem(activeKey(userId), deviceId)
    .set(seenKey(userId), Date.now(), 'EX', SEEN_TTL_SECONDS)
    .exec();
}

/** Reads several users at once; the chat list asks about everyone it shows. */
export async function read(
  userIds: string[],
): Promise<Map<string, { online: boolean; lastSeen: number | null; activeAt: number | null }>> {
  const result = new Map<
    string,
    { online: boolean; lastSeen: number | null; activeAt: number | null }
  >();
  if (userIds.length === 0) return result;

  const cutoff = Date.now() - STALE_MS;
  const pipeline = redis.multi();
  for (const userId of userIds) {
    // Sweep on read: a device whose process died never sent a goodbye.
    pipeline.zremrangebyscore(key(userId), '-inf', cutoff);
    pipeline.zrange(key(userId), -1, -1, 'WITHSCORES');
    pipeline.get(seenKey(userId));
    // The most recent activity across this person's devices: a phone left on a
    // table must not make the desktop they are typing on look idle.
    pipeline.zrange(activeKey(userId), -1, -1, 'WITHSCORES');
  }

  const replies = (await pipeline.exec()) ?? [];
  const STRIDE = 4;

  userIds.forEach((userId, index) => {
    const [, newest] = replies[index * STRIDE + 1] ?? [];
    const [, seen] = replies[index * STRIDE + 2] ?? [];
    const [, active] = replies[index * STRIDE + 3] ?? [];

    const pair = Array.isArray(newest) ? (newest as string[]) : [];
    const score = pair[1] ? Number(pair[1]) : null;
    const lastSeen = typeof seen === 'string' ? Number(seen) : score;

    const activePair = Array.isArray(active) ? (active as string[]) : [];
    const activeAt = activePair[1] ? Number(activePair[1]) : null;

    result.set(userId, {
      online: score !== null && score > cutoff,
      lastSeen: Number.isFinite(lastSeen) ? lastSeen : null,
      activeAt: activeAt !== null && Number.isFinite(activeAt) ? activeAt : null,
    });
  });

  return result;
}

/**
 * Everyone who shares a chat with this user — the audience for a presence
 * change. Anyone else has no way to see the person, so telling them would leak
 * that the account exists.
 */
export async function observersOf(userId: string): Promise<string[]> {
  const rows = await sql<{ userId: string }[]>`
    select distinct other.user_id
    from chat_members mine
    join chat_members other on other.chat_id = mine.chat_id
    where mine.user_id = ${userId} and other.user_id <> ${userId}`;

  return rows.map((row) => row.userId);
}
