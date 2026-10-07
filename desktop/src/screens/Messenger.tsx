import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import type { Attachment, ChatListItem, Message } from '@bmf/shared';
import { api, loadSession } from '../api/client.js';
import { useApp } from '../store/app.js';
import { available as privacyAvailable } from '../privacy.js';
import { useTheme } from '../theme.js';
import { ChatInfo } from '../components/ChatInfo.js';
import { ContextMenu } from '../components/ContextMenu.js';
import { DeleteChat } from '../components/DeleteChat.js';
import { ForwardPicker } from '../components/ForwardPicker.js';
import { ImageViewer } from '../components/ImageViewer.js';
import { extensionOf, humanSize, isImage, useObjectUrl } from '../media.js';
import { colourOf } from '../components/LeftPanel.js';
import { MessageMenu, type MenuAction } from '../components/MessageMenu.js';
import { StickerPanel } from '../components/StickerPanel.js';
import { toast } from '../components/Toast.js';
import { plural, t, type MessageKey } from '../i18n/index.js';
import { nameFor, titleFor } from '../contacts.js';
import { dotStyle, presenceColour, presenceTitle } from '../status.js';
import { IconAttach, IconClose, IconSearch, IconSend, IconTrash } from '../components/icons.js';

function initials(title: string): string {
  const trimmed = title.trim();
  return trimmed ? trimmed.slice(0, 2).toUpperCase() : '··';
}

function clockOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

/** "был(а) недавно" is kinder than a timestamp, and honest at this precision. */
function lastSeenLabel(iso: string | null): string {
  if (!iso) return t('chat.presence.offline');

  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 5) return t('chat.presence.justNow');
  if (minutes < 60) return t('chat.presence.minutesAgo', { minutes });
  if (minutes < 24 * 60) return t('chat.presence.today');
  return t('chat.presence.longAgo');
}

/** The prototype's SCHED_OPTS, resolved against the clock at click time. */
const SCHEDULE_OPTIONS: { label: MessageKey; at: () => Date }[] = [
  { label: 'chat.schedule.inTenMinutes', at: () => new Date(Date.now() + 10 * 60_000) },
  { label: 'chat.schedule.inAnHour', at: () => new Date(Date.now() + 60 * 60_000) },
  {
    label: 'chat.schedule.todayAtSix',
    at: () => {
      const when = new Date();
      when.setHours(18, 0, 0, 0);
      // Past six already: the nearest six o'clock is tomorrow's.
      if (when.getTime() <= Date.now()) when.setDate(when.getDate() + 1);
      return when;
    },
  },
  {
    label: 'chat.schedule.tomorrowAtNine',
    at: () => {
      const when = new Date();
      when.setDate(when.getDate() + 1);
      when.setHours(9, 0, 0, 0);
      return when;
    },
  },
];

const FOLDERS: { id: string; title: MessageKey }[] = [
  { id: 'all', title: 'chat.folder.all' },
  { id: 'unread', title: 'chat.folder.unread' },
  { id: 'later', title: 'chat.folder.later' },
  { id: 'work', title: 'chat.folder.work' },
  { id: 'personal', title: 'chat.folder.personal' },
];

function inFolder(chat: ChatListItem, folder: string): boolean {
  if (folder === 'all') return true;
  if (folder === 'unread') return chat.unreadCount > 0;
  if (folder === 'later') return chat.isLater;
  return chat.folder === folder;
}

