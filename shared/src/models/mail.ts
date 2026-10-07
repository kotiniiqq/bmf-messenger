/**
 * Mail, as the client sees it.
 *
 * A mailbox is either one of ours (`bmf`) or somebody else's connected over
 * IMAP. The distinction matters for what can be done with it, not for how it is
 * drawn: both end up in the same list.
 */
export type MailAccountKind = 'imap' | 'bmf';

export interface MailAccount {
  id: string;
  label: string;
  address: string;
  kind: MailAccountKind;
  /** Null until the first sync finishes. */
  syncedAt: string | null;
  /** Why the last sync failed, if it did. Shown to the owner verbatim. */
  lastError: string | null;
  unreadCount: number;
}

export interface MailMessage {
  id: string;
  accountId: string;
  folder: string;
  fromName: string;
  fromAddr: string;
  toAddrs: string[];
  subject: string;
  /** First line or so, enough to draw the list without loading bodies. */
  preview: string;
  sentAt: string | null;
  receivedAt: string;
  isRead: boolean;
  isFlagged: boolean;
  hasFiles: boolean;
}

/** A single message opened for reading; the list never carries bodies. */
export interface MailMessageFull extends MailMessage {
  bodyText: string | null;
  bodyHtml: string | null;
}

export interface ConnectMailboxRequest {
  address: string;
  password: string;
  label?: string;
  /** Optional: derived from the address for the providers we know. */
  imapHost?: string;
  imapPort?: number;
}
