import { t } from '../i18n/index.js';
import type {
  Attachment,
  AuthResponse,
  AuthTokens,
  Call,
  CallCredentials,
  CallEndReason,
  CallHistoryEntry,
  CallKind,
  Chat,
  ChatListItem,
  ChatMemberView,
  ChatPrivacy,
  Contact,
  Device,
  DeviceKeyUpload,
  Envelope,
  Message,
  Note,
  OneTimePreKey,
  Page,
  PreKeyBundleDto,
  Presence,
  SyncResponse,
  User,
} from '@bmf/shared';

/**
 * The server address is configuration, never a hardcoded constant — the beta
 * host is temporary and moving it must not require a rebuild (spec section 9).
 */
export const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:3000';

const STORAGE_KEY = 'bmf.session';

export interface Session {
  accessToken: string;
  refreshToken: string;
  deviceId: string;
  userId: string;
}

/**
 * Where the session lives decides how long being signed in lasts.
 *
 * localStorage survives closing the app, sessionStorage does not — which is the
 * whole difference between "remember me" and a shared machine. Both are read on
 * startup, so a session written either way is found; only writing chooses.
 */
export function loadSession(): Session | null {
  for (const store of [localStorage, sessionStorage]) {
    try {
      const raw = store.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as Session;
    } catch {
      // Unreadable entry: fall through to the other store, then to null.
    }
  }

  return null;
}

export function saveSession(session: Session, remember = true): void {
  // Written to one store and cleared from the other, so switching the choice on
  // a later sign-in cannot leave a forgotten copy behind.
  const [target, other] = remember
    ? [localStorage, sessionStorage]
    : [sessionStorage, localStorage];

  target.setItem(STORAGE_KEY, JSON.stringify(session));
  other.removeItem(STORAGE_KEY);
}

/** Refreshing keeps whichever store the session already lives in. */
export function updateSession(session: Session): void {
  const remembered = localStorage.getItem(STORAGE_KEY) !== null;
  saveSession(session, remembered);
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY);
  sessionStorage.removeItem(STORAGE_KEY);
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

let refreshing: Promise<boolean> | null = null;

/**
 * Refreshes once even if several requests hit a 401 together. Without this the
 * parallel calls would each rotate the token and the losers would be treated
 * as replay attempts by the server.
 */
