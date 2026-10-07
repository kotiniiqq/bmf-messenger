import { useEffect, useState } from 'react';
import type { Attachment, ChatListItem, User } from '@bmf/shared';
import { api } from '../api/client.js';
import { t } from '../i18n/index.js';
import { useObjectUrl } from '../media.js';
import { useApp } from '../store/app.js';
import { Avatar } from './Avatar.js';
import { ImageViewer } from './ImageViewer.js';
import { LeftPanel } from './LeftPanel.js';
import { toast } from './Toast.js';

/**
 * A person, opened from the chat they are in — defect #24.
 *
 * Nothing about a contact was reachable before this: not their picture, not
 * when they were last online, not the pictures you had exchanged. The chat
 * header and the member list both lead here.
 *
 * Not here yet, and deliberately: a phone number. There is no phone anywhere in
 * the data model, and adding one is a product decision about verification and
 * who may see it rather than a screen.
 */
export function UserProfile({
  user,
  chat,
  onClose,
}: {
  user: User;
  /** Where the shared pictures come from; absent when opened outside a chat. */
  chat: ChatListItem | null;
  onClose: () => void;
}) {
  const presence = useApp((s) => s.presence[user.id]);
  const messages = useApp((s) => (chat ? s.messages[chat.id] : undefined));
  const contact = useApp((s) => s.contacts[user.id]);
  const saveContact = useApp((s) => s.saveContact);
  const removeContact = useApp((s) => s.removeContact);

  const [photos, setPhotos] = useState<Attachment[] | null>(null);
  const [viewing, setViewing] = useState<Attachment | null>(null);
  /** The rename field, open only while it is being used. */
  const [naming, setNaming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!chat) return;

    let alive = true;
    void api
      .chatMedia(chat.id)
      .then((page) => alive && setPhotos(page.items))
      .catch(() => alive && setPhotos([]));

    return () => {
      alive = false;
    };
  }, [chat]);

  // The newest pin. The profile has room for one, and the chat's own header is
  // where the rest are paged through.
  const pinnedId = chat?.pinnedMessageIds[0];
  const pinned = pinnedId ? messages?.find((message) => message.id === pinnedId) : undefined;

  function save() {
    if (naming === null || busy) return;

    setBusy(true);
    void saveContact(user.id, naming)
      .then(() => {
        setNaming(null);
        toast(t('contacts.saved'));
      })
      .catch(() => toast(t('contacts.saveFailed')))
      .finally(() => setBusy(false));
  }

  return (
    <LeftPanel title={t('profile.contact.title')} onClose={onClose}>
      {viewing && <ImageViewer file={viewing} onClose={() => setViewing(null)} />}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '14px 0 6px',
        }}
      >
        <Avatar
          userId={user.id}
          avatarUrl={user.avatarUrl}
          name={user.displayName || user.username}
          className="sp-av"
        />
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--txt)', marginTop: 10 }}>
          {contact?.localName?.trim() || user.displayName}
        </div>
        {/* The name they chose, shown under yours: renaming a contact must not
            hide who they actually are. */}
        {contact?.localName?.trim() && <div className="ct-sub">{user.displayName}</div>}
        <div className="ct-sub">@{user.username}</div>
        <div className="ct-sub">{lastSeen(presence, user)}</div>
      </div>

      {/* Defect #25: adding somebody was possible only from the contacts panel,
          which is the one place you are not when you are talking to them. */}
      {naming === null ? (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', padding: '2px 4px 8px' }}>
          <button className="sub-btn" onClick={() => setNaming(contact?.localName ?? '')}>
            {contact ? t('contacts.rename') : t('contacts.add')}
          </button>
          {contact && (
            <button
              className="sub-btn"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void removeContact(user.id)
                  .then(() => toast(t('contacts.removed')))
                  .catch(() => toast(t('contacts.saveFailed')))
                  .finally(() => setBusy(false));
              }}
            >
              {t('contacts.remove')}
            </button>
          )}
        </div>
      ) : (
        <div style={{ padding: '2px 4px 8px' }}>
          <div className="wz-lbl">{t('contacts.localName')}</div>
          <input
            className="wz-inp"
            value={naming}
            autoFocus
            maxLength={80}
            placeholder={user.displayName}
            onChange={(event) => setNaming(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && save()}
          />
          <div className="ct-sub" style={{ padding: '4px 0' }}>
            {t('contacts.localNameHint')}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="sub-btn" disabled={busy} onClick={save}>
              {t('common.save')}
            </button>
            <button className="sub-btn" onClick={() => setNaming(null)}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      {pinned && (
        <>
          <div className="wz-lbl">{t('profile.contact.pinned')}</div>
          <div className="m-reply" style={{ margin: '0 4px 8px' }}>
            {pinned.body.slice(0, 140) || t('chat.message.attachment')}
          </div>
        </>
      )}

      {chat && (
        <>
          <div className="wz-lbl">
            {photos === null
              ? t('profile.contact.photosLoading')
              : t('profile.contact.photos', { count: photos.length })}
          </div>

          {photos !== null &&
            (photos.length === 0 ? (
              <div className="ct-sub" style={{ padding: '4px' }}>
                {t('profile.contact.noPhotos')}
              </div>
            ) : (
              // The prototype never drew a gallery, so there is no class for one
              // to port. Inline rather than invented: `npm run lint` refuses a
              // class name no stylesheet defines, and rightly.
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 4,
                  padding: '0 4px',
                }}
              >
                {photos.map((photo) => (
                  <Tile key={photo.id} photo={photo} onOpen={() => setViewing(photo)} />
                ))}
              </div>
            ))}
        </>
      )}
    </LeftPanel>
  );
}

/**
 * "в сети" / "был(а) 10 мин назад" / nothing at all.
 *
 * The server withholds the timestamp from anyone who switched the setting off,
 * so the empty case here is that setting working rather than a missing value.
 */
function lastSeen(presence: { online: boolean; lastSeenAt: string | null } | undefined, user: User) {
  if (presence?.online) return t('chat.presence.online');
  if (!user.showLastSeen || !presence?.lastSeenAt) return t('chat.presence.offline');

  const minutes = Math.floor((Date.now() - new Date(presence.lastSeenAt).getTime()) / 60_000);
  if (minutes < 5) return t('chat.presence.justNow');
  if (minutes < 60) return t('chat.presence.minutesAgo', { minutes });
  if (minutes < 24 * 60) return t('chat.presence.today');
  return t('chat.presence.longAgo');
}

function Tile({ photo, onOpen }: { photo: Attachment; onOpen: () => void }) {
  const url = useObjectUrl(photo.id);

  return (
    <div
      style={{
        aspectRatio: '1',
        borderRadius: 8,
        cursor: 'pointer',
        background: url
          ? `url('${url}') center/cover`
          : 'rgba(128,128,140,.16)',
      }}
      onClick={onOpen}
      role="img"
      aria-label={photo.name}
    />
  );
}
