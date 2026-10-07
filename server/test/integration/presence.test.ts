import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../../src/app.js';
import { redis } from '../../src/db/redis.js';
import * as presence from '../../src/modules/presence/service.js';
import {
  CONSENTS,
  DEVICE,
  clearRateLimits,
  startTestApp,
  stopTestApp,
  truncateAll,
  uniqueUser,
} from '../helpers/app.js';

let app: App;

async function register(suffix: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { ...uniqueUser(suffix), device: DEVICE, consents: CONSENTS },
  });

  const body = res.json();
  return {
    userId: body.user.id as string,
    deviceId: body.device.id as string,
    token: body.tokens.accessToken as string,
  };
}

const read = (token: string, ids: string[]) =>
  app.inject({
    method: 'GET',
    url: `/api/v1/presence?userIds=${ids.join(',')}`,
    headers: { authorization: `Bearer ${token}` },
  });

beforeAll(async () => {
  app = await startTestApp();
});

afterAll(async () => {
  await stopTestApp(app);
});

beforeEach(async () => {
  await truncateAll();
  await clearRateLimits();
  const keys = await redis.keys('presence:*');
  if (keys.length > 0) await redis.del(...keys);
});

describe('the last-seen setting', () => {
  it('withholds the time from others while still reporting reachability', async () => {
    const alice = await register('lsa');
    const bob = await register('lsb');

    await app.inject({
      method: 'PATCH',
      url: '/api/v1/me',
      headers: { authorization: `Bearer ${alice.token}` },
      payload: { showLastSeen: false },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/presence?userIds=${alice.userId}`,
      headers: { authorization: `Bearer ${bob.token}` },
    });

    const [state] = res.json().items;
    expect(state.lastSeenAt).toBeNull();
    // The fact is still told — reporting somebody offline while they read your
    // message would be a lie, and this setting is about the clock, not the dot.
    expect(state.online).toBe(false);
  });

  it('is on by default, which is what the product did before it existed', async () => {
    const alice = await register('lsc');

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { authorization: `Bearer ${alice.token}` },
    });
    expect(res.json().showLastSeen).toBe(true);
  });
});

describe('presence', () => {
  it('reports someone as offline until a device checks in', async () => {
    const me = await register('pres_a');

    const res = await read(me.token, [me.userId]);

    expect(res.statusCode).toBe(200);
    expect(res.json().items).toEqual([
      { userId: me.userId, online: false, lastSeenAt: null, statusId: null },
    ]);
  });

  it('reports someone as online after a heartbeat', async () => {
    const me = await register('pres_b');
    await presence.heartbeat(me.userId, me.deviceId);

    const [state] = (await read(me.token, [me.userId])).json().items;

    expect(state.online).toBe(true);
    expect(state.lastSeenAt).not.toBeNull();
  });

  it('keeps the account online while a second device is still connected', async () => {
    const me = await register('pres_c');
    const second = randomUUID();

    await presence.heartbeat(me.userId, me.deviceId);
    await presence.heartbeat(me.userId, second);
    await presence.disconnected(me.userId, me.deviceId);

    // A phone locking its screen must not black out the desktop.
    expect((await read(me.token, [me.userId])).json().items[0].online).toBe(true);

    await presence.disconnected(me.userId, second);
    expect((await read(me.token, [me.userId])).json().items[0].online).toBe(false);
  });

  it('keeps the last-seen time after the last device leaves', async () => {
    const me = await register('pres_d');

    await presence.heartbeat(me.userId, me.deviceId);
    await presence.disconnected(me.userId, me.deviceId);

    const [state] = (await read(me.token, [me.userId])).json().items;
    expect(state.online).toBe(false);
    // Without this the chat header can only say "не в сети", never "был(а) 5 минут назад".
    expect(state.lastSeenAt).not.toBeNull();
  });

  it('still knows when someone was last seen after their device went stale', async () => {
    const me = await register('pres_j');
    await presence.heartbeat(me.userId, me.deviceId);
    await redis.zadd(`presence:${me.userId}`, Date.now() - 10 * 60_000, me.deviceId);

    const [state] = (await read(me.token, [me.userId])).json().items;
    expect(state.online).toBe(false);
    expect(state.lastSeenAt).not.toBeNull();
  });

  it('treats a device that stopped sending heartbeats as gone', async () => {
    const me = await register('pres_e');
    await presence.heartbeat(me.userId, me.deviceId);

    // Backdate the heartbeat past the stale window without waiting for it.
    await redis.zadd(`presence:${me.userId}`, Date.now() - 10 * 60_000, me.deviceId);

    expect((await read(me.token, [me.userId])).json().items[0].online).toBe(false);
  });

  it('answers for several people in one call, in the order asked', async () => {
    const me = await register('pres_f');
    const other = await register('pres_g');
    await presence.heartbeat(other.userId, other.deviceId);

    const items = (await read(me.token, [me.userId, other.userId])).json().items;

    expect(items.map((i: { userId: string }) => i.userId)).toEqual([me.userId, other.userId]);
    expect(items[0].online).toBe(false);
    expect(items[1].online).toBe(true);
  });

  it('refuses a query without authentication', async () => {
    const me = await register('pres_h');
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/presence?userIds=${me.userId}`,
    });

    expect(res.statusCode).toBe(401);
  });

  it('rejects ids that are not uuids instead of guessing', async () => {
    const me = await register('pres_i');
    const res = await read(me.token, ['not-a-uuid']);

    expect(res.statusCode).toBe(400);
  });
});

