import { create } from 'zustand';
import type {
  Call,
  Chat,
  ChatListItem,
  ChatMemberView,
  ChatPrivacy,
  Contact,
  Message,
  Presence,
  User,
} from '@bmf/shared';
import { api, clearSession, loadSession } from '../api/client.js';
import { stream } from '../api/ws.js';
import { t } from '../i18n/index.js';
import { forgetMedia } from '../media.js';
import {
  contextOf,
  ensureKeys,
  ensureSession,
  forget,
  open,
  rememberSent,
  seal,
} from '../privacy.js';

interface AppState {
  user: User | null;
  chats: ChatListItem[];
  activeChatId: string | null;
  messages: Record<string, Message[]>;
  nextCursor: Record<string, string | null>;
  loading: boolean;
  error: string | null;
  connected: boolean;
  /** chatId -> userIds currently typing, with the moment we heard about it. */
  typing: Record<string, Record<string, number>>;
  /** userId -> whether they hold an open socket right now. */
  presence: Record<string, Presence>;
  /**
   * chatId -> its roster. Messages name their author by id only, so without
   * this a group is a column of bubbles with nobody attached to them.
   */
  members: Record<string, ChatMemberView[]>;
  loadMembers: (chatId: string) => Promise<void>;

  /**
   * userId -> the name this account gave them, if any.
   *
   * Kept as a map rather than a list because every screen that draws a person
   * asks the same question — "what do I call this one" — and asks it per row.
   * The list itself is derived where it is shown.
   */
  contacts: Record<string, Contact>;
  loadContacts: () => Promise<void>;
  saveContact: (userId: string, localName: string | null) => Promise<void>;
  removeContact: (userId: string) => Promise<void>;

  /**
   * Where each chat stands on the privacy mode, and what its messages say once
   * opened. Decrypted text is kept here rather than written back into the
   * message: `body` is what the server holds, and in these chats the server
   * holds nothing.
   */
  privacy: Record<string, ChatPrivacy>;
  plaintext: Record<string, string>;
  loadPrivacy: (chatId: string) => Promise<void>;
  setPrivacy: (chatId: string, action: 'propose' | 'accept' | 'cancel') => Promise<void>;
  decryptChat: (chatId: string) => Promise<void>;

  /** The call this client is part of, if any. Survives a reconnect via REST. */
  activeCall: Call | null;
  /** A call ringing that we have not answered or declined yet. */
  incomingCall: Call | null;
  dismissIncoming: () => void;
  refreshCalls: () => Promise<void>;

  bootstrap: () => Promise<void>;
  setUser: (user: User) => void;
  signIn: (login: string, password: string, remember: boolean) => Promise<void>;
  signUp: (username: string, email: string, password: string, remember: boolean) => Promise<void>;
  signOut: () => Promise<void>;

  listen: () => void;
  loadChats: () => Promise<void>;
  openChat: (chatId: string) => Promise<void>;
  loadOlder: (chatId: string) => Promise<void>;
  send: (
    chatId: string,
    body: string,
    options?: {
      /** Anything other than plain text — a sticker bubble is drawn differently. */
      kind?: Message['kind'];
      attachmentIds?: string[];
      replyTo?: string;
      scheduledAt?: string;
    },
  ) => Promise<void>;
  edit: (messageId: string, body: string) => Promise<void>;
  react: (messageId: string, emoji: string) => Promise<void>;
  sendTyping: (chatId: string) => void;
  forward: (messageId: string, toChatId: string) => Promise<void>;
  remove: (messageId: string) => Promise<void>;
  pin: (chatId: string, messageId: string | null, pinned?: boolean) => Promise<void>;
  place: (chatId: string, patch: { folder?: string | null; isLater?: boolean }) => Promise<void>;
  removeChat: (chatId: string) => Promise<void>;
  ensureChat: (chat: Chat) => void;
}

/** Newest last, matching how the message list is rendered. */
function mergeMessage(list: Message[], message: Message): Message[] {
  const index = list.findIndex((m) => m.id === message.id);
  if (index >= 0) {
    const copy = [...list];
    copy[index] = message;
    return copy;
  }
  return [...list, message];
}

function blankBody(list: Message[], messageId: string): Message[] {
  return list.map((m) => (m.id === messageId ? { ...m, body: '', meta: {} } : m));
}

