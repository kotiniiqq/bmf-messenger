import { sql } from '../../db/client.js';
import type { MailAccountRow, MailMessageRow } from './types.js';

/** The only file in the mail module allowed to speak SQL (CONTRIBUTING.md layout rules). */

export async function insertAccount(input: {
  userId: string;
  label: string;
  address: string;
  imapHost: string;
  imapPort: number;
  secret: Buffer;
}): Promise<MailAccountRow> {
  const rows = await sql<MailAccountRow[]>`
    insert into mail_accounts (user_id, label, address, imap_host, imap_port, secret)
    values (${input.userId}, ${input.label}, ${input.address},
            ${input.imapHost}, ${input.imapPort}, ${input.secret})
    -- Reconnecting a mailbox replaces its credentials rather than failing: the
    -- usual reason to do it twice is that the password changed.
    on conflict (user_id, address) do update
      set secret = excluded.secret,
          imap_host = excluded.imap_host,
          imap_port = excluded.imap_port,
          label = excluded.label,
          last_error = null
    returning *`;

  const row = rows[0];
  if (!row) throw new Error('Mailbox insert returned no row');
  return row;
}

export async function listAccounts(userId: string): Promise<MailAccountRow[]> {
  return sql<MailAccountRow[]>`
    select * from mail_accounts where user_id = ${userId} order by created_at`;
}

export async function findAccount(id: string, userId: string): Promise<MailAccountRow | null> {
  const rows = await sql<MailAccountRow[]>`
    select * from mail_accounts where id = ${id} and user_id = ${userId} limit 1`;
  return rows[0] ?? null;
}

export async function deleteAccount(id: string, userId: string): Promise<boolean> {
  const rows = await sql`
    delete from mail_accounts where id = ${id} and user_id = ${userId} returning id`;
  return rows.length > 0;
}

export async function unreadCounts(userId: string): Promise<Map<string, number>> {
  const rows = await sql<{ accountId: string; count: string }[]>`
    select a.id as account_id, count(m.id) as count
      from mail_accounts a
      left join mail_messages m on m.account_id = a.id and m.is_read = false
     where a.user_id = ${userId}
     group by a.id`;

  return new Map(rows.map((row) => [row.accountId, Number(row.count)]));
}

/**
 * Claims a mailbox for syncing.
 *
 * Returns false when another worker got there first: two syncs of one mailbox
 * would fetch the same messages and fight over the same rows.
 */
export async function claimForSync(id: string, staleAfterSeconds: number): Promise<boolean> {
  const rows = await sql`
    update mail_accounts
       set syncing_at = now()
     where id = ${id}
       and (syncing_at is null
            or syncing_at < now() - make_interval(secs => ${staleAfterSeconds}))
    returning id`;
  return rows.length > 0;
}

export async function finishSync(id: string, error: string | null): Promise<void> {
  await sql`
    update mail_accounts
       set syncing_at = null, synced_at = now(), last_error = ${error}
     where id = ${id}`;
}

/** The newest UID already stored, so a sync only asks for what came after. */
export async function highestUid(accountId: string, folder: string): Promise<number> {
  const rows = await sql<{ max: string | null }[]>`
    select max(uid)::text as max from mail_messages
     where account_id = ${accountId} and folder = ${folder}`;
  return Number(rows[0]?.max ?? 0);
}

export async function upsertMessage(input: {
  accountId: string;
  uid: number;
  folder: string;
  messageId: string | null;
  fromName: string;
  fromAddr: string;
  toAddrs: string[];
  subject: string;
  preview: string;
  bodyText: string | null;
  bodyHtml: string | null;
  sentAt: Date | null;
  isRead: boolean;
  isFlagged: boolean;
  hasFiles: boolean;
}): Promise<void> {
  // Idempotent by (account, folder, uid): re-running a sync updates flags rather
  // than duplicating the message (hard rule 6).
  await sql`
    insert into mail_messages (
      account_id, uid, folder, message_id, from_name, from_addr, to_addrs,
      subject, preview, body_text, body_html, sent_at, is_read, is_flagged, has_files
    ) values (
      ${input.accountId}, ${input.uid}, ${input.folder}, ${input.messageId},
      ${input.fromName}, ${input.fromAddr}, ${input.toAddrs}, ${input.subject},
      ${input.preview}, ${input.bodyText}, ${input.bodyHtml}, ${input.sentAt},
      ${input.isRead}, ${input.isFlagged}, ${input.hasFiles}
    )
    on conflict (account_id, folder, uid) do update
      set is_read = excluded.is_read,
          is_flagged = excluded.is_flagged`;
}

export async function pageMessages(input: {
  accountId: string;
  folder: string;
  limit: number;
  before?: string;
}): Promise<MailMessageRow[]> {
  // Cursor pagination on received_at, never OFFSET (hard rule 7).
  if (input.before) {
    return sql<MailMessageRow[]>`
      select * from mail_messages
       where account_id = ${input.accountId} and folder = ${input.folder}
         and received_at < ${input.before}
       order by received_at desc
       limit ${input.limit}`;
  }

  return sql<MailMessageRow[]>`
    select * from mail_messages
     where account_id = ${input.accountId} and folder = ${input.folder}
     order by received_at desc
     limit ${input.limit}`;
}

export async function findMessage(id: string, userId: string): Promise<MailMessageRow | null> {
  const rows = await sql<MailMessageRow[]>`
    select m.* from mail_messages m
      join mail_accounts a on a.id = m.account_id
     where m.id = ${id} and a.user_id = ${userId}
     limit 1`;
  return rows[0] ?? null;
}

export async function markRead(id: string, userId: string, read: boolean): Promise<void> {
  await sql`
    update mail_messages m
       set is_read = ${read}
      from mail_accounts a
     where m.id = ${id} and a.id = m.account_id and a.user_id = ${userId}`;
}

/** Mailboxes due for a sync, oldest first. */
export async function accountsDueForSync(olderThanSeconds: number, limit: number) {
  return sql<MailAccountRow[]>`
    select * from mail_accounts
     where kind = 'imap'
       and secret is not null
       and (synced_at is null or synced_at < now() - make_interval(secs => ${olderThanSeconds}))
       and (syncing_at is null or syncing_at < now() - interval '10 minutes')
     order by synced_at asc nulls first
     limit ${limit}`;
}