async function refreshOnce(): Promise<boolean> {
  refreshing ??= (async () => {
    const session = loadSession();
    if (!session) return false;

    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      });

      if (!res.ok) return false;

      const tokens = (await res.json()) as AuthTokens;
      // Keeps the store the session already lives in: a refresh must not quietly
      // promote a session-only sign-in into a remembered one.
      updateSession({ ...session, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
      return true;
    } catch {
      return false;
    } finally {
      // Let the next 401 start a fresh attempt rather than reusing this result.
      setTimeout(() => {
        refreshing = null;
      }, 0);
    }
  })();

  return refreshing;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<T> {
  const session = loadSession();
  const headers = new Headers(init.headers);

  if (session) headers.set('Authorization', `Bearer ${session.accessToken}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const res = await fetch(`${API_BASE}/api/v1${path}`, { ...init, headers });

  if (res.status === 401 && retry && session) {
    if (await refreshOnce()) return request<T>(path, init, false);
    clearSession();
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as
      | { code?: string; message?: string }
      | null;
    throw new ApiError(body?.code ?? 'internal_error', body?.message ?? res.statusText, res.status);
  }

  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

function deviceName(): string {
  const platform = (window.bmf?.platform ?? 'unknown') as string;
  return `BMF Desktop (${platform})`;
}

function devicePlatform(): 'windows' | 'linux' | 'macos' {
  const platform = window.bmf?.platform;
  if (platform === 'win32') return 'windows';
  if (platform === 'darwin') return 'macos';
  return 'linux';
}

const CONSENTS = [
  { document: 'terms', version: '2026-07-01' },
  { document: 'privacy', version: '2026-07-01' },
  { document: 'beta-notice', version: '2026-07-01' },
];

export const api = {
  async register(input: {
    username: string;
    email: string;
    password: string;
    remember?: boolean;
  }) {
    const res = await request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        username: input.username,
        email: input.email,
        password: input.password,
        device: { name: deviceName(), platform: devicePlatform() },
        consents: CONSENTS,
      }),
    });
    saveSession(
      {
        accessToken: res.tokens.accessToken,
        refreshToken: res.tokens.refreshToken,
        deviceId: res.device.id,
        userId: res.user.id,
      },
      input.remember ?? true,
    );
    return res;
  },

  async login(input: { login: string; password: string; remember?: boolean }) {
    const known = loadSession();
    const res = await request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        login: input.login,
        password: input.password,
        device: {
          // Reusing the stored id keeps one row per machine instead of one per sign-in.
          id: known?.deviceId,
          name: deviceName(),
          platform: devicePlatform(),
        },
      }),
    });
    saveSession(
      {
        accessToken: res.tokens.accessToken,
        refreshToken: res.tokens.refreshToken,
        deviceId: res.device.id,
        userId: res.user.id,
      },
      input.remember ?? true,
    );
    return res;
  },

  logout: () => request<void>('/auth/logout', { method: 'POST' }),

  devices: () => request<{ items: Device[] }>('/auth/devices'),

  revokeDevice: (id: string) => request<void>(`/auth/devices/${id}`, { method: 'DELETE' }),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ revokedSessions: number }>('/auth/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  me: () => request<User>('/me'),

  updateMe: (patch: {
    username?: string;
    displayName?: string;
    statusId?: User['statusId'];
    statusText?: string | null;
    statusAuto?: boolean;
    showLastSeen?: boolean;
  }) => request<User>('/me', { method: 'PATCH', body: JSON.stringify(patch) }),

  searchUsers: (q: string) =>
    request<{ items: User[] }>(`/users/search?q=${encodeURIComponent(q)}`),

  presence: (userIds: string[]) =>
    request<{ items: Presence[] }>(`/presence?userIds=${userIds.join(',')}`),

  contacts: () => request<{ items: Contact[] }>('/contacts'),

  /** Adds or renames — one screen, one field, one request. */
  saveContact: (userId: string, localName: string | null) =>
    request<Contact>(`/contacts/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({ localName }),
    }),

  removeContact: (userId: string) => request<void>(`/contacts/${userId}`, { method: 'DELETE' }),

  startCall: (chatId: string, kind: CallKind) =>
    request<CallCredentials>(`/calls/${chatId}/start`, {
      method: 'POST',
      body: JSON.stringify({ kind }),
    }),

  joinCall: (callId: string) =>
    request<CallCredentials>(`/calls/${callId}/join`, { method: 'POST' }),

  leaveCall: (callId: string) =>
    request<{ call: Call }>(`/calls/${callId}/leave`, { method: 'POST' }),

  endCall: (callId: string, reason: CallEndReason = 'hangup') =>
    request<{ call: Call }>(`/calls/${callId}/end`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  /** What a client that just reconnected is still part of (hard rule 8). */
  activeCalls: () => request<{ items: Call[] }>('/calls/active'),

  callHistory: (cursor?: string | null) =>
    request<Page<CallHistoryEntry>>(
      `/calls/history${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
    ),

  /**
   * The privacy mode. Claiming somebody's keys consumes one of their one-time
   * prekeys, which is why it is a POST rather than a GET.
   */
  publishKeys: (upload: DeviceKeyUpload) =>
    request<{ oneTimePreKeys: number }>('/keys', {
      method: 'PUT',
      body: JSON.stringify(upload),
    }),

  topUpKeys: (oneTimePreKeys: OneTimePreKey[]) =>
    request<{ oneTimePreKeys: number }>('/keys/top-up', {
      method: 'POST',
      body: JSON.stringify({ oneTimePreKeys }),
    }),

  keyStatus: () =>
    request<{ published: boolean; oneTimePreKeys: number; low: boolean }>('/keys/status'),

  claimKeys: (userId: string) =>
    request<{ items: PreKeyBundleDto[] }>(`/keys/claim/${userId}`, { method: 'POST' }),

  claimDeviceKeys: (userId: string, deviceId: string) =>
    request<PreKeyBundleDto>(`/keys/claim/${userId}/${deviceId}`, { method: 'POST' }),

  forgetKeys: () => request<void>('/keys', { method: 'DELETE' }),

  privacyOf: (chatId: string) => request<ChatPrivacy>(`/chats/${chatId}/privacy`),

  setPrivacy: (chatId: string, action: 'propose' | 'accept' | 'cancel') =>
    request<ChatPrivacy>(`/chats/${chatId}/privacy`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    }),

  notes: (cursor?: string | null, folder?: string | null) => {
    const query = new URLSearchParams();
    if (cursor) query.set('cursor', cursor);
    if (folder) query.set('folder', folder);
    const suffix = query.toString();
    return request<Page<Note>>(`/notes${suffix ? `?${suffix}` : ''}`);
  },

  noteFolders: () => request<{ items: { folder: string; count: number }[] }>('/notes/folders'),

  createNote: (input: { title?: string; body?: string; folder?: string | null }) =>
    request<Note>('/notes', { method: 'POST', body: JSON.stringify(input) }),

  updateNote: (
    id: string,
    patch: { title?: string; body?: string; folder?: string | null; pinned?: boolean },
  ) => request<Note>(`/notes/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),

  deleteNote: (id: string) => request<void>(`/notes/${id}`, { method: 'DELETE' }),

  chats: () => request<{ items: ChatListItem[] }>('/chats'),

  openDirect: (userId: string) =>
    request<Chat>('/chats/direct', { method: 'POST', body: JSON.stringify({ userId }) }),

  updateChat: (
    chatId: string,
    patch: { title?: string; description?: string; avatarId?: string | null },
  ) => request<Chat>(`/chats/${chatId}`, { method: 'PATCH', body: JSON.stringify(patch) }),

  createChat: (input: {
    type: 'group' | 'channel';
    title: string;
    description?: string;
    avatarId?: string;
    memberIds: string[];
    /** userId -> role; anyone left out joins as a plain member. */
    roles?: Record<string, 'admin' | 'member'>;
  }) => request<Chat>('/chats', { method: 'POST', body: JSON.stringify(input) }),

  members: (chatId: string) =>
    request<{ items: ChatMemberView[] }>(`/chats/${chatId}/members`),

  chatMedia: (chatId: string, before?: string) =>
    request<{ items: Attachment[]; nextCursor: string | null }>(
      `/chats/${chatId}/media${before ? `?before=${encodeURIComponent(before)}` : ''}`,
    ),

  /** Leaves a room, or clears a direct chat. Never touches the other side's copy. */
  deleteChat: (chatId: string) => request<void>(`/chats/${chatId}`, { method: 'DELETE' }),

  messages: (chatId: string, before?: string) =>
    request<Page<Message>>(
      `/chats/${chatId}/messages?limit=50${before ? `&before=${encodeURIComponent(before)}` : ''}`,
    ),

  send: (
    chatId: string,
    input: {
      clientMsgId: string;
      body: string;
      /** Defaults to text on the server; a sticker is drawn at its own size. */
      kind?: Message['kind'];
      replyTo?: string;
      attachmentIds?: string[];
      forwardFrom?: string;
      /** ISO time; the server holds the message until then. */
      scheduledAt?: string;
      /** Ciphertext, in a chat under the privacy mode. Replaces `body`. */
      envelope?: Envelope;
    },
  ) =>
    request<Message>(`/chats/${chatId}/messages`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  edit: (messageId: string, body: string) =>
    request<Message>(`/messages/${messageId}`, { method: 'PATCH', body: JSON.stringify({ body }) }),

  remove: (messageId: string) => request<void>(`/messages/${messageId}`, { method: 'DELETE' }),

  react: (messageId: string, emoji: string) =>
    request<Message>(`/messages/${messageId}/reactions`, {
      method: 'POST',
      body: JSON.stringify({ emoji }),
    }),

  markRead: (chatId: string, messageId: string) =>
    request<void>(`/chats/${chatId}/read`, { method: 'POST', body: JSON.stringify({ messageId }) }),

  /** `messageId: null` clears every pin; otherwise `pinned` says which way. */
  pin: (chatId: string, messageId: string | null, pinned = true) =>
    request<void>(`/chats/${chatId}/pin`, {
      method: 'POST',
      body: JSON.stringify({ messageId, pinned }),
    }),

  saveDraft: (chatId: string, draft: string | null) =>
    request<void>(`/chats/${chatId}/draft`, { method: 'PUT', body: JSON.stringify({ draft }) }),

  setPlacement: (chatId: string, patch: { folder?: string | null; isLater?: boolean }) =>
    request<void>(`/chats/${chatId}/placement`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  search: (q: string) =>
    request<{ items: { message: Message; chatTitle: string; senderUsername: string | null }[] }>(
      `/search?q=${encodeURIComponent(q)}`,
    ),

  sync: (since?: string) =>
    request<SyncResponse>(`/sync${since ? `?since=${encodeURIComponent(since)}` : ''}`),

  async upload(file: File) {
    const session = loadSession();
    const form = new FormData();
    form.append('file', file);

    const res = await fetch(`${API_BASE}/api/v1/media/upload`, {
      method: 'POST',
      headers: session ? { Authorization: `Bearer ${session.accessToken}` } : undefined,
      body: form,
    });

    if (!res.ok) throw new ApiError('upload_failed', t('api.uploadFailed'), res.status);
    return (await res.json()) as Attachment;
  },

  async setAvatar(file: File) {
    const session = loadSession();
    const form = new FormData();
    form.append('file', file);

    const res = await fetch(`${API_BASE}/api/v1/me/avatar`, {
      method: 'PUT',
      headers: session ? { Authorization: `Bearer ${session.accessToken}` } : undefined,
      body: form,
    });

    if (!res.ok) throw new ApiError('upload_failed', t('api.uploadFailed'), res.status);
    return (await res.json()) as User;
  },

  clearAvatar: () => request<User>('/me/avatar', { method: 'DELETE' }),

  /**
   * An attachment's bytes.
   *
   * `<img src>` cannot carry an Authorization header and the endpoint needs
   * one, so the file is fetched here and handed to the DOM as a blob URL. See
   * `media.ts`, which owns the cache and the revoking.
   */
  async mediaBlob(attachmentId: string): Promise<Blob> {
    const session = loadSession();

    const res = await fetch(`${API_BASE}/api/v1/media/${attachmentId}`, {
      headers: session ? { Authorization: `Bearer ${session.accessToken}` } : undefined,
    });

    if (!res.ok) throw new ApiError('media_failed', t('api.mediaFailed'), res.status);
    return res.blob();
  },
};
