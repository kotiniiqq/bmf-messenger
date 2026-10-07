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

const send = (actor: Actor, chatId: string, body: string, clientMsgId = randomUUID()) =>
  app.inject({
    method: 'POST',
    url: `/api/v1/chats/${chatId}/messages`,
    headers: actor.headers,
    payload: { clientMsgId, body },
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

describe('chats', () => {
  it('creates a group with the creator as owner', async () => {
    const alice = await makeUser('ga');
    const bob = await makeUser('gb');

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/chats',
      headers: alice.headers,
      payload: { type: 'group', title: 'Team', memberIds: [bob.userId] },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().title).toBe('Team');

    const forBob = await app.inject({ method: 'GET', url: '/api/v1/chats', headers: bob.headers });
    expect(forBob.json().items).toHaveLength(1);
  });

  it('returns the same direct chat when opened twice', async () => {
    const alice = await makeUser('da');
    const bob = await makeUser('db');

    const first = await directChat(alice, bob);
    const second = await directChat(alice, bob);
    const fromOtherSide = await directChat(bob, alice);

    expect(second).toBe(first);
    expect(fromOtherSide).toBe(first);
  });

  it('hides a chat the caller does not belong to behind a 404', async () => {
    const alice = await makeUser('ha');
    const bob = await makeUser('hb');
    const outsider = await makeUser('hc');
    const chatId = await directChat(alice, bob);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/chats/${chatId}/messages`,
      headers: outsider.headers,
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('editing a group', () => {
  async function makeGroup(owner: Actor, members: Actor[] = []) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/chats',
      headers: owner.headers,
      payload: {
        type: 'group',
        title: 'Team',
        description: 'about us',
        memberIds: members.map((m) => m.userId),
      },
    });
    return res.json().id as string;
  }

  it('keeps the description it was created with', async () => {
    const alice = await makeUser('eda');
    const chatId = await makeGroup(alice);

    const list = await app.inject({ method: 'GET', url: '/api/v1/chats', headers: alice.headers });
    expect(list.json().items.find((c: { id: string }) => c.id === chatId).description).toBe(
      'about us',
    );
  });

  it('renames and rewrites it', async () => {
    const alice = await makeUser('edb');
    const chatId = await makeGroup(alice);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/chats/${chatId}`,
      headers: alice.headers,
      payload: { title: 'Renamed', description: 'now about this' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().title).toBe('Renamed');
    expect(res.json().description).toBe('now about this');
  });

  /** Hiding the button is decoration; this is where it is actually decided. */
  it('refuses a plain member', async () => {
    const alice = await makeUser('edc');
    const bob = await makeUser('edd');
    const chatId = await makeGroup(alice, [bob]);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/chats/${chatId}`,
      headers: bob.headers,
      payload: { title: 'Hijacked' },
    });

    expect(res.statusCode).toBe(403);
  });

  it('is a 404 for somebody outside the group', async () => {
    const alice = await makeUser('ede');
    const outsider = await makeUser('edf');
    const chatId = await makeGroup(alice);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/chats/${chatId}`,
      headers: outsider.headers,
      payload: { title: 'Hijacked' },
    });

    expect(res.statusCode).toBe(404);
  });

  /** A direct chat is named after the other person; it has nothing to rename. */
  it('refuses to edit a direct chat', async () => {
    const alice = await makeUser('edg');
    const bob = await makeUser('edh');
    const chatId = await directChat(alice, bob);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/chats/${chatId}`,
      headers: alice.headers,
      payload: { title: 'Nope' },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe('deleting a chat', () => {
  const del = (actor: Actor, chatId: string) =>
    app.inject({ method: 'DELETE', url: `/api/v1/chats/${chatId}`, headers: actor.headers });

  const list = async (actor: Actor) =>
    (await app.inject({ method: 'GET', url: '/api/v1/chats', headers: actor.headers })).json()
      .items;

  it('clears a direct chat for one side and leaves the other alone', async () => {
    const alice = await makeUser('xa');
    const bob = await makeUser('xb');
    const chatId = await directChat(alice, bob);
    await send(bob, chatId, 'the old conversation');

    expect((await del(alice, chatId)).statusCode).toBe(204);

    expect(await list(alice)).toHaveLength(0);

    const forBob = await list(bob);
    expect(forBob).toHaveLength(1);
    expect(forBob[0].lastMessage.body).toBe('the old conversation');
  });

  /**
   * The point of clearing rather than removing the membership: the other side
   * is still writing to this chat, and their next message has to arrive.
   */
  it('comes back empty when the other side writes again', async () => {
    const alice = await makeUser('xc');
    const bob = await makeUser('xd');
    const chatId = await directChat(alice, bob);
    await send(bob, chatId, 'before');

    await del(alice, chatId);
    await send(bob, chatId, 'after');

    const forAlice = await list(alice);
    expect(forAlice).toHaveLength(1);
    expect(forAlice[0].lastMessage.body).toBe('after');

    const history = await app.inject({
      method: 'GET',
      url: `/api/v1/chats/${chatId}/messages`,
      headers: alice.headers,
    });
    expect(history.json().items.map((m: { body: string }) => m.body)).toEqual(['after']);
  });

  it('keeps the cleared half out of search', async () => {
    const alice = await makeUser('xe');
    const bob = await makeUser('xf');
    const chatId = await directChat(alice, bob);
    await send(bob, chatId, 'findme before');

    await del(alice, chatId);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/search?q=findme',
      headers: alice.headers,
    });
    expect(res.json().items).toHaveLength(0);
  });

  it('is leaving, for a group', async () => {
    const alice = await makeUser('xg');
    const bob = await makeUser('xh');
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/chats',
      headers: alice.headers,
      payload: { type: 'group', title: 'Team', memberIds: [bob.userId] },
    });
    const chatId = created.json().id;

    expect((await del(bob, chatId)).statusCode).toBe(204);

    expect(await list(bob)).toHaveLength(0);
    const members = await app.inject({
      method: 'GET',
      url: `/api/v1/chats/${chatId}/members`,
      headers: alice.headers,
    });
    expect(members.json().items).toHaveLength(1);

    // Gone means gone: the chat is now somebody else's, not theirs to read.
    const after = await app.inject({
      method: 'GET',
      url: `/api/v1/chats/${chatId}/messages`,
      headers: bob.headers,
    });
    expect(after.statusCode).toBe(404);
  });

  /** A group with no owner has nobody who can moderate it and no way back. */
  it('hands the group to somebody else when the owner leaves', async () => {
    const alice = await makeUser('xi');
    const bob = await makeUser('xj');
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/chats',
      headers: alice.headers,
      payload: { type: 'group', title: 'Team', memberIds: [bob.userId] },
    });
    const chatId = created.json().id;

    await del(alice, chatId);

    const members = await app.inject({
      method: 'GET',
      url: `/api/v1/chats/${chatId}/members`,
      headers: bob.headers,
    });
    const items = members.json().items;
    expect(items).toHaveLength(1);
    expect(items[0].userId).toBe(bob.userId);
    expect(items[0].role).toBe('owner');
  });

  it('drops the group entirely once the last member leaves', async () => {
    const alice = await makeUser('xk');
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/chats',
      headers: alice.headers,
      payload: { type: 'group', title: 'Alone', memberIds: [] },
    });
    const chatId = created.json().id;

    await del(alice, chatId);

    expect(await list(alice)).toHaveLength(0);
    const gone = await app.inject({
      method: 'GET',
      url: `/api/v1/chats/${chatId}/messages`,
      headers: alice.headers,
    });
    expect(gone.statusCode).toBe(404);
  });

  it('is a 404 for a chat the caller is not in', async () => {
    const alice = await makeUser('xl');
    const bob = await makeUser('xm');
    const outsider = await makeUser('xn');
    const chatId = await directChat(alice, bob);

    expect((await del(outsider, chatId)).statusCode).toBe(404);
    expect(await list(alice)).toHaveLength(1);
  });
});

describe('the member list', () => {
  it('names everyone in the chat and what they are', async () => {
    const alice = await makeUser('ma');
    const bob = await makeUser('mb');

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/chats',
      headers: alice.headers,
      payload: { type: 'group', title: 'Team', memberIds: [bob.userId] },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/chats/${created.json().id}/members`,
      headers: bob.headers,
    });

    expect(res.statusCode).toBe(200);
    const items = res.json().items;
    expect(items).toHaveLength(2);
    // Owner first, so the panel does not reshuffle between opens.
    expect(items[0].role).toBe('owner');
    expect(items[0].userId).toBe(alice.userId);
    expect(items[0].user.displayName).toBeTruthy();
  });

  /**
   * A roster says who knows whom. Handing it to a stranger who guessed a chat
   * id would make the group directory readable from outside it.
   */
  it('is a 404 for somebody who is not in the chat', async () => {
    const alice = await makeUser('mc');
    const bob = await makeUser('md');
    const outsider = await makeUser('me');
    const chatId = await directChat(alice, bob);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/chats/${chatId}/members`,
      headers: outsider.headers,
    });

    expect(res.statusCode).toBe(404);
  });

  /** The row travels to every member: the private half of `users` must not ride along. */
  it('carries no password hash and no email address', async () => {
    const alice = await makeUser('mf');
    const bob = await makeUser('mg');
    const chatId = await directChat(alice, bob);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/chats/${chatId}/members`,
      headers: alice.headers,
    });

    const raw = res.body;
    expect(raw).not.toContain('passwordHash');
    expect(raw).not.toContain('@');
  });
});

