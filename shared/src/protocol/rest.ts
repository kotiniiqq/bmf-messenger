import type { ConsentRef } from '../constants/consents.js';
import type { Chat } from '../models/chat.js';
import type { Message } from '../models/message.js';
import type { Device, User } from '../models/user.js';

/** Cursor pagination is mandatory: never use OFFSET for messages or mail. */
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface DeviceInput {
  /** Sent by a returning client so its session row is reused, not duplicated. */
  id?: string;
  name: string;
  platform: Device['platform'];
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  displayName?: string;
  device: DeviceInput;
  consents: ConsentRef[];
}

export interface LoginRequest {
  /** Username or email — the server accepts either. */
  login: string;
  password: string;
  device: DeviceInput;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface AuthResponse {
  user: User;
  device: Device;
  tokens: AuthTokens;
}

export interface DeviceListResponse {
  items: Device[];
}

export interface SendMessageRequest {
  clientMsgId: string;
  kind: string;
  body: string;
  replyTo?: string;
  scheduledAt?: string;
  attachmentKeys?: string[];
}

export interface SearchQuery {
  q: string;
  scope?: 'chats' | 'mail' | 'notes' | 'music' | 'contacts';
  from?: string;
  has?: 'file' | 'voice' | 'track' | 'attachment';
  before?: string;
}

export interface CreateChatRequest {
  type: 'group' | 'channel';
  title: string;
  memberIds: string[];
}

export interface ChatListItem extends Chat {
  lastMessage: Message | null;
}

export interface EditMessageRequest {
  body: string;
}

export interface ReactionRequest {
  emoji: string;
}

export interface PinRequest {
  messageId: string | null;
}

/** Everything a reconnecting client missed, per hard rule 8. */
export interface SyncResponse {
  messages: Message[];
  reads: { chatId: string; userId: string; lastReadMessageId: string | null }[];
  cursor: string;
}
