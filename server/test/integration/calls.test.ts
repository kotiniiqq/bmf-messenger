import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../../src/app.js';
import { sql } from '../../src/db/client.js';
import * as calls from '../../src/modules/calls/service.js';
import {
  CONSENTS,
  DEVICE,
  clearRateLimits,
  startTestApp,
  stopTestApp,
  truncateAll,
  uniqueUser,
} from '../helpers/app.js';

/**
 * The media plane is LiveKit's problem; what is tested here is the half that
 * decides who may join, which is the half a client must never be trusted with.
 *
 * These run with LiveKit configured through the environment — see the env block
 * in .github/workflows/ci.yml. Without it the module correctly refuses to start
 * a call, which is its own test below.
 */
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
    token: body.tokens.accessToken as string,
  };
}

async function directChat(token: string, otherUserId: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/chats/direct',
    headers: { authorization: `Bearer ${token}` },
    payload: { userId: otherUserId },
  });
  return res.json().id as string;
}

const start = (token: string, chatId: string, kind = 'audio') =>
  app.inject({
    method: 'POST',
    url: `/api/v1/calls/${chatId}/start`,
    headers: { authorization: `Bearer ${token}` },
    payload: { kind },
  });

const active = (token: string) =>
  app.inject({
    method: 'GET',
    url: '/api/v1/calls/active',
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
});

