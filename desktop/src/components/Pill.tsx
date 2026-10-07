import { useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { t } from '../i18n/index.js';
import { GRADS, trackById } from '../music.js';
import { usePlayer } from '../player.js';
import { toast } from './Toast.js';

const PlayIcon = () => <polygon points="6 3 20 12 6 21 6 3" />;
const PauseIcon = () => (
  <>
    <rect x="5" y="4" width="4.5" height="16" rx="1" />
    <rect x="14.5" y="4" width="4.5" height="16" rx="1" />
  </>
);

/**
 * The prototype's `.pill` — the player folded into the title bar. Dragging it
 * sideways changes track, which is why the hints under it exist; the cover spins
 * while something is playing and opens the full player.
 */
export function Pill({ onOpen }: { onOpen: () => void }) {
  const trackId = usePlayer((s) => s.trackId);
  const playing = usePlayer((s) => s.playing);
  const position = usePlayer((s) => s.position);
  const volume = usePlayer((s) => s.volume);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);

  const [drag, setDrag] = useState<{ from: number; delta: number } | null>(null);
  const pillRef = useRef<HTMLDivElement>(null);

  const track = trackById(trackId);
  if (!track) return null;

  const progress = (position / track.seconds) * 100;

  function fractionOf(event: ReactMouseEvent<HTMLDivElement>): number {
    const rect = event.currentTarget.getBoundingClientRect();
    return (event.clientX - rect.left) / rect.width;
  }

  /**
   * Pointer handlers live on window while a drag is in flight, so releasing
   * outside the pill still ends it.
   */
  function startDrag(event: ReactMouseEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest('button, .pill-vbar, .pill-prog, .pill-cov')) return;
    event.preventDefault();

    const from = event.clientX;
    setDrag({ from, delta: 0 });

    const move = (e: MouseEvent) => setDrag({ from, delta: e.clientX - from });
    const up = (e: MouseEvent) => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      setDrag(null);

      const travelled = e.clientX - from;
      if (travelled > 60) usePlayer.getState().next();
      else if (travelled < -60) usePlayer.getState().previous();
    };

    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  const shift = drag ? Math.max(-70, Math.min(70, drag.delta)) : 0;
  const classes = [
    'pill',
    'show',
    playing && 'playing',
    drag && 'dragging',
    drag && drag.delta > 45 && 'hint-r',
    drag && drag.delta < -45 && 'hint-l',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="pill-wrap">
      <div
        ref={pillRef}
        className={classes}
        title={t('player.dragHint')}
        style={drag ? { transform: `translateX(${shift}px)` } : undefined}
        onMouseDown={startDrag}
      >
        <div
          className="pill-cov"
          style={{ background: GRADS[track.cover] }}
          title={t('player.expand')}
          onClick={onOpen}
        />

        <div className="pill-info">
          <div className="pill-t">{t(track.title)}</div>
          <div className="pill-a">{t(track.artist)}</div>
        </div>

        <div className="pill-btns">
          <button
            className="pb2"
            title={t('player.previous')}
            onClick={() => usePlayer.getState().previous()}
          >
            <svg className="fl" viewBox="0 0 24 24">
              <polygon points="19 20 9 12 19 4 19 20" />
              <rect x="4" y="4" width="3" height="16" />
            </svg>
          </button>

          <button
            className="pb2 main"
            title={t('player.playPause')}
            onClick={() => usePlayer.getState().toggle()}
          >
            <svg className="fl" viewBox="0 0 24 24">
              {playing ? <PauseIcon /> : <PlayIcon />}
            </svg>
          </button>

          <button
            className="pb2"
            title={t('player.next')}
            onClick={() => usePlayer.getState().next()}
          >
            <svg className="fl" viewBox="0 0 24 24">
              <polygon points="5 4 15 12 5 20 5 4" />
              <rect x="17" y="4" width="3" height="16" />
            </svg>
          </button>

          <div className="pill-hide">
            <button
              className="pb2"
              title={t('player.shuffle')}
              style={shuffle ? { color: 'var(--acc)' } : undefined}
              onClick={() => {
                usePlayer.getState().toggleShuffle();
                toast(shuffle ? t('player.shuffleOff') : t('player.shuffleOn'));
              }}
            >
              <svg viewBox="0 0 24 24">
                <polyline points="16 3 21 3 21 8" />
                <line x1="4" y1="20" x2="21" y2="3" />
                <polyline points="21 16 21 21 16 21" />
                <line x1="15" y1="15" x2="21" y2="21" />
                <line x1="4" y1="4" x2="9" y2="9" />
              </svg>
            </button>
          </div>

          <div className="pill-hide">
            <button
              className="pb2"
              title={t('player.repeat')}
              style={repeat ? { color: 'var(--acc)' } : undefined}
              onClick={() => {
                usePlayer.getState().toggleRepeat();
                toast(repeat ? t('player.repeatOff') : t('player.repeatOn'));
              }}
            >
              <svg viewBox="0 0 24 24">
                <polyline points="17 1 21 5 17 9" />
                <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                <polyline points="7 23 3 19 7 15" />
                <path d="M21 13v2a4 4 0 0 1-4 4H3" />
              </svg>
            </button>
          </div>
        </div>

        <div className="pill-hide pill-vol">
          <div className="pill-vol-in">
            <svg viewBox="0 0 24 24">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>
            <div
              className="pill-vbar"
              onClick={(event) => {
                const next = fractionOf(event);
                usePlayer.getState().setVolume(next);
                toast(t('player.volume', { value: Math.round(Math.min(1, Math.max(0, next)) * 100) }));
              }}
            >
              <div className="pill-vfill" style={{ width: `${volume * 100}%` }} />
            </div>
          </div>
        </div>

        <div className="pill-prog" onClick={(event) => usePlayer.getState().seek(fractionOf(event))}>
          <div className="pill-pfill" style={{ width: `${progress}%` }} />
        </div>

        <div className="pill-hint l">
          <svg viewBox="0 0 24 24">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {t('player.previous')}
        </div>
        <div className="pill-hint r">
          {t('player.next')}
          <svg viewBox="0 0 24 24">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>
      </div>
    </div>
  );
}
