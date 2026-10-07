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

/**
 * Notes belong to one person and are never shared, so most of what matters here
 * is the negative case: somebody else's note must not be readable, writable or
 * even confirmable as existing.
 */
let app: App;

async function register(suffix: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { ...uniqueUser(suffix), device: DEVICE, consents: CONSENTS },
  });
  return { token: res.json().tokens.accessToken as string };
}

const create = (token: string, payload: Record<string, unknown>) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/notes',
    headers: { authorization: `Bearer ${token}` },
    payload,
  });

const list = (token: string, query = '') =>
  app.inject({
    method: 'GET',
    url: `/api/v1/notes${query}`,
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

describe('writing notes', () => {
  it('creates one and hands it back', async () => {
    const me = await register('n1');
    const res = await create(me.token, { title: 'Идея', body: '# план\n- [ ] пункт' });

    expect(res.statusCode).toBe(201);
    expect(res.json().title).toBe('Идея');
    expect(res.json().pinned).toBe(false);
  });

  it('edits a note and moves the clock forward', async () => {
    const me = await register('n2');
    const id = (await create(me.token, { title: 'До' })).json().id;

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/notes/${id}`,
      headers: { authorization: `Bearer ${me.token}` },
      payload: { title: 'После', pinned: true },
    });

    expect(res.json().title).toBe('После');
    expect(res.json().pinned).toBe(true);
  });

  /** Clearing a folder has to be expressible, not just setting one. */
  it('moves a note out of every folder', async () => {
    const me = await register('n3');
    const id = (await create(me.token, { title: 'x', folder: 'Работа' })).json().id;

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/notes/${id}`,
      headers: { authorization: `Bearer ${me.token}` },
      payload: { folder: null },
    });

    expect(res.json().folder).toBeNull();
  });

  it('deletes a note and stops returning it', async () => {
    const me = await register('n4');
    const id = (await create(me.token, { title: 'Лишняя' })).json().id;

    const gone = await app.inject({
      method: 'DELETE',
      url: `/api/v1/notes/${id}`,
      headers: { authorization: `Bearer ${me.token}` },
    });
    expect(gone.statusCode).toBe(204);
    expect((await list(me.token)).json().items).toEqual([]);
  });
});

describe('the list', () => {
  it('puts pinned notes first', async () => {
    const me = await register('n5');
    await create(me.token, { title: 'обычная' });
    const id = (await create(me.token, { title: 'важная' })).json().id;

    await app.inject({
      method: 'PATCH',
      url: `/api/v1/notes/${id}`,
      headers: { authorization: `Bearer ${me.token}` },
      payload: { pinned: true },
    });

    expect((await list(me.token)).json().items[0].title).toBe('важная');
  });

  it('filters by folder and counts them', async () => {
    const me = await register('n6');
    await create(me.token, { title: 'a', folder: 'Работа' });
    await create(me.token, { title: 'b', folder: 'Работа' });
    await create(me.token, { title: 'c', folder: 'Дом' });

    expect((await list(me.token, '?folder=Работа')).json().items).toHaveLength(2);

    const folders = await app.inject({
      method: 'GET',
      url: '/api/v1/notes/folders',
      headers: { authorization: `Bearer ${me.token}` },
    });
    expect(folders.json().items).toEqual(
      expect.arrayContaining([{ folder: 'Работа', count: 2 }, { folder: 'Дом', count: 1 }]),
    );
  });

  /** Hard rule 7: pages are keyed on a cursor, never on an offset. */
  it('pages with a cursor', async () => {
    const me = await register('n7');
    for (const title of ['1', '2', '3']) await create(me.token, { title });

    const first = await list(me.token, '?limit=2');
    expect(first.json().items).toHaveLength(2);
    expect(first.json().nextCursor).not.toBeNull();

    const second = await list(me.token, `?limit=2&cursor=${first.json().nextCursor}`);
    expect(second.json().items).toHaveLength(1);
    expect(second.json().nextCursor).toBeNull();
  });

  it('finds a note by its text', async () => {
    const me = await register('n8');
    await create(me.token, { title: 'Покупки', body: 'молоко и хлеб' });
    await create(me.token, { title: 'Прочее', body: 'ничего' });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/notes/search?q=молоко',
      headers: { authorization: `Bearer ${me.token}` },
    });
    expect(res.json().items).toHaveLength(1);
    expect(res.json().items[0].title).toBe('Покупки');
  });
});

describe('other people', () => {
  it('never shows one person the notes of another', async () => {
    const me = await register('n9');
    const other = await register('n10');
    await create(me.token, { title: 'моё' });

    expect((await list(other.token)).json().items).toEqual([]);
  });

  /** 404, not 403: a stranger is not told the note exists. */
  it('refuses to read, edit or delete somebody elses note', async () => {
    const me = await register('n11');
    const other = await register('n12');
    const id = (await create(me.token, { title: 'моё' })).json().id;
    const auth = { authorization: `Bearer ${other.token}` };

    expect((await app.inject({ method: 'GET', url: `/api/v1/notes/${id}`, headers: auth })).statusCode).toBe(404);
    expect(
      (await app.inject({ method: 'PATCH', url: `/api/v1/notes/${id}`, headers: auth, payload: { title: 'чужое' } })).statusCode,
    ).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/api/v1/notes/${id}`, headers: auth })).statusCode).toBe(404);
  });

  it('refuses an unauthenticated caller', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/v1/notes' })).statusCode).toBe(401);
  });
});