describe('starting a call', () => {
  it('hands back a token, a url and relay servers', async () => {
    const caller = await register('caller');
    const callee = await register('callee');
    const chatId = await directChat(caller.token, callee.userId);

    const res = await start(caller.token, chatId, 'video');
    expect(res.statusCode).toBe(201);

    const body = res.json();
    expect(body.call.chatId).toBe(chatId);
    expect(body.call.kind).toBe('video');
    expect(body.call.startedBy).toBe(caller.userId);
    expect(body.call.endedAt).toBeNull();
    // The caller is in the room straight away; nobody else is yet.
    expect(body.call.participantIds).toEqual([caller.userId]);

    expect(typeof body.token).toBe('string');
    expect(body.token.split('.')).toHaveLength(3);
    expect(body.url).toMatch(/^wss?:\/\//);
    expect(body.iceServers.some((s: { urls: string[] }) => s.urls[0]?.startsWith('stun:'))).toBe(
      true,
    );
  });

  /**
   * Two people pressing "call" in the same chat at the same moment must end up
   * in one room. The database enforces it too, but a 409 in someone's face is
   * not the behaviour — joining is.
   */
  it('joins the call already running instead of starting a second', async () => {
    const caller = await register('one');
    const callee = await register('two');
    const chatId = await directChat(caller.token, callee.userId);

    const first = await start(caller.token, chatId);
    const second = await start(callee.token, chatId);

    expect(second.statusCode).toBe(201);
    expect(second.json().call.id).toBe(first.json().call.id);
    expect(second.json().call.participantIds).toHaveLength(2);
  });

  it('refuses someone who is not in the chat', async () => {
    const caller = await register('member');
    const callee = await register('other');
    const stranger = await register('stranger');
    const chatId = await directChat(caller.token, callee.userId);

    const res = await start(stranger.token, chatId);
    expect(res.statusCode).toBe(403);
  });

  it('refuses an unauthenticated caller', async () => {
    const caller = await register('a');
    const callee = await register('b');
    const chatId = await directChat(caller.token, callee.userId);

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/calls/${chatId}/start`,
      payload: { kind: 'audio' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('joining and leaving', () => {
  it('lets an invited member join and reports both participants', async () => {
    const caller = await register('c1');
    const callee = await register('c2');
    const chatId = await directChat(caller.token, callee.userId);
    const callId = (await start(caller.token, chatId)).json().call.id;

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/calls/${callId}/join`,
      headers: { authorization: `Bearer ${callee.token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().call.participantIds.sort()).toEqual(
      [caller.userId, callee.userId].sort(),
    );
  });

  it('ends the call when the last participant leaves', async () => {
    const caller = await register('d1');
    const callee = await register('d2');
    const chatId = await directChat(caller.token, callee.userId);
    const callId = (await start(caller.token, chatId)).json().call.id;

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/calls/${callId}/leave`,
      headers: { authorization: `Bearer ${caller.token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().call.endedAt).not.toBeNull();
    expect(res.json().call.endReason).toBe('hangup');
  });

  it('keeps the call alive while someone is still in it', async () => {
    const caller = await register('e1');
    const callee = await register('e2');
    const chatId = await directChat(caller.token, callee.userId);
    const callId = (await start(caller.token, chatId)).json().call.id;

    await app.inject({
      method: 'POST',
      url: `/api/v1/calls/${callId}/join`,
      headers: { authorization: `Bearer ${callee.token}` },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/calls/${callId}/leave`,
      headers: { authorization: `Bearer ${caller.token}` },
    });

    expect(res.json().call.endedAt).toBeNull();
    expect(res.json().call.participantIds).toEqual([callee.userId]);
  });

  it('refuses to join a call that has ended', async () => {
    const caller = await register('f1');
    const callee = await register('f2');
    const chatId = await directChat(caller.token, callee.userId);
    const callId = (await start(caller.token, chatId)).json().call.id;

    await app.inject({
      method: 'POST',
      url: `/api/v1/calls/${callId}/end`,
      headers: { authorization: `Bearer ${caller.token}` },
      payload: { reason: 'hangup' },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/calls/${callId}/join`,
      headers: { authorization: `Bearer ${callee.token}` },
    });
    expect(res.statusCode).toBe(409);
  });

  /** Two people hanging up together must not rewrite the first reason. */
  it('keeps the first reason when ended twice', async () => {
    const caller = await register('g1');
    const callee = await register('g2');
    const chatId = await directChat(caller.token, callee.userId);
    const callId = (await start(caller.token, chatId)).json().call.id;

    await app.inject({
      method: 'POST',
      url: `/api/v1/calls/${callId}/end`,
      headers: { authorization: `Bearer ${callee.token}` },
      payload: { reason: 'declined' },
    });

    const second = await app.inject({
      method: 'POST',
      url: `/api/v1/calls/${callId}/end`,
      headers: { authorization: `Bearer ${caller.token}` },
      payload: { reason: 'hangup' },
    });

    expect(second.json().call.endReason).toBe('declined');
  });
});

describe('the history screen', () => {
  const history = (token: string, cursor?: string) =>
    app.inject({
      method: 'GET',
      url: `/api/v1/calls/history${cursor ? `?cursor=${cursor}` : ''}`,
      headers: { authorization: `Bearer ${token}` },
    });

  it('shows a finished call to both sides, each from their own direction', async () => {
    const caller = await register('h1');
    const callee = await register('h2');
    const chatId = await directChat(caller.token, callee.userId);
    const callId = (await start(caller.token, chatId)).json().call.id;

    await app.inject({
      method: 'POST',
      url: `/api/v1/calls/${callId}/join`,
      headers: { authorization: `Bearer ${callee.token}` },
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/calls/${callId}/end`,
      headers: { authorization: `Bearer ${caller.token}` },
      payload: { reason: 'hangup' },
    });

    const mine = await history(caller.token);
    expect(mine.statusCode).toBe(200);
    expect(mine.json().items).toHaveLength(1);
    expect(mine.json().items[0].direction).toBe('out');
    expect(mine.json().items[0].missed).toBe(false);

    const theirs = await history(callee.token);
    expect(theirs.json().items[0].direction).toBe('in');
    expect(theirs.json().items[0].id).toBe(callId);
  });

  /** A ring nobody picked up is the row the screen paints red. */
  it('marks a call nobody answered as missed', async () => {
    const caller = await register('h3');
    const callee = await register('h4');
    const chatId = await directChat(caller.token, callee.userId);
    const callId = (await start(caller.token, chatId)).json().call.id;

    await app.inject({
      method: 'POST',
      url: `/api/v1/calls/${callId}/end`,
      headers: { authorization: `Bearer ${caller.token}` },
      payload: { reason: 'missed' },
    });

    const res = await history(callee.token);
    expect(res.json().items[0].missed).toBe(true);
    expect(res.json().items[0].durationSeconds).toBeNull();
  });

  it('leaves a call still running out of the history', async () => {
    const caller = await register('h5');
    const callee = await register('h6');
    const chatId = await directChat(caller.token, callee.userId);
    await start(caller.token, chatId);

    expect((await history(caller.token)).json().items).toEqual([]);
  });

  it('does not show a call from a chat the user is not in', async () => {
    const caller = await register('h7');
    const callee = await register('h8');
    const stranger = await register('h9');
    const chatId = await directChat(caller.token, callee.userId);
    const callId = (await start(caller.token, chatId)).json().call.id;

    await app.inject({
      method: 'POST',
      url: `/api/v1/calls/${callId}/end`,
      headers: { authorization: `Bearer ${caller.token}` },
      payload: { reason: 'hangup' },
    });

    expect((await history(stranger.token)).json().items).toEqual([]);
  });

  /** Hard rule 7: pages are keyed on a cursor, never on an offset. */
  it('pages with a cursor and stops when the history runs out', async () => {
    const caller = await register('h10');
    const callee = await register('h11');
    const chatId = await directChat(caller.token, callee.userId);

    for (let index = 0; index < 3; index += 1) {
      const callId = (await start(caller.token, chatId)).json().call.id;
      await app.inject({
        method: 'POST',
        url: `/api/v1/calls/${callId}/end`,
        headers: { authorization: `Bearer ${caller.token}` },
        payload: { reason: 'hangup' },
      });
    }

    const first = await app.inject({
      method: 'GET',
      url: '/api/v1/calls/history?limit=2',
      headers: { authorization: `Bearer ${caller.token}` },
    });

    expect(first.json().items).toHaveLength(2);
    expect(first.json().nextCursor).not.toBeNull();

    const second = await history(caller.token, first.json().nextCursor);
    expect(second.json().items).toHaveLength(1);
    expect(second.json().nextCursor).toBeNull();

    // Newest first, and no row appearing on both pages.
    const ids = [...first.json().items, ...second.json().items].map((row: { id: string }) => row.id);
    expect(new Set(ids).size).toBe(3);
  });

  it('refuses an unauthenticated caller', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/v1/calls/history' })).statusCode).toBe(401);
  });
});