export const useApp = create<AppState>((set, get) => ({
  user: null,
  chats: [],
  activeChatId: null,
  messages: {},
  nextCursor: {},
  loading: true,
  error: null,
  connected: false,
  typing: {},
  presence: {},
  members: {},
  contacts: {},
  privacy: {},
  plaintext: {},
  activeCall: null,
  incomingCall: null,

  dismissIncoming() {
    set({ incomingCall: null });
  },

  async loadPrivacy(chatId) {
    const privacy = await api.privacyOf(chatId).catch(() => null);
    if (!privacy) return;

    set((state) => ({ privacy: { ...state.privacy, [chatId]: privacy } }));

    // Agreed but no session yet: the accepting side has just learned which
    // device to talk to, and the proposing side learns it from this event.
    const user = get().user;
    const chat = get().chats.find((item) => item.id === chatId);
    const context = user ? contextOf(user.id) : null;

    if (privacy.state === 'on' && context && chat?.peerId) {
      await ensureSession(context, privacy, chat.peerId);
      await get().decryptChat(chatId);
    }
  },

  async setPrivacy(chatId, action) {
    const user = get().user;
    const context = user ? contextOf(user.id) : null;
    if (!context) throw new Error('Privacy mode needs the desktop shell');

    // Both sides have to have published a bundle before either can be reached.
    if (action !== 'cancel') await ensureKeys(context);

    const privacy = await api.setPrivacy(chatId, action);
    set((state) => ({ privacy: { ...state.privacy, [chatId]: privacy } }));

    const chat = get().chats.find((item) => item.id === chatId);
    if (privacy.state === 'on' && chat?.peerId) {
      await ensureSession(context, privacy, chat.peerId);
    }
    await get().loadChats();
  },

  /**
   * Opens every envelope in a chat that this device can open.
   *
   * Run after a chat loads and after each new message, because decryption is
   * asynchronous and lives outside the renderer — a message cannot simply be
   * rendered as its own plaintext the way an ordinary one can.
   */
  async decryptChat(chatId) {
    const user = get().user;
    const context = user ? contextOf(user.id) : null;
    if (!context) return;

    const messages = get().messages[chatId] ?? [];
    const pending = messages.filter(
      (message) => message.envelope && get().plaintext[message.id] === undefined,
    );
    if (!pending.length) return;

    const opened: Record<string, string> = {};
    for (const message of pending) {
      // Sequentially on purpose: the ratchet is order-dependent, and opening two
      // messages at once would have them race for the same session state.
      const text = await open(context, message);
      // An envelope this device cannot open is recorded as such, so the list
      // stops asking about it on every render.
      opened[message.id] = text ?? '';
    }

    set((state) => ({ plaintext: { ...state.plaintext, ...opened } }));
  },

  /**
   * Hard rule 8: after a reconnect the socket tells us nothing about a call that
   * started while we were away, so the state is re-read over REST.
   */
  async refreshCalls() {
    const { items } = await api.activeCalls().catch(() => ({ items: [] as Call[] }));
    const mine = loadSession()?.userId;
    const joined = items.find((call) => mine && call.participantIds.includes(mine)) ?? null;

    set({
      activeCall: joined,
      // A call we were invited to and have not joined is still ringing.
      incomingCall: joined ? null : (items[0] ?? null),
    });
  },

  async bootstrap() {
    if (!loadSession()) {
      set({ loading: false });
      return;
    }

    try {
      // The shell shows the user's initial in every navigation slot, so the
      // profile has to be known after a restart, not only after signing in.
      // Contacts are part of the first picture, not a screen of their own: a
      // chat list that shows a person's handle for a second and then their
      // local name reads as the app changing its mind about who they are.
      const [user] = await Promise.all([api.me(), get().loadChats(), get().loadContacts()]);
      set({ user, loading: false });
      get().listen();
    } catch {
      // A session the server no longer honours is worse than none.
      clearSession();
      set({ loading: false, user: null });
    }
  },

  setUser(user) {
    set({ user });
  },

  async signIn(login, password, remember) {
    set({ error: null });
    try {
      const res = await api.login({ login, password, remember });
      set({ user: res.user });
      await get().loadChats();
      get().listen();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : t('auth.signInFailed') });
      throw err;
    }
  },

  async signUp(username, email, password, remember) {
    set({ error: null });
    try {
      const res = await api.register({ username, email, password, remember });
      set({ user: res.user });
      await get().loadChats();
      get().listen();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : t('auth.signUpFailed') });
      throw err;
    }
  },

  async signOut() {
    // Before the session goes, or there is no way left to name the key file.
    // Hard rule 10 in spirit: what was private stays unreadable afterwards.
    const user = get().user;
    const context = user ? contextOf(user.id) : null;
    if (context) await forget(context).catch(() => undefined);

    await api.logout().catch(() => undefined);
    stream.close();
    clearSession();
    // Blob URLs outlive a `set`: the pictures of the chat somebody just signed
    // out of would stay readable in this process until the tab closed.
    forgetMedia();
    set({
      user: null,
      chats: [],
      messages: {},
      members: {},
      contacts: {},
      activeChatId: null,
      connected: false,
      privacy: {},
      plaintext: {},
    });
  },

  listen() {
    stream.connect(() => {
      // After a gap the socket cannot be trusted to have delivered everything,
      // so the client re-reads over REST (hard rule 8).
      void get().loadChats();
      // Including whether we are still in a call that started while we were away.
      void get().refreshCalls();

      const active = get().activeChatId;
      if (!active) return;

      void api.messages(active).then((page) =>
        set((state) => ({
          messages: { ...state.messages, [active]: [...page.items].reverse() },
          nextCursor: { ...state.nextCursor, [active]: page.nextCursor },
        })),
      );
    }, (online) => set({ connected: online }));

    stream.on((event) => {
      if (event.type === 'message.new' || event.type === 'message.edit') {
        const message = event.payload;

        if (event.type === 'message.new' && message.senderId !== loadSession()?.userId) {
          const chat = get().chats.find((c) => c.id === message.chatId);
          // The shell decides whether to actually show it — a notification for a
          // chat already on screen is noise. An encrypted message says only that
          // it arrived: putting its text on the lock screen would undo the point
          // of the mode.
          window.bmf?.notify(
            chat?.title || t('notify.newMessage'),
            message.envelope
              ? t('notify.privateMessage')
              : message.body || t('notify.attachment'),
          );
        }

        set((state) => ({
          messages: {
            ...state.messages,
            [message.chatId]: mergeMessage(state.messages[message.chatId] ?? [], message),
          },
        }));
        if (message.envelope) void get().decryptChat(message.chatId);
        void get().loadChats();
        return;
      }

      // Somebody left, or inherited the chat from an owner who did. The cached
      // roster is stale from here on, so it is dropped and asked for again
      // rather than patched — the answer includes roles, which may have moved.
      if (event.type === 'chat.member') {
        const { chatId } = event.payload;
        set((state) => {
          const members = { ...state.members };
          delete members[chatId];
          return { members };
        });
        if (get().activeChatId === chatId) void get().loadMembers(chatId);
        return;
      }

      if (event.type === 'chat.privacy') {
        const privacy = event.payload;
        set((state) => ({ privacy: { ...state.privacy, [privacy.chatId]: privacy } }));
        // An offer that has just been accepted is the moment the proposing side
        // learns which device to build a session with.
        void get().loadPrivacy(privacy.chatId);
        return;
      }

      if (event.type === 'presence.update') {
        const next = event.payload;
        set((state) => ({ presence: { ...state.presence, [next.userId]: next } }));
        return;
      }

      if (event.type === 'typing.start') {
        const { chatId, userId } = event.payload;
        set((state) => ({
          typing: {
            ...state.typing,
            [chatId]: { ...(state.typing[chatId] ?? {}), [userId]: Date.now() },
          },
        }));
        return;
      }

      if (event.type === 'message.delete') {
        const { chatId, messageId } = event.payload;
        set((state) => ({
          messages: {
            ...state.messages,
            [chatId]: blankBody(state.messages[chatId] ?? [], messageId),
          },
        }));
        return;
      }

      if (event.type === 'call.incoming') {
        const call = event.payload;
        const chat = get().chats.find((c) => c.id === call.chatId);
        window.bmf?.notify(chat?.title || t('notify.incomingCall'), t('notify.callInApp'));
        set({ incomingCall: call });
        return;
      }

      if (event.type === 'call.state') {
        const call = event.payload;
        const mine = loadSession()?.userId;

        if (call.endedAt) {
          // Whoever is showing this call — the card, the pill or the window —
          // has nothing left to show.
          set((state) => ({
            activeCall: state.activeCall?.id === call.id ? null : state.activeCall,
            incomingCall: state.incomingCall?.id === call.id ? null : state.incomingCall,
          }));
          return;
        }

        set((state) => ({
          activeCall: mine && call.participantIds.includes(mine) ? call : state.activeCall,
          incomingCall: state.incomingCall?.id === call.id ? call : state.incomingCall,
        }));
      }
    });

  },

  async loadChats() {
    const { items } = await api.chats();
    set({ chats: items });

    const unread = items.reduce((sum, chat) => sum + chat.unreadCount, 0);
    window.bmf?.setUnreadCount(unread);

    // The socket only reports changes, so the first picture has to be asked for
    // or everyone shows as offline until someone happens to reconnect.
    const peers = items.map((chat) => chat.peerId).filter((id): id is string => !!id);
    if (peers.length === 0) return;

    try {
      const { items: states } = await api.presence(peers);
      set((state) => ({
        presence: { ...state.presence, ...Object.fromEntries(states.map((p) => [p.userId, p])) },
      }));
    } catch {
      // Presence is decoration; failing to read it must not break the list.
    }
  },

  /**
   * Reads the roster once per chat and keeps it. Membership changes rarely and
   * cannot be changed from this client at all yet, so re-asking on every open
   * would spend a request to learn nothing. When editing a group lands, this is
   * the cache that has to be dropped.
   */
  async loadContacts() {
    const answer = await api.contacts().catch(() => null);
    if (!answer) return;

    set({ contacts: Object.fromEntries(answer.items.map((item) => [item.user.id, item])) });
  },

  async saveContact(userId, localName) {
    const contact = await api.saveContact(userId, localName);
    set((state) => ({ contacts: { ...state.contacts, [userId]: contact } }));
  },

  async removeContact(userId) {
    await api.removeContact(userId);
    set((state) => {
      const contacts = { ...state.contacts };
      delete contacts[userId];
      return { contacts };
    });
  },

  async loadMembers(chatId) {
    if (get().members[chatId]) return;

    try {
      const { items } = await api.members(chatId);
      set((state) => ({ members: { ...state.members, [chatId]: items } }));

      // Same reason as in `loadChats`: the socket reports only changes, so the
      // first picture of who is online has to be asked for.
      const { items: states } = await api.presence(items.map((member) => member.userId));
      set((state) => ({
        presence: { ...state.presence, ...Object.fromEntries(states.map((p) => [p.userId, p])) },
      }));
    } catch {
      // Without the roster a bubble loses its name; the chat still works.
    }
  },

  async openChat(chatId) {
    set({ activeChatId: chatId });

    // Only where a message can come from someone other than the two of you.
    const type = get().chats.find((chat) => chat.id === chatId)?.type;
    if (type === 'group' || type === 'channel') void get().loadMembers(chatId);

    if (!get().messages[chatId]) {
      const page = await api.messages(chatId);
      set((state) => ({
        // The API returns newest first; the view reads oldest to newest.
        messages: { ...state.messages, [chatId]: [...page.items].reverse() },
        nextCursor: { ...state.nextCursor, [chatId]: page.nextCursor },
      }));
    }

    // Where this chat stands on the privacy mode, and what its envelopes say.
    await get().loadPrivacy(chatId);
    await get().decryptChat(chatId);

    const last = get().messages[chatId]?.at(-1);
    if (last) {
      await api.markRead(chatId, last.id).catch(() => undefined);
      await get().loadChats();
    }
  },

  async loadOlder(chatId) {
    const cursor = get().nextCursor[chatId];
    if (!cursor) return;

    const page = await api.messages(chatId, cursor);
    set((state) => ({
      messages: {
        ...state.messages,
        [chatId]: [...[...page.items].reverse(), ...(state.messages[chatId] ?? [])],
      },
      nextCursor: { ...state.nextCursor, [chatId]: page.nextCursor },
    }));
  },

  async send(chatId, body, options) {
    // The client generates the id so a retry after a dropped connection cannot
    // produce a duplicate (hard rule 6).
    const clientMsgId = crypto.randomUUID();

    /**
     * A chat in privacy mode sends ciphertext and nothing else. The server
     * refuses the other shape, so a failure here is a failure to send rather
     * than a quiet fall back to plaintext — which is the only outcome that
     * would actually betray somebody.
     */
    const privacy = get().privacy[chatId];
    const context = get().user ? contextOf(get().user!.id) : null;

    if (privacy?.state === 'on' && context) {
      const envelope = await seal(context, privacy, body);
      const message = await api.send(chatId, { clientMsgId, body: '', envelope });

      // The ratchet cannot open this again on this side, so the plaintext is
      // kept here — on the device, which is where an E2E history lives.
      rememberSent(message.id, body);
      set((state) => ({
        messages: {
          ...state.messages,
          [chatId]: mergeMessage(state.messages[chatId] ?? [], message),
        },
        plaintext: { ...state.plaintext, [message.id]: body },
      }));
      await get().loadChats();
      return;
    }

    const message = await api.send(chatId, {
      clientMsgId,
      body,
      kind: options?.kind,
      attachmentIds: options?.attachmentIds,
      replyTo: options?.replyTo,
      scheduledAt: options?.scheduledAt,
    });

    set((state) => ({
      messages: {
        ...state.messages,
        [chatId]: mergeMessage(state.messages[chatId] ?? [], message),
      },
    }));
    await get().loadChats();
  },

  async edit(messageId, body) {
    const message = await api.edit(messageId, body);
    set((state) => ({
      messages: {
        ...state.messages,
        [message.chatId]: mergeMessage(state.messages[message.chatId] ?? [], message),
      },
    }));
    await get().loadChats();
  },

  async pin(chatId, messageId, pinned = true) {
    await api.pin(chatId, messageId, pinned);
    await get().loadChats();
  },

  async place(chatId, patch) {
    await api.setPlacement(chatId, patch);
    await get().loadChats();
  },

  /**
   * Puts a chat in the list when the server does not list it.
   *
   * A direct chat that was deleted stays out of `GET /chats` until the other
   * side writes, which is right for the list and wrong for the person who has
   * just opened that conversation from their contacts: they would land on the
   * empty-state placeholder. Opening it is a good enough reason to show it, and
   * if nothing is written it goes back to being hidden on the next reload.
   */
  ensureChat(chat) {
    if (get().chats.some((item) => item.id === chat.id)) return;
    set((state) => ({ chats: [{ ...chat, lastMessage: null }, ...state.chats] }));
  },

  /**
   * Leaves a room, or clears a direct chat — the server decides which by type.
   *
   * The local caches are dropped by hand rather than left to expire: the
   * decrypted text of a privacy-mode chat lives only here, and a chat the user
   * has just deleted must not still be readable from memory.
   */
  async removeChat(chatId) {
    await api.deleteChat(chatId);

    const gone = new Set((get().messages[chatId] ?? []).map((message) => message.id));

    set((state) => {
      const messages = { ...state.messages };
      const members = { ...state.members };
      const nextCursor = { ...state.nextCursor };
      const privacy = { ...state.privacy };
      delete messages[chatId];
      delete members[chatId];
      delete nextCursor[chatId];
      delete privacy[chatId];

      const plaintext = Object.fromEntries(
        Object.entries(state.plaintext).filter(([id]) => !gone.has(id)),
      );

      return {
        chats: state.chats.filter((chat) => chat.id !== chatId),
        activeChatId: state.activeChatId === chatId ? null : state.activeChatId,
        messages,
        members,
        nextCursor,
        privacy,
        plaintext,
      };
    });

    await get().loadChats();
  },

  /** Throttled by the caller; the server treats typing as ephemeral. */
  sendTyping(chatId) {
    stream.send({ type: 'typing', payload: { chatId } });
  },

  async forward(messageId, toChatId) {
    const message = await api.send(toChatId, {
      clientMsgId: crypto.randomUUID(),
      body: '',
      forwardFrom: messageId,
    });

    set((state) => ({
      messages: {
        ...state.messages,
        [toChatId]: mergeMessage(state.messages[toChatId] ?? [], message),
      },
    }));
    await get().loadChats();
  },

  async react(messageId, emoji) {
    const updated = await api.react(messageId, emoji);
    set((state) => ({
      messages: {
        ...state.messages,
        [updated.chatId]: mergeMessage(state.messages[updated.chatId] ?? [], updated),
      },
    }));
  },

  async remove(messageId) {
    const chatId = get().activeChatId;
    await api.remove(messageId);
    if (!chatId) return;

    set((state) => ({
      messages: {
        ...state.messages,
        [chatId]: blankBody(state.messages[chatId] ?? [], messageId),
      },
    }));
  },
}));
