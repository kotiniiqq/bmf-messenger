import { useEffect, useState } from 'react';
import type { CallHistoryEntry } from '@bmf/shared';
import { api } from '../api/client.js';
import { t, type MessageKey } from '../i18n/index.js';
import { LeftPanel, colourOf } from './LeftPanel.js';

/**
 * The prototype's `lpMode === 'calls'`, on the real thing.
 *
 * Direction and "missed" are decided by the server — who started the call and
 * whether anybody else ever joined it are facts about `call_participants`, and
 * a client that worked them out itself would disagree with the other client in
 * the same call.
 */

const ARROWS: Record<string, JSX.Element> = {
  in: (
    <>
      <polyline points="16 2 16 8 22 8" />
      <line x1="23" y1="1" x2="16" y2="8" />
    </>
  ),
  out: (
    <>
      <polyline points="23 7 23 1 17 1" />
      <line x1="16" y1="8" x2="23" y2="1" />
    </>
  ),
  miss: (
    <>
      <line x1="23" y1="1" x2="17" y2="7" />
      <line x1="17" y1="1" x2="23" y2="7" />
    </>
  ),
};

const LABELS: Record<string, MessageKey> = {
  in: 'callHistory.in',
  out: 'callHistory.out',
  miss: 'callHistory.missed',
};

/** Today and yesterday by name; anything older by date, without the year. */
function whenOf(iso: string): string {
  const at = new Date(iso);
  const time = at.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const days = Math.floor((midnight.getTime() - at.getTime()) / 86_400_000);

  if (days < 0) return t('callHistory.today', { time });
  if (days < 1) return t('callHistory.yesterday', { time });
  return at.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

function lengthOf(seconds: number | null): string {
  if (seconds === null || seconds <= 0) return '';
  const mm = Math.floor(seconds / 60);
  const ss = String(seconds % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export function Calls({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<CallHistoryEntry[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => {
    let cancelled = false;

    void api
      .callHistory()
      .then((page) => {
        if (cancelled) return;
        setItems(page.items);
        setState('ready');
      })
      .catch(() => {
        if (!cancelled) setState('failed');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <LeftPanel title={t('callHistory.title')} onClose={onClose}>
      {state === 'loading' && (
        <div className="ct-sub" style={{ padding: '0 4px 10px' }}>
          {t('callHistory.loading')}
        </div>
      )}

      {state === 'failed' && (
        <div className="ct-sub" style={{ padding: '0 4px 10px' }}>
          {t('callHistory.failed')}
        </div>
      )}

      {state === 'ready' && !items.length && (
        <div className="ct-sub" style={{ padding: '0 4px 10px' }}>
          {t('callHistory.empty')}
        </div>
      )}

      {items.map((call) => {
        const direction = call.missed && call.direction === 'in' ? 'miss' : call.direction;
        const length = lengthOf(call.durationSeconds);

        return (
          <div className="ct-row" key={call.id}>
            <div className="av" style={{ background: colourOf(call.title) }}>
              {call.title[0]}
            </div>
            <div className="ct-mid">
              <div
                className="ct-name"
                style={direction === 'miss' ? { color: '#ff5f57' } : undefined}
              >
                {call.title}
              </div>
              <div className="ct-sub">
                {t(LABELS[direction] ?? 'callHistory.in')}
                {call.kind === 'video' && t('callHistory.videoSuffix')} · {whenOf(call.startedAt)}
                {length && ` · ${length}`}
              </div>
            </div>
            <div className={`call-ico call-${direction}`}>
              <svg viewBox="0 0 24 24">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.41 2 2 0 0 1 3.6 1.22h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.58a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 15.92z" />
                {ARROWS[direction]}
              </svg>
            </div>
          </div>
        );
      })}
    </LeftPanel>
  );
}
