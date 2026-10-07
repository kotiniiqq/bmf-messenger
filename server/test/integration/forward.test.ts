import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../../src/app.js';
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

async function makeUser(suffix: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { ...uniqueUser(suffix), device: DEVICE, consents: CONSENTS },
  });
  const body = res.json();
  return { userId: body.user.id, headers: { authorization: `Bearer ${body.tokens.accessToken}` } };
}

type Actor = Awaited<ReturnType<typeof makeUser>>;

async function directChat(a: Actor, b: Actor): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/chats/direct',
    headers: a.headers,
    payload: { userId: b.userId },
  });
  return res.json().id;
}

const send = (actor: Actor, chatId: string, payload: Record<string, unknown>) =>
  app.inject({
    method: 'POST',
    url: `/api/v1/chats/${chatId}/messages`,
    headers: actor.headers,
    payload: { clientMsgId: randomUUID(), ...payload },
  });

beforeAll(async () => {
  app = await startTestApp();
});
beforeEach(async () => {
  await truncateAll();
  await clearRateLimits();
});
afterAll(async () => {
  await stopTestApp(app);
});

describe('forwarding', () => {
  it('copies the text into the destination chat', async () => {
    const alice = await makeUser('fwa');
    const bob = await makeUser('fwb');
    const carol = await makeUser('fwc');

    const source = await directChat(alice, bob);
    const target = await directChat(alice, carol);

    const original = (await send(alice, source, { body: 'достойно пересылки' })).json();
    const forwarded = await send(alice, target, { body: '', forwardFrom: original.id });

    expect(forwarded.statusCode).toBe(201);
    expect(forwarded.json().body).toBe('достойно пересылки');
    expect(forwarded.json().forwardedFrom).toBe(original.id);
  });

  it('survives the original being deleted', async () => {
    const alice = await makeUser('fda');
    const bob = await makeUser('fdb');
    const carol = await makeUser('fdc');

    const source = await directChat(alice, bob);
    const target = await directChat(alice, carol);

    const original = (await send(alice, source, { body: 'скоро удалю' })).json();
    await send(alice, target, { body: '', forwardFrom: original.id });

    await app.inject({
      method: 'DELETE',
      url: `/api/v1/messages/${original.id}`,
      headers: alice.headers,
    });

    const list = await app.inject({
      method: 'GET',
      url: `/api/v1/chats/${target}/messages`,
      headers: carol.headers,
    });
    expect(list.json().items[0].body).toBe('скоро удалю');
  });

  it('refuses to forward from a chat the sender is not in', async () => {
    const alice = await makeUser('fpa');
    const bob = await makeUser('fpb');
    const carol = await makeUser('fpc');
    const outsider = await makeUser('fpd');

    const theirs = await directChat(alice, bob);
    const original = (await send(alice, theirs, { body: 'не для чужих глаз' })).json();

    const mine = await directChat(outsider, carol);
    const attempt = await send(outsider, mine, { body: '', forwardFrom: original.id });

    expect(attempt.statusCode).toBe(400);
  });

  it('refuses to forward a deleted message', async () => {
    const alice = await makeUser('fga');
    const bob = await makeUser('fgb');
    const chat = await directChat(alice, bob);

    const original = (await send(alice, chat, { body: 'исчезнет' })).json();
    await app.inject({
      method: 'DELETE',
      url: `/api/v1/messages/${original.id}`,
      headers: alice.headers,
    });

    const attempt = await send(alice, chat, { body: '', forwardFrom: original.id });
    expect(attempt.statusCode).toBe(400);
  });
});
