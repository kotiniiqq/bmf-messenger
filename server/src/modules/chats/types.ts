import type {
  Chat,
  ChatMemberView,
  ChatType,
  E2EState,
  Envelope,
  MemberRole,
  Message,
  MessageKind,
  StatusId,
} from '@bmf/shared';

export interface ChatRow {
  id: string;
  type: ChatType;
  title: string;
  description: string;
  avatarUrl: string | null;
  accent: string | null;
  isE2e: boolean;
  e2eState: E2EState;
  e2eProposedBy: string | null;
  /** The two devices that agreed to the privacy mode; empty until they have. */
  e2eDevices: string[];
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface ChatMemberRow {
  chatId: string;
  userId: string;
  role: MemberRole;
  joinedAt: Date;
  mutedUntil: Date | null;
  folder: string | null;
  isLater: boolean;
  draft: string | null;
  /** Set when this member deleted the chat; they see nothing older. */
  clearedAt: Date | null;
}

/** A `chat_members` row joined to the public half of the person it names. */
export interface MemberWithUserRow {
  userId: string;
  role: MemberRole;
  joinedAt: Date;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  statusId: StatusId;
  statusText: string | null;
  statusAuto: boolean;
  showLastSeen: boolean;
  isPro: boolean;
  createdAt: Date;
}

export function toMemberView(row: MemberWithUserRow): ChatMemberView {
  return {
    userId: row.userId,
    role: row.role,
    joinedAt: row.joinedAt.toISOString(),
    user: {
      id: row.userId,
      username: row.username,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
      statusId: row.statusId,
      statusText: row.statusText,
      statusAuto: row.statusAuto,
      showLastSeen: row.showLastSeen,
      isPro: row.isPro,
      createdAt: row.createdAt.toISOString(),
    },
  };
}

export interface MessageRow {
  id: string;
  chatId: string;
  senderId: string | null;
  clientMsgId: string;
  kind: MessageKind;
  body: string;
  meta: Record<string, unknown>;
  replyTo: string | null;
  forwardedFrom: string | null;
  editedAt: Date | null;
  scheduledAt: Date | null;
  createdAt: Date;
  deletedAt: Date | null;
  /** Set instead of `body` in a chat under the privacy mode. */
  envelope: Envelope | null;
}

/** Reaction tallies are aggregated per message, with the caller's own vote flagged. */
export type ReactionMap = Record<string, { count: number; mine: boolean }>;

export function toMessage(row: MessageRow, reactions: ReactionMap = {}): Message {
  return {
    id: row.id,
    chatId: row.chatId,
    senderId: row.senderId ?? '',
    clientMsgId: row.clientMsgId,
    kind: row.kind,
    // A deleted message keeps its row so replies still resolve, but the body goes.
    body: row.deletedAt ? '' : row.body,
    envelope: row.deletedAt ? null : row.envelope,
    meta: row.deletedAt ? {} : row.meta,
    replyTo: row.replyTo,
    forwardedFrom: row.forwardedFrom,
    reactions,
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    editedAt: row.editedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface ChatWithMembership extends ChatRow {
  role: MemberRole;
  folder: string | null;
  isLater: boolean;
  draft: string | null;
  unreadCount: number;
  pinnedMessageIds: string[] | null;
  /** The other participant; only meaningful for `dm`. */
  peerName?: string | null;
  peerId?: string | null;
}

export function toChat(row: ChatWithMembership): Chat {
  return {
    id: row.id,
    type: row.type,
    // A direct chat carries no title of its own — it is the other person.
    title: row.type === 'dm' ? (row.peerName ?? row.title) : row.title,
    description: row.description ?? '',
    peerId: row.type === 'dm' ? (row.peerId ?? null) : null,
    avatarUrl: row.avatarUrl,
    accent: row.accent,
    isE2E: row.isE2e,
    unreadCount: Number(row.unreadCount),
    pinnedMessageIds: row.pinnedMessageIds ?? [],
    folder: row.folder,
    isLater: row.isLater,
    draft: row.draft,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Cursor pagination, never OFFSET (hard rule 7).
 *
 * The cursor carries only the message id, never a timestamp. Postgres stores
 * `timestamptz` with microsecond precision while `Date.toISOString()` truncates
 * to milliseconds, so a time-bearing cursor lands slightly before the row it
 * points at and hands that row back on the next page. Queries resolve the exact
 * sort key with a primary-key subquery instead.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeCursor(id: string): string {
  return Buffer.from(id).toString('base64url');
}

export function decodeCursor(cursor: string): string | null {
  try {
    const id = Buffer.from(cursor, 'base64url').toString('utf8');
    return UUID_RE.test(id) ? id : null;
  } catch {
    return null;
  }
}
