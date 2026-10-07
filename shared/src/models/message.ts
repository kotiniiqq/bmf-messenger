import type { Envelope } from './e2e.js';

export type MessageKind =
  | 'text' | 'image' | 'file' | 'voice' | 'sticker' | 'gif'
  | 'track' | 'mail_card' | 'system';

/**
 * A file hanging off a message, as the client is allowed to see it.
 *
 * Deliberately without the bucket key: it names the uploader and the storage
 * layout, and the only thing anyone needs it for is `GET /media/:id`, which
 * checks membership before handing over a single byte.
 */
export interface Attachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  /** Intrinsic pixel size, when the format made it cheap to read. */
  width: number | null;
  height: number | null;
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  /** Client-generated UUID; makes sending idempotent across retries. */
  clientMsgId: string;
  kind: MessageKind;
  /** Empty in a chat under the privacy mode — the text is in `envelope`. */
  body: string;
  /**
   * Ciphertext, when this chat is E2E. The server carries it and cannot read
   * it; a device that is not the one addressed cannot either.
   */
  envelope: Envelope | null;
  meta: Record<string, unknown>;
  replyTo: string | null;
  forwardedFrom: string | null;
  reactions: Record<string, { count: number; mine: boolean }>;
  scheduledAt: string | null;
  editedAt: string | null;
  createdAt: string;
}