describe('catching up after a reconnect', () => {
  /** Hard rule 8: this state must be reachable without the socket. */
  it('reports the call a reconnecting client is still in', async () => {
    const caller = await register('h1');
    const callee = await register('h2');
    const chatId = await directChat(caller.token, callee.userId);
    const callId = (await start(caller.token, chatId)).json().call.id;

    const res = await active(callee.token);
    expect(res.statusCode).toBe(200);
    expect(res.json().items).toHaveLength(1);
    expect(res.json().items[0].id).toBe(callId);
  });

  it('reports nothing once the call is over', async () => {
    const caller = await register('i1');
    const callee = await register('i2');
    const chatId = await directChat(caller.token, callee.userId);
    const callId = (await start(caller.token, chatId)).json().call.id;

    await app.inject({
      method: 'POST',
      url: `/api/v1/calls/${callId}/end`,
      headers: { authorization: `Bearer ${caller.token}` },
      payload: { reason: 'hangup' },
    });

    expect((await active(callee.token)).json().items).toHaveLength(0);
  });

  it('does not report a call from a chat the user is not in', async () => {
    const caller = await register('j1');
    const callee = await register('j2');
    const stranger = await register('j3');
    const chatId = await directChat(caller.token, callee.userId);
    await start(caller.token, chatId);

    expect((await active(stranger.token)).json().items).toHaveLength(0);
  });
});