/** `#sbChats`: search, the folder strip, then the scrolling chat list. */
export function ChatsSidebar() {
  const chats = useApp((s) => s.chats);
  const activeChatId = useApp((s) => s.activeChatId);
  const openChat = useApp((s) => s.openChat);
  const presence = useApp((s) => s.presence);
  const contacts = useApp((s) => s.contacts);

  const [query, setQuery] = useState('');
  const [folder, setFolder] = useState('all');
  const [hits, setHits] = useState<{ message: Message; chatTitle: string }[] | null>(null);
  const [rowMenu, setRowMenu] = useState<{ at: { x: number; y: number }; chat: ChatListItem } | null>(
    null,
  );
  const [deleting, setDeleting] = useState<ChatListItem | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setHits(null);
      return;
    }

    const timer = window.setTimeout(() => {
      void api
        .search(query)
        .then((res) => setHits(res.items))
        .catch(() => setHits([]));
    }, 250);

    return () => window.clearTimeout(timer);
  }, [query]);

  const visible = chats.filter((chat) => inFolder(chat, folder));

  return (
    <>
      {rowMenu && (
        <ContextMenu
          at={rowMenu.at}
          onClose={() => setRowMenu(null)}
          actions={[
            {
              key: 'delete',
              danger: true,
              label: t(
                rowMenu.chat.type === 'group' || rowMenu.chat.type === 'channel'
                  ? 'chat.delete.menuItemLeave'
                  : 'chat.delete.menuItem',
              ),
              icon: <IconTrash />,
              run: () => {
                setDeleting(rowMenu.chat);
                setRowMenu(null);
              },
            },
          ]}
        />
      )}

      {deleting && <DeleteChat chat={deleting} onClose={() => setDeleting(null)} />}

      <div className="srch-row">
        <div className="srch-wrap">
          <IconSearch />
          <input
            className="srch"
            value={query}
            placeholder={t('chat.searchPlaceholder')}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="cf-row">
        {FOLDERS.map((item) => {
          const count =
            item.id === 'all'
              ? 0
              : chats.filter((chat) => inFolder(chat, item.id)).length;
          return (
            <button
              key={item.id}
              className={`cf${folder === item.id ? ' on' : ''}`}
              onClick={() => setFolder(item.id)}
            >
              {t(item.title)}
              {count > 0 && <span className="cf-n">{count}</span>}
            </button>
          );
        })}
      </div>

      <div className="sb-div" />

      <div className="sb-scroll">
        {hits !== null
          ? hits.map(({ message, chatTitle }) => (
              <div
                key={message.id}
                className="ci"
                onClick={() => {
                  setQuery('');
                  void openChat(message.chatId);
                }}
              >
                <div className="av" style={{ background: colourOf(message.chatId) }}>
                  {initials(chatTitle || '··')}
                </div>
                <div className="ci-mid">
                  <div className="ci-name">{chatTitle || t('chat.dmFallback')}</div>
                  <div className="ci-last">{message.body}</div>
                </div>
              </div>
            ))
          : visible.map((chat) => (
              <div
                key={chat.id}
                className={`ci${chat.id === activeChatId ? ' on' : ''}`}
                onClick={() => void openChat(chat.id)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setRowMenu({ at: { x: event.clientX, y: event.clientY }, chat });
                }}
              >
                <div
                  className={`av${chat.peerId && presence[chat.peerId]?.online ? ' ol' : ''}`}
                  style={{
                    background: colourOf(chat.id),
                    // The dot is the person's status, not merely "connected".
                    ...dotStyle(chat.peerId ? presence[chat.peerId] : undefined),
                  }}
                  title={chat.peerId ? presenceTitle(presence[chat.peerId]) : undefined}
                >
                  {initials(titleFor(chat, contacts) || t('chat.chatFallback'))}
                </div>
                <div className="ci-mid">
                  <div className="ci-name">{titleFor(chat, contacts) || t('chat.dmFallback')}</div>
                  <div className="ci-last">
                    {chat.draft ? (
                      <>
                        <span className="ci-draft">{t('chat.draft')}</span> {chat.draft}
                      </>
                    ) : (
                      chat.lastMessage?.body || t('chat.noMessages')
                    )}
                  </div>
                </div>
                <div className="ci-right">
                  <span className={`ci-time${chat.isLater ? ' ci-later' : ''}`}>
                    {chat.isLater
                      ? t('chat.later')
                      : chat.lastMessage
                        ? clockOf(chat.lastMessage.createdAt)
                        : ''}
                  </span>
                  {chat.unreadCount > 0 && <span className="ci-unread">{chat.unreadCount}</span>}
                </div>
              </div>
            ))}

        {hits !== null && hits.length === 0 && (
          <div className="ci-last" style={{ padding: '18px 12px', textAlign: 'center' }}>
            {t('common.nothingFound')}
          </div>
        )}

        {hits === null && visible.length === 0 && (
          <div className="ci-last" style={{ padding: '18px 12px', textAlign: 'center' }}>
            {t('chat.emptyFolder')}
          </div>
        )}
      </div>
    </>
  );
}

/**
 * An image inside a bubble.
 *
 * The intrinsic size the server read from the file header is used to hold the
 * space before the bytes arrive, so a chat full of photos does not jump around
 * as they load one by one.
 */
function Picture({ file, onOpen }: { file: Attachment; onOpen: () => void }) {
  const url = useObjectUrl(file.id);
  const ratio = file.width && file.height ? file.width / file.height : 4 / 3;

  if (url === null) {
    return <div className="m-file-s">{t('chat.message.imageFailed')}</div>;
  }

  return (
    <img
      className="m-img"
      src={url ?? TRANSPARENT}
      alt={file.name}
      style={url ? undefined : { aspectRatio: String(ratio), width: 260, opacity: 0.35 }}
      onClick={(event) => {
        event.stopPropagation();
        if (url) onOpen();
      }}
    />
  );
}

