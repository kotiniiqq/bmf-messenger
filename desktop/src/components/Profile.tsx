import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { User } from '@bmf/shared';
import { ApiError, api } from '../api/client.js';
import { t } from '../i18n/index.js';
import { useApp } from '../store/app.js';
import { statusById, statusLabel } from '../status.js';
import { Avatar } from './Avatar.js';
import { IconClose } from './icons.js';
import { toast } from './Toast.js';

/**
 * The prototype's `#pov` — everything about the account in one list. Rows whose
 * backing does not exist yet say when it will, instead of opening an editor
 * that cannot save.
 */
export function Profile({
  user,
  onClose,
  onEditStatus,
}: {
  user: User;
  onClose: () => void;
  onEditStatus: () => void;
}) {
  const setUser = useApp((s) => s.setUser);
  const signOut = useApp((s) => s.signOut);

  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(user.displayName);
  const [editingHandle, setEditingHandle] = useState(false);
  const [handle, setHandle] = useState(user.username);
  const [busy, setBusy] = useState(false);
  const avatarRef = useRef<HTMLInputElement>(null);
  const preset = statusById(user.statusId);

  async function saveName() {
    const next = name.trim();
    if (!next || next === user.displayName) {
      setEditingName(false);
      return;
    }

    try {
      setUser(await api.updateMe({ displayName: next }));
      toast(t('profile.nameSaved'));
    } catch {
      toast(t('profile.nameFailed'));
    } finally {
      setEditingName(false);
    }
  }

  async function saveHandle() {
    const next = handle.trim().toLowerCase();
    if (!next || next === user.username) {
      setEditingHandle(false);
      setHandle(user.username);
      return;
    }

    try {
      setUser(await api.updateMe({ username: next }));
      toast(t('profile.usernameSaved'));
      setEditingHandle(false);
    } catch (error) {
      // 409 is the one worth naming: everything else is a bad handle or a dead
      // connection, and "try another one" would be wrong advice for those.
      const taken = error instanceof ApiError && error.status === 409;
      toast(t(taken ? 'profile.usernameTaken' : 'profile.usernameFailed'));
      setHandle(user.username);
    }
  }

  async function pickAvatar(file: File | undefined) {
    if (!file || busy) return;

    setBusy(true);
    try {
      setUser(await api.setAvatar(file));
      toast(t('profile.avatarSaved'));
    } catch {
      toast(t('profile.avatarFailed'));
    } finally {
      setBusy(false);
      if (avatarRef.current) avatarRef.current.value = '';
    }
  }

  async function toggleLastSeen() {
    try {
      setUser(await api.updateMe({ showLastSeen: !user.showLastSeen }));
      toast(t('profile.lastSeenSaved'));
    } catch {
      toast(t('profile.nameFailed'));
    }
  }

  async function dropAvatar() {
    if (busy) return;

    setBusy(true);
    try {
      setUser(await api.clearAvatar());
      toast(t('profile.avatarCleared'));
    } catch {
      toast(t('profile.avatarFailed'));
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div className="sov show" onClick={onClose}>
      <div className="sp" onClick={(event) => event.stopPropagation()}>
        <div className="sp-close-row">
          <button className="sp-close" onClick={onClose} title={t('common.close')}>
            <IconClose />
          </button>
        </div>

        <div className="sp-profile">
          <input
            ref={avatarRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(event) => void pickAvatar(event.target.files?.[0])}
          />
          <div
            className="sp-av-wrap"
            title={t('profile.avatarChange')}
            onClick={() => avatarRef.current?.click()}
          >
            <Avatar
              userId={user.id}
              avatarUrl={user.avatarUrl}
              name={user.displayName || user.username}
              className="sp-av"
            />
            <div className="sp-av-plus">+</div>
          </div>
          <div className="sp-name">{user.displayName}</div>
          <div className="sp-uname">@{user.username}</div>
          <div className="drw-status" onClick={onEditStatus}>
            <span style={{ fontSize: 13, lineHeight: 1 }}>{preset.emoji}</span>
            {statusLabel(user)}
          </div>
        </div>

        <div className="sp-hdiv" />

        <div className="sp-body">
          <div className="sp-slbl">{t('profile.heading')}</div>

          <div className="pf-rows">
            <div className="sub-row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="sub-row-label">{t('profile.name')}</div>
                {editingName ? (
                  <input
                    className="wz-inp"
                    autoFocus
                    value={name}
                    style={{ marginTop: 4 }}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && void saveName()}
                  />
                ) : (
                  <div className="sub-row-desc">{user.displayName}</div>
                )}
              </div>
              <button
                className="sub-btn"
                onClick={() => (editingName ? void saveName() : setEditingName(true))}
              >
                {editingName ? t('common.save') : t('common.edit')}
              </button>
            </div>

            <div className="sub-row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="sub-row-label">{t('profile.username')}</div>
                {editingHandle ? (
                  <input
                    className="wz-inp"
                    autoFocus
                    value={handle}
                    style={{ marginTop: 4 }}
                    onChange={(event) => setHandle(event.target.value.toLowerCase())}
                    onKeyDown={(event) => event.key === 'Enter' && void saveHandle()}
                  />
                ) : (
                  <div className="sub-row-desc">@{user.username}</div>
                )}
              </div>
              <button
                className="sub-btn"
                onClick={() => (editingHandle ? void saveHandle() : setEditingHandle(true))}
              >
                {editingHandle ? t('common.save') : t('common.edit')}
              </button>
            </div>

            {user.avatarUrl && (
              <div className="sub-row">
                <div>
                  <div className="sub-row-label">{t('profile.avatar')}</div>
                  <div className="sub-row-desc">{t('profile.avatarSet')}</div>
                </div>
                <button className="sub-btn" disabled={busy} onClick={() => void dropAvatar()}>
                  {t('common.remove')}
                </button>
              </div>
            )}

            <div className="sub-row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="sub-row-label">{t('profile.lastSeenPrivacy')}</div>
                <div className="sub-row-desc">{t('profile.lastSeenPrivacyHint')}</div>
              </div>
              <div
                className={`tog${user.showLastSeen ? ' on' : ''}`}
                onClick={() => void toggleLastSeen()}
              />
            </div>

            <div className="sub-row">
              <div>
                <div className="sub-row-label">{t('profile.status')}</div>
                <div className="sub-row-desc">{statusLabel(user)}</div>
              </div>
              <button className="sub-btn" onClick={onEditStatus}>
                {t('common.edit')}
              </button>
            </div>

            <div className="sub-row">
              <div>
                <div className="sub-row-label">{t('profile.mail')}</div>
                <div className="sub-row-desc">{t('profile.mailStage')}</div>
              </div>
              <button className="sub-btn" disabled title={t('profile.stage3')}>
                {t('common.edit')}
              </button>
            </div>

            <div className="sub-row">
              <div>
                <div className="sub-row-label">{t('profile.password')}</div>
                <div className="sub-row-desc">{t('profile.passwordWhere')}</div>
              </div>
            </div>
          </div>

          <div className="sp-div" />
          <button className="sp-reset" onClick={() => void signOut()}>
            {t('profile.signOut')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