describe('sending messages', () => {
  it('delivers a message both parties can read', async () => {
    const alice = await makeUser('sa');
    const bob = await makeUser('sb');
    const chatId = await directChat(alice, bob);

    expect((await send(alice, chatId, 'hello there')).statusCode).toBe(201);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/chats/${chatId}/messages`,
      headers: bob.headers,
    });
    expect(res.json().items[0].body).toBe('hello there');
  });

  it('is idempotent: a retry returns the same message, not a duplicate', async () => {
    const alice = await makeUser('ia');
    const bob = await makeUser('ib');
    const chatId = await directChat(alice, bob);
    const clientMsgId = randomUUID();

    const first = await send(alice, chatId, 'only once', clientMsgId);
    const retry = await send(alice, chatId, 'only once', clientMsgId);

    expect(first.statusCode).toBe(201);
    expect(retry.statusCode).toBe(200);
    expect(retry.json().id).toBe(first.json().id);

    const list = await app.inject({
      method: 'GET',
      url: `/api/v1/chats/${chatId}/messages`,
      headers: alice.headers,
    });
    expect(list.json().items).toHaveLength(1);
  });

  it('rejects a reply to a message from another chat', async () => {
    const alice = await makeUser('ra');
    const bob = await makeUser('rb');
    const carol = await makeUser('rc');
    const chatOne = await directChat(alice, bob);
    const chatTwo = await directChat(alice, carol);

    const foreign = (await send(alice, chatTwo, 'elsewhere')).json();

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/chats/${chatOne}/messages`,
      headers: alice.headers,
      payload: { clientMsgId: randomUUID(), body: 'reply', replyTo: foreign.id },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('history paging', () => {
  it('walks pages by cursor without repeating or losing a message', async () => {
    const alice = await makeUser('pa');
    const bob = await makeUser('pb');
    const chatId = await directChat(alice, bob);

    for (let i = 0; i < 12; i += 1) {
      await send(alice, chatId, `message ${i}`);
    }

    const seen: string[] = [];
    let cursor: string | null = null;

    for (let page = 0; page < 5; page += 1) {
      const url = `/api/v1/chats/${chatId}/messages?limit=5${cursor ? `&before=${cursor}` : ''}`;
      const res = await app.inject({ method: 'GET', url, headers: alice.headers });
      const body = res.json();
      seen.push(...body.items.map((m: { id: string }) => m.id));
      cursor = body.nextCursor;
      if (!cursor) break;
    }

    expect(seen).toHaveLength(12);
    expect(new Set(seen).size).toBe(12);
  });

  it('rejects a malformed cursor', async () => {
    const alice = await makeUser('ca');
    const bob = await makeUser('cb');
    const chatId = await directChat(alice, bob);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/chats/${chatId}/messages?before=%%%not-a-cursor%%%`,
      headers: alice.headers,
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('editing, deleting and reactions', () => {
  it('lets the author edit but nobody else', async () => {
    const alice = await makeUser('ea');
    const bob = await makeUser('eb');
    const chatId = await directChat(alice, bob);
    const msg = (await send(alice, chatId, 'typo')).json();

    const byOther = await app.inject({
      method: 'PATCH',
      url: `/api/v1/messages/${msg.id}`,
      headers: bob.headers,
      payload: { body: 'hijacked' },
    });
    expect(byOther.statusCode).toBe(403);

    const byAuthor = await app.inject({
      method: 'PATCH',
      url: `/api/v1/messages/${msg.id}`,
      headers: alice.headers,
      payload: { body: 'fixed' },
    });
    expect(byAuthor.statusCode).toBe(200);
    expect(byAuthor.json().body).toBe('fixed');
    expect(byAuthor.json().editedAt).not.toBeNull();
  });

  it('clears the body on delete but keeps replies resolvable', async () => {
    const alice = await makeUser('xa');
    const bob = await makeUser('xb');
    const chatId = await directChat(alice, bob);
    const target = (await send(alice, chatId, 'delete me')).json();

    await app.inject({
      method: 'POST',
      url: `/api/v1/chats/${chatId}/messages`,
      headers: bob.headers,
      payload: { clientMsgId: randomUUID(), body: 'answering', replyTo: target.id },
    });

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/v1/messages/${target.id}`,
      headers: alice.headers,
    });
    expect(del.statusCode).toBe(204);

    const list = await app.inject({
      method: 'GET',
      url: `/api/v1/chats/${chatId}/messages`,
      headers: alice.headers,
    });
    const deleted = list.json().items.find((m: { id: string }) => m.id === target.id);
    expect(deleted.body).toBe('');

    const reply = list.json().items.find((m: { replyTo: string }) => m.replyTo === target.id);
    expect(reply).toBeDefined();
  });

  it('toggles a reaction off when applied twice', async () => {
    const alice = await makeUser('ta');
    const bob = await makeUser('tb');
    const chatId = await directChat(alice, bob);
    const msg = (await send(alice, chatId, 'react to me')).json();

    const on = await app.inject({
      method: 'POST',
      url: `/api/v1/messages/${msg.id}/reactions`,
      headers: bob.headers,
      payload: { emoji: '👍' },
    });
    expect(on.json().reactions['👍'].count).toBe(1);

    const off = await app.inject({
      method: 'POST',
      url: `/api/v1/messages/${msg.id}/reactions`,
      headers: bob.headers,
      payload: { emoji: '👍' },
    });
    expect(off.json().reactions['👍']).toBeUndefined();
  });
});

describe('reads, pins and drafts', () => {
  it('drops the unread count once a message is read', async () => {
    const alice = await makeUser('ua');
    const bob = await makeUser('ub');
    const chatId = await directChat(alice, bob);
    const msg = (await send(alice, chatId, 'unread')).json();

    const before = await app.inject({ method: 'GET', url: '/api/v1/chats', headers: bob.headers });
    expect(before.json().items[0].unreadCount).toBe(1);

    await app.inject({
      method: 'POST',
      url: `/api/v1/chats/${chatId}/read`,
      headers: bob.headers,
      payload: { messageId: msg.id },
    });

    const after = await app.inject({ method: 'GET', url: '/api/v1/chats', headers: bob.headers });
    expect(after.json().items[0].unreadCount).toBe(0);
  });

  it('pins and unpins a message', async () => {
    const alice = await makeUser('na');
    const bob = await makeUser('nb');
    const chatId = await directChat(alice, bob);
    const msg = (await send(alice, chatId, 'pin me')).json();

    await app.inject({
      method: 'POST',
      url: `/api/v1/chats/${chatId}/pin`,
      headers: alice.headers,
      payload: { messageId: msg.id },
    });

    const pinned = await app.inject({ method: 'GET', url: '/api/v1/chats', headers: alice.headers });
    expect(pinned.json().items[0].pinnedMessageIds).toEqual([msg.id]);

    await app.inject({
      method: 'POST',
      url: `/api/v1/chats/${chatId}/pin`,
      headers: alice.headers,
      payload: { messageId: msg.id, pinned: false },
    });

    const cleared = await app.inject({
      method: 'GET',
      url: '/api/v1/chats',
      headers: alice.headers,
    });
    expect(cleared.json().items[0].pinnedMessageIds).toEqual([]);
  });

  /**
   * Defect #28. One pin per chat was a limit of the code, never of the schema —
   * `pinned_messages` has always been keyed on (chat, message).
   */
  it('keeps several pins, newest first', async () => {
    const alice = await makeUser('pa');
    const bob = await makeUser('pb');
    const chatId = await directChat(alice, bob);

    const first = (await send(alice, chatId, 'rules')).json();
    const second = (await send(alice, chatId, 'the link')).json();

    for (const id of [first.id, second.id]) {
      await app.inject({
        method: 'POST',
        url: `/api/v1/chats/${chatId}/pin`,
        headers: alice.headers,
        payload: { messageId: id },
      });
    }

    const listed = await app.inject({ method: 'GET', url: '/api/v1/chats', headers: alice.headers });
    expect(listed.json().items[0].pinnedMessageIds).toEqual([second.id, first.id]);
  });

  it('unpins the one it is told to and leaves the rest alone', async () => {
    const alice = await makeUser('qa');
    const bob = await makeUser('qb');
    const chatId = await directChat(alice, bob);

    const first = (await send(alice, chatId, 'one')).json();
    const second = (await send(alice, chatId, 'two')).json();

    for (const id of [first.id, second.id]) {
      await app.inject({
        method: 'POST',
        url: `/api/v1/chats/${chatId}/pin`,
        headers: alice.headers,
        payload: { messageId: id },
      });
    }

    await app.inject({
      method: 'POST',
      url: `/api/v1/chats/${chatId}/pin`,
      headers: alice.headers,
      payload: { messageId: second.id, pinned: false },
    });

    const listed = await app.inject({ method: 'GET', url: '/api/v1/chats', headers: alice.headers });
    expect(listed.json().items[0].pinnedMessageIds).toEqual([first.id]);
  });

  /** Pinning the same message twice is one pin, moved to the front. */
  it('does not pin the same message twice', async () => {
    const alice = await makeUser('ra');
    const bob = await makeUser('rb');
    const chatId = await directChat(alice, bob);
    const msg = (await send(alice, chatId, 'once')).json();

    for (let i = 0; i < 2; i += 1) {
      await app.inject({
        method: 'POST',
        url: `/api/v1/chats/${chatId}/pin`,
        headers: alice.headers,
        payload: { messageId: msg.id },
      });
    }

    const listed = await app.inject({ method: 'GET', url: '/api/v1/chats', headers: alice.headers });
    expect(listed.json().items[0].pinnedMessageIds).toEqual([msg.id]);
  });

  /** The old meaning of a null id: throw away every pin at once. */
  it('clears every pin when told no message at all', async () => {
    const alice = await makeUser('sa');
    const bob = await makeUser('sb');
    const chatId = await directChat(alice, bob);

    for (const body of ['one', 'two']) {
      const msg = (await send(alice, chatId, body)).json();
      await app.inject({
        method: 'POST',
        url: `/api/v1/chats/${chatId}/pin`,
        headers: alice.headers,
        payload: { messageId: msg.id },
      });
    }

    await app.inject({
      method: 'POST',
      url: `/api/v1/chats/${chatId}/pin`,
      headers: alice.headers,
      payload: { messageId: null },
    });

    const listed = await app.inject({ method: 'GET', url: '/api/v1/chats', headers: alice.headers });
    expect(listed.json().items[0].pinnedMessageIds).toEqual([]);
  });

  it('keeps a draft per member, not per chat', async () => {
    const alice = await makeUser('fa');
    const bob = await makeUser('fb');
    const chatId = await directChat(alice, bob);

    await app.inject({
      method: 'PUT',
      url: `/api/v1/chats/${chatId}/draft`,
      headers: alice.headers,
      payload: { draft: 'half written' },
    });

    const mine = await app.inject({ method: 'GET', url: '/api/v1/chats', headers: alice.headers });
    expect(mine.json().items[0].draft).toBe('half written');

    const theirs = await app.inject({ method: 'GET', url: '/api/v1/chats', headers: bob.headers });
    expect(theirs.json().items[0].draft).toBeNull();
  });
});

describe('GET /sync', () => {
  it('returns everything missed since the cursor and nothing twice', async () => {
    const alice = await makeUser('ya');
    const bob = await makeUser('yb');
    const chatId = await directChat(alice, bob);

    await send(alice, chatId, 'before disconnect');

    const first = await app.inject({ method: 'GET', url: '/api/v1/sync', headers: bob.headers });
    expect(first.json().messages).toHaveLength(1);
    const cursor = first.json().cursor;

    await send(alice, chatId, 'while offline');

    const second = await app.inject({
      method: 'GET',
      url: `/api/v1/sync?since=${encodeURIComponent(cursor)}`,
      headers: bob.headers,
    });
    expect(second.json().messages).toHaveLength(1);
    expect(second.json().messages[0].body).toBe('while offline');
  });

  it('never leaks messages from chats the caller is not in', async () => {
    const alice = await makeUser('za');
    const bob = await makeUser('zb');
    const outsider = await makeUser('zc');
    const chatId = await directChat(alice, bob);

    await send(alice, chatId, 'private');

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/sync',
      headers: outsider.headers,
    });
    expect(res.json().messages).toHaveLength(0);
  });
});
