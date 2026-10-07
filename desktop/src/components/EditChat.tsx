import { useRef, useState } from 'react';
import type { ChatListItem } from '@bmf/shared';
import { api } from '../api/client.js';
import { t } from '../i18n/index.js';
import { useObjectUrl } from '../media.js';
import { useApp } from '../store/app.js';
import { LeftPanel } from './LeftPanel.js';
import { toast } from './Toast.js';

/**
 * Editing a group or a channel after it exists — defect #22.
 *
 * The creation wizard could name a room and then never speak of it again: no
 * rename, no description, no picture. This is the wizard's first step, reachable
 * for as long as the chat lives.
 *
 * Only an owner or an admin sees the way in, and the server refuses the request
 * from anyone else regardless (hard rule 3).
 */
export function EditChat({
  chat,
  onClose,
  onBack,
}: {
  chat: ChatListItem;
  onClose: () => void;
  onBack?: () => void;
}) {
  const loadChats = useApp((s) => s.loadChats);

  const [title, setTitle] = useState(chat.title);
  const [description, setDescription] = useState(chat.description);
  const [avatarId, setAvatarId] = useState<string | null>(chat.avatarUrl);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const preview = useObjectUrl(avatarId);

  const isGroup = chat.type === 'group';

  async function pickPicture(file: File | undefined) {
    if (!file) return;

    setBusy(true);
    try {
      // Uploaded now, pointed at on save: an upload nobody attaches is swept up
      // by the orphan job, whereas a chat pointing at nothing is a broken image.
      const uploaded = await api.upload(file);
      setAvatarId(uploaded.id);
    } catch {
      toast(t('editChat.pictureFailed'));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function save() {
    const next = title.trim();
    if (!next) return;

    setBusy(true);
    try {
      await api.updateChat(chat.id, {
        title: next,
        description: description.trim(),
        avatarId,
      });
      await loadChats();
      toast(t('editChat.saved'));
      onClose();
    } catch {
      toast(t('editChat.failed'));
      setBusy(false);
    }
  }

  return (
    <LeftPanel
      title={t(isGroup ? 'editChat.titleGroup' : 'editChat.titleChannel')}
      onClose={onClose}
      onBack={onBack}
      footer={{ label: t('common.save'), enabled: !busy && !!title.trim(), onClick: () => void save() }}
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(event) => void pickPicture(event.target.files?.[0])}
      />

      <div className="wz-top">
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
            value={title}
            placeholder={t(isGroup ? 'createChat.groupName' : 'createChat.channelName')}
            onChange={(event) => setTitle(event.target.value)}
          />
          <textarea
            className="wz-inp"
            value={description}
            placeholder={t('editChat.descriptionPlaceholder')}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
      </div>

      {avatarId && (
        <button className="sp-reset" onClick={() => setAvatarId(null)}>
          {t('editChat.removePicture')}
        </button>
      )}
    </LeftPanel>
  );
}
