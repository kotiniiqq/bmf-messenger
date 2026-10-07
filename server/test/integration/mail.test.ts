import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../../src/app.js';
import { sql } from '../../src/db/client.js';
import { seal } from '../../src/lib/secrets.js';
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
 * What can be asserted without somebody else's IMAP server: who may see which
 * mailbox, how the list pages, and what reading does. Whether IMAP itself works
 * is a question for a real mailbox, not for CI.
 */
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

/** Inserted directly: connecting for real would need a mailbox to connect to. */
async function giveMailbox(userId: string, address: string) {
  const rows = await sql<{ id: string }[]>`
    insert into mail_accounts (user_id, label, address, imap_host, secret)
    values (${userId}, ${address}, ${address}, 'imap.example.com', ${seal('app-password')})
    returning id`;
  return rows[0]!.id;
}

async function giveMessages(accountId: string, count: number) {
  for (let i = 0; i < count; i += 1) {
    await sql`
      insert into mail_messages
        (account_id, uid, folder, from_name, from_addr, subject, preview, received_at, is_read)
      values
        (${accountId}, ${i + 1}, 'INBOX', 'Sender', 'sender@example.com',
         ${'Subject ' + i}, 'preview', now() - make_interval(mins => ${count - i}), false)`;
  }
}

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

describe('mailboxes', () => {
  it('starts with none', async () => {
    const user = await register('m1');
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/mail/accounts',
      headers: { authorization: `Bearer ${user.token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().items).toEqual([]);
  });

  it('reports the unread count per mailbox', async () => {
    const user = await register('m2');
    const accountId = await giveMailbox(user.userId, 'me@example.com');
    await giveMessages(accountId, 3);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/mail/accounts',
      headers: { authorization: `Bearer ${user.token}` },
    });

    expect(res.json().items).toHaveLength(1);
    expect(res.json().items[0].unreadCount).toBe(3);
    // The stored password must never travel to a client.
    expect(JSON.stringify(res.json())).not.toContain('app-password');
    expect(res.json().items[0].secret).toBeUndefined();
  });

  it('refuses to connect a mailbox it cannot route', async () => {
    const user = await register('m3');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/mail/accounts',
      headers: { authorization: `Bearer ${user.token}` },
      payload: { address: 'someone@unknown-provider.example', password: 'x' },
    });

    // No host given and no guess available: that is a question for the form.
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/IMAP/i);
  });

  it('hides one persons mailbox from another', async () => {
    const owner = await register('m4');
    const stranger = await register('m5');
    const accountId = await giveMailbox(owner.userId, 'owner@example.com');

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/mail/accounts/${accountId}/messages`,
      headers: { authorization: `Bearer ${stranger.token}` },
    });
    expect(res.statusCode).toBe(404);

    const removal = await app.inject({
      method: 'DELETE',
      url: `/api/v1/mail/accounts/${accountId}`,
      headers: { authorization: `Bearer ${stranger.token}` },
    });
    expect(removal.statusCode).toBe(404);
  });
});

describe('the message list', () => {
  it('pages newest first and hands back a cursor', async () => {
    const user = await register('m6');
    const accountId = await giveMailbox(user.userId, 'me@example.com');
    await giveMessages(accountId, 5);

    const first = await app.inject({
      method: 'GET',
      url: `/api/v1/mail/accounts/${accountId}/messages?limit=2`,
      headers: { authorization: `Bearer ${user.token}` },
    });

    expect(first.json().items).toHaveLength(2);
    expect(first.json().items[0].subject).toBe('Subject 4');
    expect(first.json().nextCursor).toBeTruthy();

    const second = await app.inject({
      method: 'GET',
      url: `/api/v1/mail/accounts/${accountId}/messages?limit=2&before=${encodeURIComponent(first.json().nextCursor)}`,
      headers: { authorization: `Bearer ${user.token}` },
    });

    expect(second.json().items[0].subject).toBe('Subject 2');
  });

  it('stops handing back a cursor at the end', async () => {
    const user = await register('m7');
    const accountId = await giveMailbox(user.userId, 'me@example.com');
    await giveMessages(accountId, 2);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/mail/accounts/${accountId}/messages?limit=40`,
      headers: { authorization: `Bearer ${user.token}` },
    });

    expect(res.json().items).toHaveLength(2);
    expect(res.json().nextCursor).toBeNull();
  });

  it('does not carry bodies in the list', async () => {
    const user = await register('m8');
    const accountId = await giveMailbox(user.userId, 'me@example.com');
    await giveMessages(accountId, 1);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/mail/accounts/${accountId}/messages`,
      headers: { authorization: `Bearer ${user.token}` },
    });

    expect(res.json().items[0].bodyText).toBeUndefined();
    expect(res.json().items[0].preview).toBe('preview');
  });
});

describe('reading a message', () => {
  it('returns the body and marks it read', async () => {
    const user = await register('m9');
    const accountId = await giveMailbox(user.userId, 'me@example.com');
    await sql`
      insert into mail_messages
        (account_id, uid, folder, subject, preview, body_text, is_read)
      values (${accountId}, 1, 'INBOX', 'Hello', 'p', 'the body', false)`;

    const [row] = await sql<{ id: string }[]>`select id from mail_messages limit 1`;

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/mail/messages/${row!.id}`,
      headers: { authorization: `Bearer ${user.token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().bodyText).toBe('the body');
    expect(res.json().isRead).toBe(true);

    const [after] = await sql<{ isRead: boolean }[]>`
      select is_read from mail_messages where id = ${row!.id}`;
    expect(after?.isRead).toBe(true);
  });

  it('can be marked unread again', async () => {
    const user = await register('m10');
    const accountId = await giveMailbox(user.userId, 'me@example.com');
    await giveMessages(accountId, 1);
    const [row] = await sql<{ id: string }[]>`select id from mail_messages limit 1`;

    await app.inject({
      method: 'GET',
      url: `/api/v1/mail/messages/${row!.id}`,
      headers: { authorization: `Bearer ${user.token}` },
    });

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/mail/messages/${row!.id}`,
      headers: { authorization: `Bearer ${user.token}` },
      payload: { isRead: false },
    });

    expect(res.statusCode).toBe(204);
    const [after] = await sql<{ isRead: boolean }[]>`
      select is_read from mail_messages where id = ${row!.id}`;
    expect(after?.isRead).toBe(false);
  });

  it('refuses a message that belongs to somebody else', async () => {
    const owner = await register('m11');
    const stranger = await register('m12');
    const accountId = await giveMailbox(owner.userId, 'owner@example.com');
    await giveMessages(accountId, 1);
    const [row] = await sql<{ id: string }[]>`select id from mail_messages limit 1`;

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/mail/messages/${row!.id}`,
      headers: { authorization: `Bearer ${stranger.token}` },
    });
    expect(res.statusCode).toBe(404);
  });
});
