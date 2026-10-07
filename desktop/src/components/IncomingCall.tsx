import { createPortal } from 'react-dom';
import type { Call } from '@bmf/shared';
import { api } from '../api/client.js';
import { t } from '../i18n/index.js';
import { useApp } from '../store/app.js';

/**
 * A ring, as a card in the middle of the window.
 *
 * Deliberately hard to miss: a call has a minute before the server marks it
 * missed, so a subtle strip somewhere is not enough. Answering opens the call
 * window; declining ends the call with a reason the other side can see.
 */
export function IncomingCall({
  call,
  onAnswer,
  onDismiss,
}: {
  call: Call;
  onAnswer: () => void;
  onDismiss: () => void;
}) {
  const chats = useApp((s) => s.chats);
  const chat = chats.find((c) => c.id === call.chatId);
  const title = chat?.title || t('call.incoming');

  async function decline() {
    onDismiss();
    await api.endCall(call.id, 'declined').catch(() => undefined);
  }

  return createPortal(
    <div className="sov show">
      <div className="call-in-card" onClick={(event) => event.stopPropagation()}>
        <div className="call-in-av">{title.slice(0, 2).toUpperCase()}</div>
        <div className="call-in-name">{title}</div>
        <div className="call-in-sub">
          {call.kind === 'video' ? t('call.video') : t('call.audio')}
          {t('call.incomingSuffix')}
        </div>

        <div className="call-in-acts">
          <button
          className="call-in-btn decline"
          onClick={() => void decline()}
          title={t('call.decline')}
        >
            <svg viewBox="0 0 24 24">
              <line x1="5" y1="5" x2="19" y2="19" />
              <line x1="19" y1="5" x2="5" y2="19" />
            </svg>
          </button>

          <button className="call-in-btn accept" onClick={onAnswer} title={t('call.answer')}>
            <svg viewBox="0 0 24 24">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
