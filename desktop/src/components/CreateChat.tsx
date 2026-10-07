import { useEffect, useRef, useState } from 'react';
import type { User } from '@bmf/shared';
import { api } from '../api/client.js';
import { t } from '../i18n/index.js';
import { useObjectUrl } from '../media.js';
import { useApp } from '../store/app.js';
import { LeftPanel, PickCheck, colourOf } from './LeftPanel.js';
import { toast } from './Toast.js';

/**
 * The prototype's creation wizard: name and picture first, then who joins and
 * with what role. Roles are sent to the server, which is where they are
 * enforced — the select here only decides what to ask for (hard rule 3).
 */
/** A solid background, because a popup drawn by the OS has no theme behind it. */
const OPTION = { background: 'var(--solid)', color: 'var(--txt)' } as const;

export function CreateChat({
  kind,
  onClose,
}: {
  kind: 'group' | 'channel';
  onClose: () => void;
}) {
  const isGroup = kind === 'group';

  const [step, setStep] = useState<1 | 2>(1);
  const [title, setTitle] = useState('');
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<User[]>([]);
  const [picked, setPicked] = useState<Record<string, 'admin' | 'member'>>({});
  const [busy, setBusy] = useState(false);
  const [description, setDescription] = useState('');
  const [avatarId, setAvatarId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const preview = useObjectUrl(avatarId);

  const openChat = useApp((s) => s.openChat);
  const loadChats = useApp((s) => s.loadChats);

  async function pickPicture(file: File | undefined) {
    if (!file) return;

    try {
      // Uploaded straight away and pointed at when the chat is created. An
      // upload nobody claims is swept up by the orphan job within a day.
      setAvatarId((await api.upload(file)).id);
    } catch {
      toast(t('editChat.pictureFailed'));
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  useEffect(() => {
    if (step !== 2 || query.trim().length < 2) {
      setFound([]);
      return;
    }

    const timer = window.setTimeout(() => {
      void api
        .searchUsers(query.trim())
        .then((res) => setFound(res.items))
        .catch(() => setFound([]));
    }, 250);

    return () => window.clearTimeout(timer);
  }, [query, step]);

  const memberIds = Object.keys(picked);

  const toggle = (user: User) =>
    setPicked((current) => {
      const next = { ...current };
      if (next[user.id]) delete next[user.id];
      else next[user.id] = 'member';
      return next;
    });

  async function create() {
    setBusy(true);
    try {
      const chat = await api.createChat({
        type: kind,
        title: title.trim(),
        description: description.trim(),
        avatarId: avatarId ?? undefined,
        memberIds,
        roles: picked,
      });
      await loadChats();
      await openChat(chat.id);
      onClose();
      toast(isGroup ? t('createChat.groupCreated') : t('createChat.channelCreated'));
    } catch {
      toast(isGroup ? t('createChat.groupFailed') : t('createChat.channelFailed'));
    } finally {
      setBusy(false);
    }
  }

  if (step === 1) {
    return (
      <LeftPanel
        title={isGroup ? t('createChat.groupTitle') : t('createChat.channelTitle')}
        onClose={onClose}
        footer={{
          label: t('common.next'),
          enabled: !!title.trim(),
          onClick: () => setStep(2),
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => void pickPicture(e.target.files?.[0])}
        />

        <div className="wz-top">
          {/* Defect #21: this button did nothing at all. */}
          <div
            className={`wz-av${preview ? ' has-img' : ''}`}
            style={preview ? { backgroundImage: `url('${preview}')` } : undefined}
            title={t('editChat.picture')}
            onClick={() => fileRef.current?.click()}
          >
            {!preview && (
              <svg viewBox="0 0 24 24">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            )}
          </div>
          <div className="wz-fields">
            <input
              className="wz-inp"
              autoFocus
              value={title}
              placeholder={isGroup ? t('createChat.groupName') : t('createChat.channelName')}
              onChange={(e) => setTitle(e.target.value)}
            />
            <textarea
              className="wz-inp"
              value={description}
              placeholder={t('editChat.descriptionPlaceholder')}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <div className="ct-sub" style={{ padding: '0 4px' }}>
          {isGroup ? t('createChat.groupHint') : t('createChat.channelHint')}
        </div>
      </LeftPanel>
    );
  }

  return (
    <LeftPanel
      title={t('createChat.members')}
      onClose={onClose}
      onBack={() => setStep(1)}
      footer={{
        label: memberIds.length
          ? t('createChat.createCount', { count: memberIds.length })
          : t('common.create'),
        enabled: !busy,
        onClick: () => void create(),
      }}
    >
      <div className="wz-lbl" style={{ paddingTop: 0 }}>
        {t('createChat.whoToAdd', { title: title.trim() })}
      </div>

      <input
        className="wz-inp"
        autoFocus
        value={query}
        placeholder={t('createChat.searchPlaceholder')}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div style={{ marginTop: 8 }}>
        {found.map((user) => (
          <div
            key={user.id}
            className={`pk-row${picked[user.id] ? ' sel' : ''}`}
            onClick={() => toggle(user)}
          >
            <PickCheck />
            <div className="av" style={{ background: colourOf(user.id) }}>
              {user.username.slice(0, 2).toUpperCase()}
            </div>
            <div className="pk-mid">
              <div className="pk-name">{user.displayName}</div>
              <div className="pk-sub">@{user.username}</div>
            </div>
            <select
              className="pk-role"
              value={picked[user.id] ?? 'member'}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) =>
                setPicked((current) => ({
                  ...current,
                  [user.id]: event.target.value as 'admin' | 'member',
                }))
              }
            >
              {/* The list that drops down is drawn by the platform, not by the
                  stylesheet: it took the app's light text and put it on its own
                  white popup, which is defect #23. Stated on the option itself,
                  where the popup will actually read it. */}
              <option value="member" style={OPTION}>
                {isGroup ? t('createChat.roleMember') : t('createChat.roleSubscriber')}
              </option>
              <option value="admin" style={OPTION}>
                {t('createChat.roleAdmin')}
              </option>
            </select>
          </div>
        ))}
      </div>

      {found.length === 0 && (
        <div className="ct-sub" style={{ padding: '14px 4px', textAlign: 'center' }}>
          {query.trim().length < 2 ? t('createChat.searchHint') : t('createChat.searchNone')}
        </div>
      )}
    </LeftPanel>
  );
}