/** A 1×1 transparent GIF: the placeholder while the real bytes are on their way. */
const TRANSPARENT =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

function Bubble({
  message,
  mine,
  pinned,
  replied,
  plaintext,
  senderName,
  nameOf,
  onViewImage,
  onMenu,
  onReact,
}: {
  message: Message;
  mine: boolean;
  pinned: boolean;
  replied: Message | undefined;
  /** Who wrote it, where that is not obvious — groups and channels. */
  senderName: string | undefined;
  /** Resolves the author of the quoted message; same roster, same caveats. */
  nameOf: (userId: string) => string | undefined;
  onViewImage: (file: Attachment) => void;
  /**
   * What the envelope said, once this device opened it. Undefined while that is
   * still happening; an empty string means it cannot be opened here at all.
   */
  plaintext: string | undefined;
  onMenu: (event: ReactMouseEvent, message: Message) => void;
  onReact: (messageId: string, emoji: string) => void;
}) {
  const encrypted = Boolean(message.envelope);
  const deleted = !encrypted && message.body === '' && Object.keys(message.meta).length === 0;
  const attachments = (message.meta.attachments ?? []) as Attachment[];
  const sticker = message.kind === 'sticker';

  /**
   * A message whose text is only the file name says nothing the card does not.
   * The client sends it that way so the chat list has a preview; showing it in
   * the bubble as well reads as a caption nobody wrote.
   */
  const captionIsFilename =
    attachments.length === 1 && message.body === attachments[0]?.name;

  /**
   * An envelope this device has no session for is not an error to apologise
   * for — it is the mode working. The spec asks for it to be said plainly
   * rather than shown as an empty bubble.
   */
  const text = encrypted
    ? plaintext === undefined
      ? '…'
      : plaintext === ''
        ? t('chat.message.unreadable')
        : plaintext
    : message.body;

  return (
    <div
      className={`m ${mine ? 'out' : 'in'}${sticker ? ' sticker' : ''}`}
      onContextMenu={(event) => onMenu(event, message)}
    >
      {message.forwardedFrom && !deleted && (
        <div className="m-fwd">{t('chat.message.forwarded')}</div>
      )}

      {senderName && !deleted && (
        <div className="m-from" style={{ color: colourOf(message.senderId) }}>
          {senderName}
        </div>
      )}

      {replied && (
        <div className="m-reply">
          <div className="m-reply-n">{nameOf(replied.senderId) ?? t('chat.message.reply')}</div>
          {replied.body.slice(0, 60)}
          {replied.body.length > 60 && '…'}
        </div>
      )}

      {deleted ? (
        <i>{t('chat.message.deleted')}</i>
      ) : encrypted && plaintext === '' ? (
        <i>{text}</i>
      ) : captionIsFilename ? null : (
        text
      )}

      {attachments.map((file) =>
        isImage(file) ? (
          <Picture key={file.id} file={file} onOpen={() => onViewImage(file)} />
        ) : (
          <div className="m-file" key={file.id}>
            <div className="m-file-ico">{extensionOf(file.name, 'FILE')}</div>
            <div style={{ minWidth: 0 }}>
              <div className="m-file-n">{file.name || t('chat.message.attachment')}</div>
              <div className="m-file-s">
                {humanSize(file.size, [
                  t('chat.message.bytes'),
                  t('chat.message.kilobytes'),
                  t('chat.message.megabytes'),
                ])}
              </div>
            </div>
          </div>
        ),
      )}

      {Object.keys(message.reactions).length > 0 && (
        <div className="m-rx">
          {Object.entries(message.reactions).map(([emoji, tally]) => (
            <span
              key={emoji}
              className={`rx-chip${tally.mine ? ' mine' : ''}`}
              onClick={() => onReact(message.id, emoji)}
            >
              {emoji}
              <b>{tally.count}</b>
            </span>
          ))}
        </div>
      )}

      {message.scheduledAt && (
        <div className="m-sched">
          <svg viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          {t('chat.message.scheduledPrefix')}{' '}
          {new Date(message.scheduledAt).toLocaleString('ru-RU', {
            day: 'numeric',
            month: 'long',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      )}

      <div className="m-time">
        {pinned && <span className="m-edit">{t('chat.message.pinned')}</span>}
        {message.editedAt && <span className="m-edit">{t('chat.message.edited')}</span>}
        {clockOf(message.createdAt)}
      </div>
    </div>
  );
}

type Compose = { mode: 'reply' | 'edit'; message: Message } | null;

/** `#chatView`: header, pinned bar, message list, compose bar and input row. */
export function ChatView() {
  const chats = useApp((s) => s.chats);
  const activeChatId = useApp((s) => s.activeChatId);
  const messages = useApp((s) => s.messages);
  const send = useApp((s) => s.send);
  const edit = useApp((s) => s.edit);
  const react = useApp((s) => s.react);
  const remove = useApp((s) => s.remove);
  const pin = useApp((s) => s.pin);
  const place = useApp((s) => s.place);
  const sendTyping = useApp((s) => s.sendTyping);
  const typing = useApp((s) => s.typing);
  const loadOlder = useApp((s) => s.loadOlder);
  const nextCursor = useApp((s) => s.nextCursor);
  const presence = useApp((s) => s.presence);
  const members = useApp((s) => s.members);
  const contacts = useApp((s) => s.contacts);
  const privacy = useApp((s) => s.privacy);
  const plaintext = useApp((s) => s.plaintext);
  const setPrivacy = useApp((s) => s.setPrivacy);
  const chatBg = useTheme().chatBg;

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [compose, setCompose] = useState<Compose>(null);
  const [menu, setMenu] = useState<{ at: { x: number; y: number }; message: Message } | null>(null);
  const [stickers, setStickers] = useState<'emoji' | 'stickers' | null>(null);
  const [scheduled, setScheduled] = useState<{ label: MessageKey; at: Date } | null>(null);
  const [scheduleMenu, setScheduleMenu] = useState<{ x: number; y: number } | null>(null);
  const [forwarding, setForwarding] = useState<string | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [viewing, setViewing] = useState<Attachment | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const lastTypingAt = useRef(0);
  const myUserId = loadSession()?.userId ?? '';

  const active = chats.find((c) => c.id === activeChatId) ?? null;

  const typingHere =
    !!activeChatId &&
    Object.values(typing[activeChatId] ?? {}).some((at) => Date.now() - at < 5000);

  const thread = useMemo(
    () => (activeChatId ? (messages[activeChatId] ?? []) : []),
    [messages, activeChatId],
  );

  const byId = useMemo(() => new Map(thread.map((m) => [m.id, m])), [thread]);

  /**
   * The pinned bar shows one pin at a time and steps to the next when clicked,
   * newest first. A chat with three pins and a bar that can only show one is
   * what people meant by "closing" a pin before — so the bar pages, and the
   * cross unpins only what is on it.
   */
  const pinnedIds = useMemo(() => active?.pinnedMessageIds ?? [], [active]);
  const [pinAt, setPinAt] = useState(0);

  useEffect(() => setPinAt(0), [activeChatId, pinnedIds.length]);

  const pinnedId = pinnedIds.length ? pinnedIds[Math.min(pinAt, pinnedIds.length - 1)] : undefined;
  const pinnedMessage = pinnedId ? byId.get(pinnedId) : undefined;
  const peer = active?.peerId ? presence[active.peerId] : undefined;
  const chatPrivacy = activeChatId ? privacy[activeChatId] : undefined;

  const roster = activeChatId ? members[activeChatId] : undefined;

  /**
   * Author names for this chat, by id.
   *
   * Someone who has left the group is no longer in the roster, and their old
   * messages then have no name to show. That is deliberate: an id rendered raw
   * would be worse than the anonymous bubble this change is fixing.
   */
  const nameOf = useMemo(() => {
    // Whatever this account calls them wins over what they call themselves,
    // and it has to win here too or a group would name the same person two
    // different ways in two lines of the same screen.
    const names = new Map(
      roster?.map((member) => [member.userId, nameFor(member.user, contacts)]),
    );
    return (userId: string) => names.get(userId);
  }, [roster, contacts]);

  /** Names go over incoming bubbles only where more than one person can write. */
  const named = active?.type === 'group' || active?.type === 'channel';

  /**
   * `N участников, M в сети` — the prototype's header line, and the reason the
   * roster is worth fetching even for a chat nobody has written in yet. Falls
   * back to the literal word for the chat kind until the roster arrives.
   */
  const rosterLine = useMemo(() => {
    if (!roster || !active) return undefined;

    const channel = active.type === 'channel';
    const word = plural(
      roster.length,
      t(channel ? 'chat.presence.subscriberWord.one' : 'chat.presence.memberWord.one'),
      t(channel ? 'chat.presence.subscriberWord.few' : 'chat.presence.memberWord.few'),
      t(channel ? 'chat.presence.subscriberWord.many' : 'chat.presence.memberWord.many'),
    );
    const online = roster.filter((member) => presence[member.userId]?.online).length;

    return online > 0
      ? t('chat.presence.membersOnline', { count: roster.length, word, online })
      : t('chat.presence.members', { count: roster.length, word });
  }, [roster, active, presence]);

  /**
   * Offering the mode, and answering an offer.
   *
   * Both go through the server, which is what makes the agreement binding: a
   * client that flipped this by itself would encrypt to a device the other side
   * never accepted, and the messages would arrive unreadable.
   */
  async function togglePrivacy() {
    if (!active) return;

    if (!privacyAvailable()) {
      toast(t('chat.privacy.desktopOnly'));
      return;
    }

    if (chatPrivacy?.state === 'on') {
      await answerPrivacy('cancel');
      return;
    }

    try {
      await setPrivacy(active.id, 'propose');
      toast(t('chat.privacy.proposed'));
    } catch {
      toast(t('chat.privacy.proposeFailed'));
    }
  }

  async function answerPrivacy(action: 'accept' | 'cancel') {
    if (!active) return;

    try {
      await setPrivacy(active.id, action);
      toast(action === 'accept' ? t('chat.privacy.on') : t('chat.privacy.off'));
    } catch {
      toast(t('chat.privacy.changeFailed'));
    }
  }

  useEffect(() => {
    const node = listRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [thread.length, activeChatId]);

  // Switching chats must not carry a half-written reply into the next one.
  useEffect(() => {
    setCompose(null);
    setDraft('');
    setStickers(null);
    setScheduled(null);
  }, [activeChatId]);

  function announceTyping() {
    if (!activeChatId) return;
    const now = Date.now();
    if (now - lastTypingAt.current < 3000) return;
    lastTypingAt.current = now;
    sendTyping(activeChatId);
  }

  function startCompose(mode: 'reply' | 'edit', message: Message) {
    setCompose({ mode, message });
    if (mode === 'edit') setDraft(message.body);
    inputRef.current?.focus();
  }

  function cancelCompose() {
    if (compose?.mode === 'edit') setDraft('');
    setCompose(null);
  }

  async function submit() {
    const body = draft.trim();
    if (!body || !activeChatId || sending) return;

    setSending(true);
    setDraft('');
    const pending = compose;
    const at = scheduled;
    setCompose(null);
    setScheduled(null);

    try {
      if (pending?.mode === 'edit') await edit(pending.message.id, body);
      else {
        await send(activeChatId, body, {
          replyTo: pending?.message.id,
          scheduledAt: at?.at.toISOString(),
        });
        if (at) toast(t('chat.compose.willSend', { when: t(at.label).toLowerCase() }));
      }
    } catch {
      setDraft(body);
      setCompose(pending);
      setScheduled(at);
    } finally {
      setSending(false);
    }
  }

  async function attach(file: File | undefined) {
    if (!file || !activeChatId) return;

    setAttaching(true);
    try {
      const uploaded = await api.upload(file);
      await send(activeChatId, draft.trim() || file.name, { attachmentIds: [uploaded.id] });
      setDraft('');
    } catch {
      toast(t('chat.compose.attachFailed'));
    } finally {
      setAttaching(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Escape' && compose) {
      event.preventDefault();
      cancelCompose();
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  }

  function openMenu(event: ReactMouseEvent, message: Message) {
    event.preventDefault();
    setMenu({ at: { x: event.clientX, y: event.clientY }, message });
  }

  if (!active) {
    return (
      <div className="msgs" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--txt2)' }}>
          <div style={{ fontSize: 15, marginBottom: 6 }}>{t('chat.pickChat')}</div>
          <div style={{ fontSize: 13 }}>{t('chat.pickChatHint')}</div>
        </div>
      </div>
    );
  }

  const menuActions = (message: Message): MenuAction[] => {
    const mine = message.senderId === myUserId;
    const isPinned = pinnedIds.includes(message.id);

    const items: MenuAction[] = [
      {
        key: 'reply',
        label: t('chat.menu.reply'),
        icon: (
          <svg viewBox="0 0 24 24">
            <polyline points="9 17 4 12 9 7" />
            <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
          </svg>
        ),
        run: () => {
          setMenu(null);
          startCompose('reply', message);
        },
      },
      {
        key: 'forward',
        label: t('chat.menu.forward'),
        icon: (
          <svg viewBox="0 0 24 24">
            <polyline points="15 17 20 12 15 7" />
            <path d="M4 18v-2a4 4 0 0 1 4-4h12" />
          </svg>
        ),
        run: () => {
          setMenu(null);
          setForwarding(message.id);
        },
      },
      {
        key: 'copy',
        label: t('chat.menu.copy'),
        icon: (
          <svg viewBox="0 0 24 24">
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        ),
        run: () => {
          setMenu(null);
          void navigator.clipboard
            ?.writeText(message.body)
            .then(() => toast(t('common.copied')))
            .catch(() => toast(t('common.copyUnavailable')));
        },
      },
    ];

    if (mine) {
      items.push({
        key: 'edit',
        label: t('chat.menu.edit'),
        icon: (
          <svg viewBox="0 0 24 24">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        ),
        run: () => {
          setMenu(null);
          startCompose('edit', message);
        },
      });
    }

    items.push({
      key: 'pin',
      label: isPinned ? t('chat.menu.unpin') : t('chat.menu.pin'),
      icon: (
        <svg viewBox="0 0 24 24">
          <line x1="12" y1="17" x2="12" y2="22" />
          <path d="M5 17h14l-1.5-3V4h-11v10z" />
        </svg>
      ),
      run: () => {
        setMenu(null);
        void pin(active.id, message.id, !isPinned)
          .then(() => toast(isPinned ? t('chat.menu.unpinned') : t('chat.menu.pinned')))
          .catch(() => toast(t('chat.menu.pinDenied')));
      },
    });

    if (mine) {
      items.push(
        { key: 'sep', label: '', icon: <svg />, run: () => undefined },
        {
          key: 'delete',
          label: t('chat.menu.delete'),
          danger: true,
          icon: (
            <svg viewBox="0 0 24 24">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
            </svg>
          ),
          run: () => {
            setMenu(null);
            void remove(message.id).then(() => toast(t('chat.menu.deleted')));
          },
        },
      );
    }

    return items;
  };

  return (
    <div id="chatView" style={{ position: 'relative' }}>
      {forwarding && <ForwardPicker messageId={forwarding} onClose={() => setForwarding(null)} />}

      {infoOpen && <ChatInfo chat={active} onClose={() => setInfoOpen(false)} />}

      {viewing && <ImageViewer file={viewing} onClose={() => setViewing(null)} />}

      {menu && (
        <MessageMenu
          at={menu.at}
          actions={menuActions(menu.message)}
          onReact={(emoji) => {
            const id = menu.message.id;
            setMenu(null);
            void react(id, emoji);
          }}
          onClose={() => setMenu(null)}
        />
      )}

      <div className="ch">
        <div
          className={`av${peer?.online ? ' ol' : ''}`}
          style={{ background: colourOf(active.id), cursor: 'pointer', ...dotStyle(peer) }}
          title={t('chat.header.info')}
          onClick={() => setInfoOpen(true)}
        >
          {initials(titleFor(active, contacts) || t('chat.chatFallback'))}
        </div>
        <div
          className="ch-info"
          style={{ cursor: 'pointer' }}
          title={t('chat.header.info')}
          onClick={() => setInfoOpen(true)}
        >
          <div className="ch-name">{titleFor(active, contacts) || t('chat.dmFallback')}</div>
          <div
            className="ch-status"
            style={peer?.online ? { color: presenceColour(peer) } : undefined}
          >
            {typingHere
              ? t('chat.presence.typing')
              : active.type === 'dm'
                ? peer
                  ? peer.online
                    ? // "в сети" is only the half of it once a status can say
                      // otherwise: away, in a call, not to be disturbed.
                      (presenceTitle(peer) ?? t('chat.presence.online'))
                    : lastSeenLabel(peer.lastSeenAt)
                  : t('chat.presence.dm')
                : (rosterLine ??
                  (active.type === 'channel'
                    ? t('chat.presence.channel')
                    : t('chat.presence.group')))}
          </div>
        </div>
        <div className="ch-acts">
          {/* The call opens in its own window; starting it is the API's job, and
              the window joins with the same session once it exists. */}
          <button
            className="ib"
            title={t('chat.header.audioCall')}
            onClick={() =>
              void api
                .startCall(active.id, 'audio')
                .then((credentials) => window.bmf?.openCall(credentials.call.id))
                .catch(() => toast(t('chat.header.callsUnavailable')))
            }
          >
            <svg viewBox="0 0 24 24">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
          </button>

          <button
            className="ib"
            title={t('chat.header.videoCall')}
            onClick={() =>
              void api
                .startCall(active.id, 'video')
                .then((credentials) => window.bmf?.openCall(credentials.call.id))
                .catch(() => toast(t('chat.header.callsUnavailable')))
            }
          >
            <svg viewBox="0 0 24 24">
              <polygon points="23 7 16 12 23 17 23 7" />
              <rect x="1" y="5" width="15" height="14" rx="2" />
            </svg>
          </button>

          {/* Offered in the chat and nowhere else: the spec is explicit that
              this decision belongs to a conversation, not to the settings. */}
          {active.type === 'dm' && (
            <button
              className={`ib${chatPrivacy?.state === 'on' ? ' on' : ''}`}
              title={
                chatPrivacy?.state === 'on'
                  ? t('chat.privacy.buttonOn')
                  : chatPrivacy?.state === 'proposed'
                    ? t('chat.privacy.buttonProposed')
                    : t('chat.privacy.buttonOffer')
              }
              onClick={() => void togglePrivacy()}
            >
              <svg viewBox="0 0 24 24">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </button>
          )}

          <button
            className="ib"
            title={t('chat.header.defer')}
            onClick={() =>
              void place(active.id, { isLater: !active.isLater }).then(() =>
                toast(active.isLater ? t('chat.header.undeferred') : t('chat.header.deferred')),
              )
            }
          >
            <svg viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </button>
        </div>
      </div>

      {chatPrivacy && chatPrivacy.state !== 'off' && (
        <div className="pin-bar show">
          <div className="pin-strip" />
          <div className="pin-mid">
            <div className="pin-t">
              <svg viewBox="0 0 24 24">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              {chatPrivacy.state === 'on'
                ? t('chat.privacy.barOn')
                : chatPrivacy.proposedBy === myUserId
                  ? t('chat.privacy.barWaiting')
                  : t('chat.privacy.barOffered')}
            </div>
            <div className="pin-x">
              {chatPrivacy.state === 'on'
                ? t('chat.privacy.textOn')
                : chatPrivacy.proposedBy === myUserId
                  ? t('chat.privacy.textWaiting')
                  : t('chat.privacy.textOffered')}
            </div>
          </div>

          {chatPrivacy.state === 'proposed' && chatPrivacy.proposedBy !== myUserId && (
            <button
              className="ib"
              title={t('chat.privacy.accept')}
              onClick={() => void answerPrivacy('accept')}
            >
              <svg viewBox="0 0 24 24">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </button>
          )}

          <button
            className="ib"
            title={chatPrivacy.state === 'on' ? t('chat.privacy.turnOff') : t('chat.privacy.decline')}
            onClick={() => void answerPrivacy('cancel')}
          >
            <IconClose />
          </button>
        </div>
      )}

      {pinnedMessage && pinnedId && (
        <div className="pin-bar show">
          <div className="pin-strip" />
          {/* The whole strip steps to the next pin, oldest after newest and back
              round again. With a single pin there is nowhere to step, so it does
              not pretend to be a button. */}
          <div
            className="pin-mid"
            style={pinnedIds.length > 1 ? { cursor: 'pointer' } : undefined}
            title={pinnedIds.length > 1 ? t('chat.pin.next') : undefined}
            onClick={() => setPinAt((at) => (at + 1) % pinnedIds.length)}
          >
            <div className="pin-t">
              <svg viewBox="0 0 24 24">
                <line x1="12" y1="17" x2="12" y2="22" />
                <path d="M5 17h14l-1.5-3V4h-11v10z" />
              </svg>
              {pinnedIds.length > 1
                ? t('chat.pin.counted', { at: pinAt + 1, total: pinnedIds.length })
                : t('chat.pin.title')}
            </div>
            <div className="pin-x">{pinnedMessage.body.slice(0, 90)}</div>
          </div>
          <button
            className="ib"
            title={t('chat.pin.unpin')}
            onClick={() =>
              void pin(active.id, pinnedId, false).then(() => toast(t('chat.menu.unpinned')))
            }
          >
            <IconClose />
          </button>
        </div>
      )}

      <div
        className="msgs"
        ref={listRef}
        style={chatBg ? { background: `url('${chatBg}') center/cover local` } : undefined}
      >
        {nextCursor[active.id] && (
          <button className="ia" onClick={() => void loadOlder(active.id)}>
            {t('chat.loadOlder')}
          </button>
        )}

        {thread.map((message) => (
          <Bubble
            key={message.id}
            message={message}
            mine={message.senderId === myUserId}
            pinned={pinnedIds.includes(message.id)}
            replied={message.replyTo ? byId.get(message.replyTo) : undefined}
            plaintext={plaintext[message.id]}
            senderName={named && message.senderId !== myUserId ? nameOf(message.senderId) : undefined}
            nameOf={nameOf}
            onViewImage={setViewing}
            onMenu={openMenu}
            onReact={(id, emoji) => void react(id, emoji)}
          />
        ))}
      </div>

      {compose && (
        <div className="reply-bar show">
          <div className="reply-bar-strip" />
          <div className="reply-bar-mid">
            <div className="reply-bar-t">
              {compose.mode === 'reply' ? t('chat.compose.reply') : t('chat.compose.edit')}
            </div>
            <div className="reply-bar-x">{compose.message.body}</div>
          </div>
          <button className="ib" title={t('chat.compose.cancel')} onClick={cancelCompose}>
            <IconClose />
          </button>
        </div>
      )}

      {scheduled && (
        <div className="sched-bar show">
          <div className="sched-chip">
            <svg viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>
              {t('chat.compose.scheduledAt', { when: t(scheduled.label).toLowerCase() })}
            </span>
          </div>
          <button
            className="ib"
            title={t('chat.compose.cancel')}
            onClick={() => setScheduled(null)}
          >
            <IconClose />
          </button>
        </div>
      )}

      {scheduleMenu && (
        <MessageMenu
          at={scheduleMenu}
          onReact={() => undefined}
          onClose={() => setScheduleMenu(null)}
          actions={SCHEDULE_OPTIONS.map((option) => ({
            key: option.label,
            label: t(option.label),
            icon: (
              <svg viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            ),
            run: () => {
              setScheduleMenu(null);
              setScheduled({ label: option.label, at: option.at() });
              inputRef.current?.focus();
            },
          }))}
        />
      )}

      {stickers && (
        <StickerPanel
          tab={stickers}
          onInsert={(text) => {
            setDraft((current) => current + text);
            inputRef.current?.focus();
          }}
          onSend={(text) => {
            setStickers(null);
            // Marked as a sticker, or the bubble draws it at message size — which
            // is defect #16: the CSS for a big one was there all along, the
            // message just never said it was one.
            if (activeChatId) void send(activeChatId, text, { kind: 'sticker' });
          }}
          onClose={() => setStickers(null)}
        />
      )}

      <div className="inp-row">
        <input
          ref={fileRef}
          type="file"
          style={{ display: 'none' }}
          onChange={(e) => void attach(e.target.files?.[0])}
        />

        <button
          className="ia"
          title={t('chat.compose.emoji')}
          onClick={() => setStickers((open) => (open === 'emoji' ? null : 'emoji'))}
        >
          <svg viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" />
            <path d="M8 14s1.5 2 4 2 4-2 4-2" />
            <line x1="9" y1="9" x2="9.01" y2="9" strokeLinecap="round" strokeWidth={3} />
            <line x1="15" y1="9" x2="15.01" y2="9" strokeLinecap="round" strokeWidth={3} />
          </svg>
        </button>

        <button
          className="ia"
          title={t('chat.compose.stickers')}
          onClick={() => setStickers((open) => (open === 'stickers' ? null : 'stickers'))}
        >
          <svg viewBox="0 0 24 24">
            <path d="M21 12a9 9 0 1 1-9-9c0 4 1 5 5 5s5 1 4 4z" />
            <path d="M12 21c3-1 8-6 9-9" />
          </svg>
        </button>

        <textarea
          ref={inputRef}
          className="mi"
          rows={1}
          value={draft}
          placeholder={
            active.type === 'channel'
              ? t('chat.compose.channelPlaceholder')
              : t('chat.compose.placeholder')
          }
          onChange={(e) => {
            setDraft(e.target.value);
            announceTyping();
          }}
          onKeyDown={onKeyDown}
        />

        <button
          className="ia"
          title={t('chat.compose.attach')}
          disabled={attaching}
          onClick={() => fileRef.current?.click()}
        >
          <IconAttach />
        </button>

        <div className="send-wrap">
          <button
            className="sb-btn"
            onClick={() => void submit()}
            onContextMenu={(event) => {
              event.preventDefault();
              setScheduleMenu({ x: event.clientX, y: event.clientY });
            }}
            disabled={!draft.trim() || sending}
            title={t('chat.compose.send')}
          >
            <span className="send-ico">
              <IconSend />
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
