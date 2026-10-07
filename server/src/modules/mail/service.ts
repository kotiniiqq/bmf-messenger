import type { MailAccount, MailMessage, MailMessageFull } from '@bmf/shared';
import { ERROR } from '@bmf/shared';
import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { mailSecretConfigured, open, seal } from '../../lib/secrets.js';
import * as hub from '../../ws/hub.js';
import * as imap from './imap.js';
import * as repo from './repo.js';
import type { MailAccountRow, MailMessageRow } from './types.js';

/**
 * Mail against real mailboxes.
 *
 * Only IMAP for now, and deliberately so: this host has 25, 465 and 587 blocked
 * outbound, so no SMTP client can leave it. Reading works, sending will go over
 * a provider's HTTP API, and mail for our own domain needs inbound 25 — which is
 * a hosting question rather than a code one.
 */

/** A mailbox is re-read this often when nothing prompts it sooner. */
export const SYNC_INTERVAL_SECONDS = 5 * 60;

/** A sync that has not finished in this long is assumed dead and retried. */
const SYNC_STALE_SECONDS = 10 * 60;

function toAccount(row: MailAccountRow, unread: number): MailAccount {
  return {
    id: row.id,
    label: row.label || row.address,
    address: row.address,
    kind: row.kind,
    syncedAt: row.syncedAt ? row.syncedAt.toISOString() : null,
    lastError: row.lastError,
    unreadCount: unread,
  };
}

function toMessage(row: MailMessageRow): MailMessage {
  return {
    id: row.id,
    accountId: row.accountId,
    folder: row.folder,
    fromName: row.fromName,
    fromAddr: row.fromAddr,
    toAddrs: row.toAddrs,
    subject: row.subject,
    preview: row.preview,
    sentAt: row.sentAt ? row.sentAt.toISOString() : null,
    receivedAt: row.receivedAt.toISOString(),
    isRead: row.isRead,
    isFlagged: row.isFlagged,
    hasFiles: row.hasFiles,
  };
}

function assertConfigured(): void {
  if (!mailSecretConfigured()) {
    throw new AppError(ERROR.UNAVAILABLE, 'Mail is not configured on this server', 503);
  }
}

function credentialsOf(row: MailAccountRow): imap.ImapCredentials {
  const password = open(row.secret);
  if (!password || !row.imapHost) {
    // The stored secret cannot be read — usually MAIL_SECRET was rotated. Say
    // what to do rather than report a decryption failure.
    throw new AppError(ERROR.UNAVAILABLE, 'Reconnect this mailbox: its saved password is unreadable', 409);
  }

  return { host: row.imapHost, port: row.imapPort, address: row.address, password };
}

/**
 * Connects a mailbox, proving the credentials before storing them.
 *
 * The password is verified against the server first: a typo has to be an error
 * on the form, not a mailbox that quietly never syncs.
 */
export async function connect(input: {
  userId: string;
  address: string;
  password: string;
  label?: string;
  imapHost?: string;
  imapPort?: number;
}): Promise<MailAccount> {
  assertConfigured();

  const host = input.imapHost ?? imap.guessHost(input.address);
  if (!host) {
    throw new AppError(
      ERROR.VALIDATION,
      'Unknown mail provider — enter the IMAP server address',
      400,
    );
  }

  const port = input.imapPort ?? 993;

  try {
    await imap.verify({ host, port, address: input.address, password: input.password });
  } catch (err) {
    throw new AppError(
      ERROR.VALIDATION,
      // Gmail and others refuse account passwords outright; saying so saves the
      // usual half hour of retyping a correct password.
      `Mailbox refused the connection: ${err instanceof Error ? err.message : 'check the address and password'}`,
      400,
    );
  }

  const row = await repo.insertAccount({
    userId: input.userId,
    label: input.label ?? input.address,
    address: input.address,
    imapHost: host,
    imapPort: port,
    secret: seal(input.password),
  });

  // First sync immediately: an account that appears empty for five minutes
  // looks broken.
  void syncAccount(row).catch((err) => logger.warn({ err }, 'first mail sync failed'));

  return toAccount(row, 0);
}

