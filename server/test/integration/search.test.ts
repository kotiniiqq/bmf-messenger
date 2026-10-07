import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../../src/app.js';
import { parseQuery } from '../../src/modules/search/service.js';
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

interface Actor {
  userId: string;
  username: string;
  headers: { authorization: string };
}

async function makeUser(suffix: string): Promise<Actor> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { ...uniqueUser(suffix), device: DEVICE, consents: CONSENTS },
  });
  const body = res.json();
  return {
    userId: body.user.id,
    username: body.user.username,
    headers: { authorization: `Bearer ${body.tokens.accessToken}` },
  };
}

const send = (actor: Actor, chatId: string, body: string) =>
  app.inject({
    method: 'POST',
    url: `/api/v1/chats/${chatId}/messages`,
    headers: actor.headers,
    payload: { clientMsgId: randomUUID(), body },
  });

async function directChat(a: Actor, b: Actor): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/chats/direct',
    headers: a.headers,
    payload: { userId: b.userId },
  });
  return res.json().id;
}

const searchAs = (actor: Actor, q: string) =>
  app.inject({
    method: 'GET',
    url: `/api/v1/search?q=${encodeURIComponent(q)}`,
    headers: actor.headers,
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

describe('query parsing', () => {
  it('separates inline filters from the words', () => {
    expect(parseQuery('отчёт from:kotin has:file')).toEqual({
      text: 'отчёт',
      from: 'kotin',
      has: 'file',
    });
  });

  it('leaves plain text alone', () => {
    expect(parseQuery('просто текст')).toEqual({ text: 'просто текст' });
  });

  it('does not mistake a bare colon for a filter', () => {
    expect(parseQuery('время 12:30').text).toBe('время 12:30');
  });
});

describe('GET /search', () => {
  it('finds a message by a word from its body', async () => {
    const alice = await makeUser('sea');
    const bob = await makeUser('seb');
    const chatId = await directChat(alice, bob);

    await send(alice, chatId, 'встречаемся завтра у метро');
    await send(alice, chatId, 'совсем про другое');

    const res = await searchAs(bob, 'метро');
    expect(res.statusCode).toBe(200);
    expect(res.json().items).toHaveLength(1);
    expect(res.json().items[0].message.body).toContain('метро');
  });

  it('stems Russian, so a different form still matches', async () => {
    const alice = await makeUser('stema');
    const bob = await makeUser('stemb');
    const chatId = await directChat(alice, bob);

    await send(alice, chatId, 'принёс документы в офис');

    const res = await searchAs(alice, 'документ');
    expect(res.json().items).toHaveLength(1);
  });

  it('never returns messages from chats the caller is not in', async () => {
    const alice = await makeUser('pra');
    const bob = await makeUser('prb');
    const outsider = await makeUser('prc');
    const chatId = await directChat(alice, bob);

    await send(alice, chatId, 'секретное слово буквица');

    expect((await searchAs(outsider, 'буквица')).json().items).toHaveLength(0);
    expect((await searchAs(bob, 'буквица')).json().items).toHaveLength(1);
  });

  it('honours a from: filter', async () => {
    const alice = await makeUser('fra');
    const bob = await makeUser('frb');
    const chatId = await directChat(alice, bob);

    await send(alice, chatId, 'одинаковое слово вездеход');
    await send(bob, chatId, 'одинаковое слово вездеход');

    const all = await searchAs(alice, 'вездеход');
    expect(all.json().items).toHaveLength(2);

    const mine = await searchAs(alice, `вездеход from:${alice.username}`);
    expect(mine.json().items).toHaveLength(1);
    expect(mine.json().items[0].message.senderId).toBe(alice.userId);
  });

  it('returns nothing for an unknown from: user', async () => {
    const alice = await makeUser('uka');
    const bob = await makeUser('ukb');
    const chatId = await directChat(alice, bob);
    await send(alice, chatId, 'что-нибудь findable');

    const res = await searchAs(alice, 'findable from:nobody_at_all');
    expect(res.json().items).toHaveLength(0);
  });

  it('excludes deleted messages', async () => {
    const alice = await makeUser('dea');
    const bob = await makeUser('deb');
    const chatId = await directChat(alice, bob);

    const msg = (await send(alice, chatId, 'скоро исчезнет уникальность')).json();
    expect((await searchAs(alice, 'уникальность')).json().items).toHaveLength(1);

    await app.inject({
      method: 'DELETE',
      url: `/api/v1/messages/${msg.id}`,
      headers: alice.headers,
    });

    expect((await searchAs(alice, 'уникальность')).json().items).toHaveLength(0);
  });

  it('rejects a query made only of filters', async () => {
    const alice = await makeUser('ofa');
    const res = await searchAs(alice, 'from:someone');
    expect(res.statusCode).toBe(400);
  });

  it('survives punctuation that would break a raw tsquery', async () => {
    const alice = await makeUser('pua');
    const bob = await makeUser('pub');
    const chatId = await directChat(alice, bob);
    await send(alice, chatId, 'обычное сообщение');

    for (const q of ['&&&', '!!! ???', 'a & | b', '"unclosed']) {
      const res = await searchAs(alice, q);
      expect(res.statusCode).toBe(200);
    }
  });
});