describe('sweeping calls nobody answered', () => {
  /**
   * The bug this was written for: the caller joins their own call the moment
   * they start it, so a ring nobody answers always has one participant. An
   * earlier version waited for the room to reach zero and therefore waited
   * forever — an ignored call rang until the caller gave up by hand.
   *
   * Note there is no fiddling with joined_at here. The first version of this
   * test cleared it, which quietly described a situation that never happens and
   * let the bug through.
   */
  it('ends a ring nobody answered, even though the caller is in it', async () => {
    const caller = await register('k1');
    const callee = await register('k2');
    const chatId = await directChat(caller.token, callee.userId);
    const callId = (await start(caller.token, chatId)).json().call.id;

    await sql`
      update calls
         set started_at = now() - make_interval(secs => ${calls.RING_TIMEOUT_SECONDS + 30})
       where id = ${callId}`;

    expect(await calls.sweepStale()).toBe(1);

    const [row] = await sql<{ endReason: string }[]>`
      select end_reason from calls where id = ${callId}`;
    expect(row?.endReason).toBe('missed');

    // And the chat can be called again — one live call per chat is an index.
    expect((await start(caller.token, chatId)).statusCode).toBe(201);
  });

  it('leaves a call two people are in alone', async () => {
    const caller = await register('l1');
    const callee = await register('l2');
    const chatId = await directChat(caller.token, callee.userId);
    const callId = (await start(caller.token, chatId)).json().call.id;

    await app.inject({
      method: 'POST',
      url: `/api/v1/calls/${callId}/join`,
      headers: { authorization: `Bearer ${callee.token}` },
    });

    await sql`
      update calls
         set started_at = now() - make_interval(secs => ${calls.RING_TIMEOUT_SECONDS + 30})
       where id = ${callId}`;

    expect(await calls.sweepStale()).toBe(0);
  });

  /** Someone answered and then left: that is a call that happened, not a miss. */
  it('calls it a hangup when the other side had joined', async () => {
    const caller = await register('m1');
    const callee = await register('m2');
    const chatId = await directChat(caller.token, callee.userId);
    const callId = (await start(caller.token, chatId)).json().call.id;

    await app.inject({
      method: 'POST',
      url: `/api/v1/calls/${callId}/join`,
      headers: { authorization: `Bearer ${callee.token}` },
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/calls/${callId}/leave`,
      headers: { authorization: `Bearer ${callee.token}` },
    });

    // The grace period runs from the departure, not from the start.
    await sql`
      update call_participants
         set left_at = now() - make_interval(secs => ${calls.RING_TIMEOUT_SECONDS + 30})
       where call_id = ${callId} and left_at is not null`;

    expect(await calls.sweepStale()).toBe(1);

    const [row] = await sql<{ endReason: string }[]>`
      select end_reason from calls where id = ${callId}`;
    expect(row?.endReason).toBe('hangup');
  });

  /** A long call must not be swept for being long. */
  it('does not touch a fresh room that lost someone a moment ago', async () => {
    const caller = await register('n1');
    const callee = await register('n2');
    const chatId = await directChat(caller.token, callee.userId);
    const callId = (await start(caller.token, chatId)).json().call.id;

    await app.inject({
      method: 'POST',
      url: `/api/v1/calls/${callId}/join`,
      headers: { authorization: `Bearer ${callee.token}` },
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/calls/${callId}/leave`,
      headers: { authorization: `Bearer ${callee.token}` },
    });

    await sql`
      update calls
         set started_at = now() - make_interval(secs => ${calls.RING_TIMEOUT_SECONDS * 60})
       where id = ${callId}`;

    expect(await calls.sweepStale()).toBe(0);
  });
});