export async function list(userId: string): Promise<MailAccount[]> {
  const [rows, unread] = await Promise.all([repo.listAccounts(userId), repo.unreadCounts(userId)]);
  return rows.map((row) => toAccount(row, unread.get(row.id) ?? 0));
}

export async function disconnect(id: string, userId: string): Promise<void> {
  const removed = await repo.deleteAccount(id, userId);
  if (!removed) throw AppError.notFound('Mailbox not found');
}

export async function messages(input: {
  userId: string;
  accountId: string;
  folder: string;
  limit: number;
  before?: string;
}): Promise<{ items: MailMessage[]; nextCursor: string | null }> {
  const account = await repo.findAccount(input.accountId, input.userId);
  if (!account) throw AppError.notFound('Mailbox not found');

  const rows = await repo.pageMessages({
    accountId: input.accountId,
    folder: input.folder,
    limit: input.limit,
    before: input.before,
  });

  const last = rows.at(-1);
  return {
    items: rows.map(toMessage),
    // Cursor pagination, never OFFSET (hard rule 7).
    nextCursor: rows.length === input.limit && last ? last.receivedAt.toISOString() : null,
  };
}

export async function read(id: string, userId: string): Promise<MailMessageFull> {
  const row = await repo.findMessage(id, userId);
  if (!row) throw AppError.notFound('Message not found');

  if (!row.isRead) await repo.markRead(id, userId, true);

  return { ...toMessage(row), isRead: true, bodyText: row.bodyText, bodyHtml: row.bodyHtml };
}

export async function setRead(id: string, userId: string, isRead: boolean): Promise<void> {
  const row = await repo.findMessage(id, userId);
  if (!row) throw AppError.notFound('Message not found');
  await repo.markRead(id, userId, isRead);
}

/**
 * Reads what is new in one mailbox.
 *
 * Claimed first, so two workers cannot sync the same mailbox at once and fight
 * over the same rows. Failure is stored on the account rather than thrown: a
 * mailbox whose password changed has to say so in the interface, and it must
 * not take the whole sync job down with it.
 */
export async function syncAccount(row: MailAccountRow): Promise<number> {
  if (!(await repo.claimForSync(row.id, SYNC_STALE_SECONDS))) return 0;

  let fetched = 0;
  let failure: string | null = null;

  try {
    const credentials = credentialsOf(row);
    const since = await repo.highestUid(row.id, 'INBOX');
    const found = await imap.fetchSince(credentials, 'INBOX', since);

    for (const message of found) {
      await repo.upsertMessage({
        accountId: row.id,
        uid: message.uid,
        folder: 'INBOX',
        messageId: message.messageId,
        fromName: message.fromName,
        fromAddr: message.fromAddr,
        toAddrs: message.toAddrs,
        subject: message.subject,
        preview: message.preview,
        bodyText: message.bodyText,
        bodyHtml: message.bodyHtml,
        sentAt: message.sentAt,
        isRead: message.isRead,
        isFlagged: message.isFlagged,
        hasFiles: message.hasFiles,
      });
    }

    fetched = found.length;

    // Only announce genuinely new mail, and only once it is stored — a client
    // told about a message it cannot then fetch is worse than a late one.
    for (const message of found.filter((m) => !m.isRead)) {
      await hub.publish(
        [row.userId],
        {
          type: 'mail.new',
          payload: { accountId: row.id, messageId: message.messageId ?? '', subject: message.subject },
        },
      );
    }
  } catch (err) {
    failure = err instanceof Error ? err.message : 'Sync failed';
    logger.warn({ err, accountId: row.id }, 'mail sync failed');
  } finally {
    await repo.finishSync(row.id, failure);
  }

  return fetched;
}

/** Sweeps every mailbox due for a read. Registered in the job registry. */
export async function syncDue(): Promise<number> {
  if (!mailSecretConfigured()) return 0;

  const due = await repo.accountsDueForSync(SYNC_INTERVAL_SECONDS, 10);
  let total = 0;

  for (const row of due) {
    total += await syncAccount(row);
  }

  return total;
}