/**
 * Defect #11: the status was stored and never asked about, so everyone was
 * green or nothing. Presence now carries what to show, and the rule that
 * decides it is a pure function — the cases below are the whole of it.
 */
describe('the status behind the dot', () => {
  const setStatus = (token: string, payload: Record<string, unknown>) =>
    app.inject({
      method: 'PATCH',
      url: '/api/v1/me',
      headers: { authorization: `Bearer ${token}` },
      payload,
    });

  it('says nothing about somebody who is offline', () => {
    expect(presence.effectiveStatus('dnd', false, false, 0)).toBeNull();
  });

  it('reports the status a person chose, as chosen', () => {
    expect(presence.effectiveStatus('focus', false, true, 10 * 60_000)).toBe('focus');
  });

  it('follows activity when asked to, and calls a quiet machine away', () => {
    expect(presence.effectiveStatus('on', true, true, 0)).toBe('on');
    expect(presence.effectiveStatus('on', true, true, presence.AWAY_AFTER_MS - 1)).toBe('on');
    expect(presence.effectiveStatus('on', true, true, presence.AWAY_AFTER_MS)).toBe('away');
  });

  /** Automatic is about noticing absence, not about overruling a decision. */
  it('leaves "do not disturb" alone even on automatic', () => {
    expect(presence.effectiveStatus('dnd', true, true, 0)).toBe('dnd');
    expect(presence.effectiveStatus('off', true, true, 10 * 60_000)).toBe('off');
  });

  it('treats a client that cannot measure idleness as present', () => {
    expect(presence.effectiveStatus('on', true, true, null)).toBe('on');
  });

  it('carries the chosen status to whoever asks about presence', async () => {
    const alice = await register('st_a');
    const bob = await register('st_b');

    await setStatus(alice.token, { statusId: 'dnd', statusAuto: false });
    await presence.heartbeat(alice.userId, alice.deviceId);

    const [state] = (await read(bob.token, [alice.userId])).json().items;
    expect(state.online).toBe(true);
    expect(state.statusId).toBe('dnd');
  });

  it('turns an automatic status to away once the machine goes quiet', async () => {
    const alice = await register('st_c');
    const bob = await register('st_d');

    await setStatus(alice.token, { statusId: 'on', statusAuto: true });

    await presence.heartbeat(alice.userId, alice.deviceId, 0);
    expect((await read(bob.token, [alice.userId])).json().items[0].statusId).toBe('on');

    await presence.heartbeat(alice.userId, alice.deviceId, 30 * 60);
    expect((await read(bob.token, [alice.userId])).json().items[0].statusId).toBe('away');
  });

  /** One machine idle and another in use is a person at their desk. */
  it('takes the busiest device, not the quietest', async () => {
    const alice = await register('st_e');
    const bob = await register('st_f');
    const phone = randomUUID();

    await setStatus(alice.token, { statusId: 'on', statusAuto: true });
    await presence.heartbeat(alice.userId, phone, 60 * 60);
    await presence.heartbeat(alice.userId, alice.deviceId, 0);

    expect((await read(bob.token, [alice.userId])).json().items[0].statusId).toBe('on');
  });

  it('ignores an idle time a client made up', async () => {
    const alice = await register('st_g');
    const bob = await register('st_h');

    await setStatus(alice.token, { statusId: 'on', statusAuto: true });
    await presence.heartbeat(alice.userId, alice.deviceId, Number.NaN);

    expect((await read(bob.token, [alice.userId])).json().items[0].statusId).toBe('on');
  });
});
