import { useState } from 'react';
import type { ChatListItem } from '@bmf/shared';
import { t } from '../i18n/index.js';
import { useApp } from '../store/app.js';
import { LeftPanel } from './LeftPanel.js';
import { toast } from './Toast.js';

/**
 * Confirms deleting a chat, and says which of the two things it will do.
 *
 * There is no confirmation dialog anywhere in the prototype, so this reuses the
 * `.lp` panel every wizard already uses rather than inventing one. It earns its
 * place: clearing a direct chat cannot be undone from anywhere, and a menu item
 * one slip away from that needs a sentence in between.
 */
export function DeleteChat({ chat, onClose }: { chat: ChatListItem; onClose: () => void }) {
  const removeChat = useApp((s) => s.removeChat);
  const [busy, setBusy] = useState(false);

  const leaving = chat.type === 'group' || chat.type === 'channel';

  return (
    <LeftPanel
      title={t('chat.delete.title')}
      onClose={onClose}
      footer={{
        label: t(leaving ? 'chat.delete.confirmLeave' : 'chat.delete.confirmClear'),
        enabled: !busy,
        onClick: () => {
          setBusy(true);
          void removeChat(chat.id)
            .then(() => {
              toast(t(leaving ? 'chat.delete.left' : 'chat.delete.cleared'));
              onClose();
            })
            .catch(() => {
              setBusy(false);
              toast(t('chat.delete.failed'));
            });
        },
      }}
    >
      <div className="ct-sub" style={{ padding: '12px 4px', lineHeight: 1.6 }}>
        {t(leaving ? 'chat.delete.explainLeave' : 'chat.delete.explainClear', {
          title: chat.title || t('chat.dmFallback'),
        })}
      </div>
    </LeftPanel>
  );
}
