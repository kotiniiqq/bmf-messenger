import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { consumeAttempt, resetAttempts } from '../../src/lib/rate-limit.js';
import { isDeviceRevoked, revokeAccessFor } from '../../src/modules/auth/plugin.js';
import { redis } from '../../src/db/redis.js';

const KEY = 'test:rate:subject';
const DEVICE = 'device-under-test';

describe('rate limiting', () => {
  beforeEach(async () => {
    await resetAttempts(KEY);
  });

  it('allows attempts up to the limit', async () => {
    for (let i = 0; i < 3; i += 1) {
      await expect(consumeAttempt(KEY, 3, 60)).resolves.toMatchObject({ allowed: true });
    }
  });

  it('blocks past the limit and reports a wait', async () => {
    for (let i = 0; i < 3; i += 1) await consumeAttempt(KEY, 3, 60);
    const blocked = await consumeAttempt(KEY, 3, 60);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('forgets the counter after a reset', async () => {
    for (let i = 0; i < 3; i += 1) await consumeAttempt(KEY, 3, 60);
    await resetAttempts(KEY);
    await expect(consumeAttempt(KEY, 3, 60)).resolves.toMatchObject({ allowed: true });
  });
});

describe('access revocation denylist', () => {
  it('reports an untouched device as live', async () => {
    await expect(isDeviceRevoked('never-revoked-device')).resolves.toBe(false);
  });

  it('reports a revoked device immediately', async () => {
    await revokeAccessFor(DEVICE);
    await expect(isDeviceRevoked(DEVICE)).resolves.toBe(true);
  });

  it('expires the entry rather than keeping it forever', async () => {
    await revokeAccessFor(DEVICE);
    const ttl = await redis.ttl(`revoked:device:${DEVICE}`);
    expect(ttl).toBeGreaterThan(0);
  });
});

afterAll(async () => {
  await redis.del(KEY, `revoked:device:${DEVICE}`);
  redis.disconnect();
});
