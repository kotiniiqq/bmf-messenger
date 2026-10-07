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

interface Actor {
  userId: string;
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
    headers: { authorization: `Bearer ${body.tokens.accessToken}` },
  };
}

const save = (actor: Actor, userId: string, localName: string | null) =>
  app.inject({
    method: 'PUT',
    url: `/api/v1/contacts/${userId}`,
    headers: actor.headers,
    payload: { localName },
  });

const list = async (actor: Actor) =>
  (await app.inject({ method: 'GET', url: '/api/v1/contacts', headers: actor.headers })).json()
    .items;

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

/**
 * Defect #25. The name a person writes for a contact is theirs alone — the
 * feature is worth nothing if it leaks, and worth nothing if it does not
 * follow the person around the interface.
 */
describe('contacts', () => {
  it('adds somebody and gives them a name', async () => {
    const alice = await makeUser('ca');
    const bob = await makeUser('cb');

    const res = await save(alice, bob.userId, 'Игорь с работы');

    expect(res.statusCode).toBe(200);
    expect(res.json().localName).toBe('Игорь с работы');
    expect(res.json().user.id).toBe(bob.userId);
  });

  it('keeps the name to the person who wrote it', async () => {
    const alice = await makeUser('cc');
    const bob = await makeUser('cd');

    await save(alice, bob.userId, 'мама');

    // Bob's own contacts say nothing, and neither does his profile.
    expect(await list(bob)).toEqual([]);

    const profile = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: bob.headers,
    });
    expect(JSON.stringify(profile.json())).not.toContain('мама');
  });

  it('renames rather than adding a second row', async () => {
    const alice = await makeUser('ce');
    const bob = await makeUser('cf');

    await save(alice, bob.userId, 'first');
    await save(alice, bob.userId, 'second');

    const items = await list(alice);
    expect(items).toHaveLength(1);
    expect(items[0].localName).toBe('second');
  });

  /** Adding without a name is still adding: the label is optional, the row is not. */
  it('accepts a contact with no name at all', async () => {
    const alice = await makeUser('cg');
    const bob = await makeUser('ch');

    await save(alice, bob.userId, null);

    const items = await list(alice);
    expect(items).toHaveLength(1);
    expect(items[0].localName).toBeNull();
  });

  it('treats a blank name as no name', async () => {
    const alice = await makeUser('ci');
    const bob = await makeUser('cj');

    await save(alice, bob.userId, '   ');

    expect((await list(alice))[0].localName).toBeNull();
  });

  it('refuses to add the caller to their own contacts', async () => {
    const alice = await makeUser('ck');

    expect((await save(alice, alice.userId, 'me')).statusCode).toBe(400);
  });

  it('is a 404 for somebody who does not exist', async () => {
    const alice = await makeUser('cl');

    const res = await save(alice, '00000000-0000-4000-8000-000000000000', 'ghost');
    expect(res.statusCode).toBe(404);
  });

  it('removes a contact and says nothing when it was not there', async () => {
    const alice = await makeUser('cm');
    const bob = await makeUser('cn');

    await save(alice, bob.userId, 'temp');

    const first = await app.inject({
      method: 'DELETE',
      url: `/api/v1/contacts/${bob.userId}`,
      headers: alice.headers,
    });
    expect(first.statusCode).toBe(204);
    expect(await list(alice)).toEqual([]);

    // Deleting twice is the same outcome, so it is the same answer.
    const second = await app.inject({
      method: 'DELETE',
      url: `/api/v1/contacts/${bob.userId}`,
      headers: alice.headers,
    });
    expect(second.statusCode).toBe(204);
  });

  it('refuses a query without authentication', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/contacts' });
    expect(res.statusCode).toBe(401);
  });

  /** The list travels to a client; a password hash must not travel with it. */
  it('never sends anything from the account it should not', async () => {
    const alice = await makeUser('co');
    const bob = await makeUser('cp');
    await save(alice, bob.userId, 'x');

    const raw = JSON.stringify(await list(alice));
    expect(raw).not.toContain('passwordHash');
    expect(raw).not.toContain('email');
  });
});
