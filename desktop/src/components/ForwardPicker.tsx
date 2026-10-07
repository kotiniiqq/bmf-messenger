import { useState } from 'react';
import { t } from '../i18n/index.js';
import { useApp } from '../store/app.js';
import { LeftPanel, PickCheck, colourOf } from './LeftPanel.js';

/**
 * Picks destination chats for a message being forwarded — the prototype's
 * `lpMode === 'forward'`: `.pk-row` rows with a tick, and the count on the CTA.
 */
export function ForwardPicker({
  messageId,
  onClose,
}: {
  messageId: string;
  onClose: () => void;
}) {
  const chats = useApp((s) => s.chats);
  const forward = useApp((s) => s.forward);
  const activeChatId = useApp((s) => s.activeChatId);

  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);

  const toggle = (chatId: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (!next.delete(chatId)) next.add(chatId);
      return next;
    });

  async function send() {
    setBusy(true);
    try {
      // Sequential on purpose: each send is an idempotent write of its own, and
      // firing them together would race the chat-list refresh each one triggers.
      for (const chatId of picked) await forward(messageId, chatId);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <LeftPanel
      title={t('forward.title')}
      onClose={onClose}
      footer={{
        label: picked.size
          ? t('forward.actionCount', { count: picked.size })
          : t('forward.action'),
        enabled: picked.size > 0 && !busy,
        onClick: () => void send(),
      }}
    >
      {chats.map((chat) => (
        <div
          key={chat.id}
          className={`pk-row${picked.has(chat.id) ? ' sel' : ''}`}
          onClick={() => toggle(chat.id)}
        >
          <PickCheck />
          <div className="av" style={{ background: colourOf(chat.id) }}>
            {(chat.title || t('forward.chatFallback')).slice(0, 2).toUpperCase()}
          </div>
          <div className="pk-mid">
            <div className="pk-name">{chat.title || t('forward.chatFallback')}</div>
            <div className="pk-sub">
              {chat.id === activeChatId
                ? t('forward.currentChat')
                : chat.type === 'dm'
                  ? t('forward.dm')
                  : t('forward.group')}
            </div>
          </div>
        </div>
      ))}
    </LeftPanel>
  );
}
