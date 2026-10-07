import type { User } from './user.js';

export type ChatType = 'dm' | 'group' | 'channel' | 'saved' | 'ai';
export type MemberRole = 'owner' | 'admin' | 'member';

export interface Chat {
  id: string;
  type: ChatType;
  title: string;
  /** What the room is about. Empty for a direct chat, which is about nothing. */
  description: string;
  /** The other participant, for `dm` chats only — whose presence to watch. */
  peerId: string | null;
  /** Attachment id of the chat picture, read through `GET /media/:id`. */
  avatarUrl: string | null;
  /** Per-chat accent colour chosen by the user. */
  accent: string | null;
  isE2E: boolean;
  unreadCount: number;
  /**
   * Every pinned message, newest pin first, capped at what a header bar can
   * usefully page through. A chat pins more than one thing — the rules, the
   * link, the date — and the bar steps from one to the next.
   */
  pinnedMessageIds: string[];
  folder: string | null;
  isLater: boolean;
  draft: string | null;
  updatedAt: string;
}

export interface ChatMember {
  userId: string;
  role: MemberRole;
  joinedAt: string;
}

/**
 * A member with the person behind the id attached.
 *
 * Messages carry a `senderId` and nothing else, so without this the client can
 * only render a group as a column of anonymous bubbles. Resolving the name per
 * message would be one request per author; the roster is asked for once when
 * the chat opens and answers every bubble in it.
 */
export interface ChatMemberView extends ChatMember {
  user: User;
}
