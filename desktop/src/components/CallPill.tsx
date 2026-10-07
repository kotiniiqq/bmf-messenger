import { useEffect, useState } from 'react';
import type { Call } from '@bmf/shared';
import { api } from '../api/client.js';
import { t } from '../i18n/index.js';

/**
 * The call, folded into the title bar next to the player.
 *
 * It appears when the call window is closed while the call is still running —
 * the same shape as the music pill, because it is the same idea: something is
 * happening, you are not looking at it, and you want it one click away.
 */
function elapsedOf(startedAt: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function CallPill({ call, onOpen }: { call: Call; onOpen: () => void }) {
  const [elapsed, setElapsed] = useState(elapsedOf(call.startedAt));

  useEffect(() => {
    const timer = window.setInterval(() => setElapsed(elapsedOf(call.startedAt)), 1000);
    return () => window.clearInterval(timer);
  }, [call.startedAt]);

  return (
    <div className="pill show call-pill" title={t('call.returnTo')}>
      <div className="pill-cov call-pill-cov" onClick={onOpen} />

      <div className="pill-info" onClick={onOpen}>
        <div className="pill-t">{t('call.ongoing')}</div>
        <div className="pill-a">{elapsed}</div>
      </div>

      <div className="pill-btns">
        <button className="pb2" onClick={onOpen} title={t('call.expand')}>
          <svg viewBox="0 0 24 24">
            <polyline points="15 3 21 3 21 9" />
            <polyline points="9 21 3 21 3 15" />
            <line x1="21" y1="3" x2="14" y2="10" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        </button>

        <button
          className="pb2 call-pill-end"
          onClick={() => void api.leaveCall(call.id)}
          title={t('call.hangUp')}
        >
          <svg viewBox="0 0 24 24">
            <line x1="5" y1="5" x2="19" y2="19" />
            <line x1="19" y1="5" x2="5" y2="19" />
          </svg>
        </button>
      </div>
    </div>
  );
}
