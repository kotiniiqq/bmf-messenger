import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../../src/app.js';
import { deliverScheduled } from '../../src/jobs/deliver-scheduled.js';
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
  return { userId: body.user.id as string, token: body.tokens.accessToken as string };
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function directChat(token: string, peerId: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/chats/direct',
    headers: auth(token),
    payload: { userId: peerId },
  });
  return res.json().id as string;
}

const send = (token: string, chatId: string, body: string, scheduledAt?: string) =>
  app.inject({
    method: 'POST',
    url: `/api/v1/chats/${chatId}/messages`,
    headers: auth(token),
    payload: { clientMsgId: randomUUID(), body, scheduledAt },
  });

const list = (token: string, chatId: string) =>
  app
    .inject({ method: 'GET', url: `/api/v1/chats/${chatId}/messages`, headers: auth(token) })
    .then((res) => res.json().items as { id: string; body: string; scheduledAt: string | null }[]);

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

describe('scheduled messages', () => {
  it('hides a message with a future time from the recipient', async () => {
    const author = await register('sch_a');
    const peer = await register('sch_b');
    const chatId = await directChat(author.token, peer.userId);

    const later = new Date(Date.now() + 60 * 60_000).toISOString();
    const res = await send(author.token, chatId, 'завтра в девять', later);
    expect(res.statusCode).toBe(201);

    // The author sees their own pending message, marked with its time.
    const mine = await list(author.token, chatId);
    expect(mine).toHaveLength(1);
    expect(mine[0]?.scheduledAt).not.toBeNull();

    // Nobody else does, until it is actually sent.
    expect(await list(peer.token, chatId)).toHaveLength(0);
  });

  it('delivers it once the moment has passed', async () => {
    const author = await register('sch_c');
    const peer = await register('sch_d');
    const chatId = await directChat(author.token, peer.userId);

    const past = new Date(Date.now() - 1000).toISOString();
    await send(author.token, chatId, 'пора', past);

    expect(await deliverScheduled()).toBe(1);

    const theirs = await list(peer.token, chatId);
    expect(theirs).toHaveLength(1);
    expect(theirs[0]?.body).toBe('пора');
    // Once sent it is an ordinary message, with no pending marker left on it.
    expect(theirs[0]?.scheduledAt).toBeNull();
  });

  it('delivers each message exactly once', async () => {
    const author = await register('sch_e');
    const peer = await register('sch_f');
    const chatId = await directChat(author.token, peer.userId);

    await send(author.token, chatId, 'один раз', new Date(Date.now() - 1000).toISOString());

    expect(await deliverScheduled()).toBe(1);
    // A second pass must find nothing, or every tick would resend it.
    expect(await deliverScheduled()).toBe(0);
    expect(await list(peer.token, chatId)).toHaveLength(1);
  });

  it('leaves a message that is not due yet alone', async () => {
    const author = await register('sch_g');
    const peer = await register('sch_h');
    const chatId = await directChat(author.token, peer.userId);

    await send(author.token, chatId, 'ещё рано', new Date(Date.now() + 60 * 60_000).toISOString());

    expect(await deliverScheduled()).toBe(0);
    expect(await list(peer.token, chatId)).toHaveLength(0);
  });

  it('keeps an ordinary message immediate', async () => {
    const author = await register('sch_i');
    const peer = await register('sch_j');
    const chatId = await directChat(author.token, peer.userId);

    await send(author.token, chatId, 'сразу');

    expect(await list(peer.token, chatId)).toHaveLength(1);
    expect(await deliverScheduled()).toBe(0);
  });
});
