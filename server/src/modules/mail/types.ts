import type { MailAccountKind } from '@bmf/shared';

export interface MailAccountRow {
  id: string;
  userId: string;
  label: string;
  address: string;
  kind: MailAccountKind;
  imapHost: string | null;
  imapPort: number;
  imapSecure: boolean;
  secret: Buffer | null;
  syncingAt: Date | null;
  syncedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
}

export interface MailMessageRow {
  id: string;
  accountId: string;
  uid: string;
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
  receivedAt: Date;
  isRead: boolean;
  isFlagged: boolean;
  hasFiles: boolean;
}
