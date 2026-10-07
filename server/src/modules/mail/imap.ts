import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

/**
 * Talking to somebody else's mailbox.
 *
 * IMAP over 993 is the only mail protocol that works from this host: 25, 465
 * and 587 are all blocked outbound, which is why nothing here speaks SMTP and
 * why sending lives in `send.ts` over the provider's HTTP API instead.
 */

/** How much of the body is worth keeping for the list. */
const PREVIEW_LENGTH = 180;

/** One sync never pulls more than this, so a decade-old mailbox cannot stall it. */
export const SYNC_BATCH = 50;

export interface ImapCredentials {
  host: string;
  port: number;
  address: string;
  password: string;
}

export interface FetchedMessage {
  uid: number;
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
}

/**
 * Host settings for the providers people actually connect, so the form can ask
 * for an address and a password and nothing else. Anything unknown has to be
 * given explicitly rather than guessed — a wrong guess produces a timeout, and
 * a timeout tells the user nothing.
 */
const KNOWN_HOSTS: Record<string, string> = {
  'gmail.com': 'imap.gmail.com',
  'googlemail.com': 'imap.gmail.com',
  'yandex.ru': 'imap.yandex.ru',
  'ya.ru': 'imap.yandex.ru',
  'mail.ru': 'imap.mail.ru',
  'inbox.ru': 'imap.mail.ru',
  'bk.ru': 'imap.mail.ru',
  'list.ru': 'imap.mail.ru',
  'outlook.com': 'outlook.office365.com',
  'hotmail.com': 'outlook.office365.com',
  'icloud.com': 'imap.mail.me.com',
};

export function guessHost(address: string): string | null {
  const domain = address.split('@')[1]?.toLowerCase();
  return domain ? (KNOWN_HOSTS[domain] ?? null) : null;
}

async function connect(credentials: ImapCredentials): Promise<ImapFlow> {
  const client = new ImapFlow({
    host: credentials.host,
    port: credentials.port,
    secure: true,
    auth: { user: credentials.address, pass: credentials.password },
    // The library logs every command at info level, including the mailbox name;
    // this is somebody's private correspondence, not our debugging aid.
    logger: false,
  });

  await client.connect();
  return client;
}

/**
 * Proves the credentials work, before anything is stored.
 *
 * Connecting first means a mistyped password is an error on the form rather
 * than a mailbox that sits there failing silently in the background.
 */
export async function verify(credentials: ImapCredentials): Promise<void> {
  const client = await connect(credentials);
  try {
    await client.list();
  } finally {
    await client.logout().catch(() => undefined);
  }
}

/** Everything newer than `sinceUid`, oldest first, capped at SYNC_BATCH. */
export async function fetchSince(
  credentials: ImapCredentials,
  folder: string,
  sinceUid: number,
): Promise<FetchedMessage[]> {
  const client = await connect(credentials);
  const messages: FetchedMessage[] = [];

  try {
    const lock = await client.getMailboxLock(folder);

    try {
      // `${uid}:*` is the IMAP idiom for "from here to the end". A mailbox with
      // nothing new answers with the last message, which the filter below drops.
      const range = `${sinceUid + 1}:*`;

      for await (const message of client.fetch(range, { uid: true, source: true, flags: true }, { uid: true })) {
        if (message.uid <= sinceUid) continue;
        if (!message.source) continue;

        const parsed = await simpleParser(message.source);
        const from = parsed.from?.value?.[0];
        const flags = message.flags ?? new Set<string>();

        const text = parsed.text?.trim() ?? '';
        messages.push({
          uid: message.uid,
          messageId: parsed.messageId ?? null,
          fromName: from?.name ?? '',
          fromAddr: from?.address ?? '',
          toAddrs: toAddressList(parsed.to),
          subject: parsed.subject ?? '',
          preview: text.slice(0, PREVIEW_LENGTH).replace(/\s+/g, ' '),
          bodyText: text || null,
          bodyHtml: typeof parsed.html === 'string' ? parsed.html : null,
          sentAt: parsed.date ?? null,
          isRead: flags.has('\\Seen'),
          isFlagged: flags.has('\\Flagged'),
          hasFiles: (parsed.attachments?.length ?? 0) > 0,
        });

        if (messages.length >= SYNC_BATCH) break;
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
  }

  return messages;
}

/** mailparser hands back one address, a list, or nothing at all. */
function toAddressList(value: unknown): string[] {
  if (!value) return [];
  const entries = Array.isArray(value) ? value : [value];

  return entries
    .flatMap((entry) => (entry as { value?: { address?: string }[] }).value ?? [])
    .map((address) => address.address ?? '')
    .filter(Boolean);
}
