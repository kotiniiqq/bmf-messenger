import { createPortal } from 'react-dom';
import type { User } from '@bmf/shared';
import { t } from '../i18n/index.js';
import { statusById, statusLabel } from '../status.js';
import { Avatar } from './Avatar.js';

/**
 * The prototype's `.drw` — everything that is not a section lives behind the
 * "Меню" button: the profile, contacts, calls, creating a group or a channel,
 * updates and settings.
 */
export type DrawerAction =
  | 'profile'
  | 'contacts'
  | 'calls'
  | 'group'
  | 'channel'
  | 'status'
  | 'updates'
  | 'settings';

export function Drawer({
  user,
  onClose,
  onAction,
}: {
  user: User | null;
  onClose: () => void;
  onAction: (action: DrawerAction) => void;
}) {
  const initial = (user?.displayName || user?.username || '·').trim()[0]?.toUpperCase() ?? '·';
  const preset = user ? statusById(user.statusId) : null;

  const pick = (action: DrawerAction) => () => {
    onClose();
    onAction(action);
  };

  return createPortal(
    <div className="drw-ov show" onClick={onClose}>
      <div className="drw" onClick={(event) => event.stopPropagation()}>
        <div className="drw-head">
          {user ? (
            <div onClick={pick('profile')}>
              <Avatar
                userId={user.id}
                avatarUrl={user.avatarUrl}
                name={user.displayName || user.username}
                className="drw-av"
              />
            </div>
          ) : (
            <div className="drw-av" onClick={pick('profile')}>
              {initial}
            </div>
          )}
          <div className="drw-head-mid">
            <div className="drw-name">{user?.displayName ?? '—'}</div>
            <div className="drw-sub">@{user?.username ?? ''}</div>
            {user && preset && (
              <div className="drw-status" onClick={pick('status')}>
                <span style={{ fontSize: 13, lineHeight: 1 }}>{preset.emoji}</span>
                {statusLabel(user)}
                {user.statusAuto && t('drawer.statusAuto')}
              </div>
            )}
          </div>
        </div>

        <div className="drw-body">
          <div className="drw-item" onClick={pick('profile')}>
            <svg viewBox="0 0 24 24">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            {t('drawer.profile')}
          </div>

          <div className="drw-item" onClick={pick('contacts')}>
            <svg viewBox="0 0 24 24">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            {t('drawer.contacts')}
          </div>

          <div className="drw-item" onClick={pick('calls')}>
            <svg viewBox="0 0 24 24">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.41 2 2 0 0 1 3.6 1.22h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.58a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 15.92z" />
            </svg>
            {t('drawer.calls')}
          </div>

          <div className="drw-sep" />

          <div className="drw-item" onClick={pick('group')}>
            <svg viewBox="0 0 24 24">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <line x1="19" y1="8" x2="19" y2="14" />
              <line x1="22" y1="11" x2="16" y2="11" />
            </svg>
            {t('drawer.newGroup')}
          </div>

          <div className="drw-item" onClick={pick('channel')}>
            <svg viewBox="0 0 24 24">
              <path d="M3 11l18-7-7 18-2.5-7.5z" />
            </svg>
            {t('drawer.newChannel')}
          </div>

          <div className="drw-sep" />

          <div className="drw-item" onClick={pick('updates')}>
            <svg viewBox="0 0 24 24">
              <path d="M21 2v6h-6" />
              <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
              <path d="M3 22v-6h6" />
              <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
            </svg>
            {t('drawer.updates')}
          </div>

          <div className="drw-item" onClick={pick('settings')}>
            <svg viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            {t('drawer.settings')}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
