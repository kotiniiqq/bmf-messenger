import { createPortal } from 'react-dom';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { t } from '../i18n/index.js';
import { GRADS, fmt, trackById } from '../music.js';
import { usePlayer } from '../player.js';
import { IconClose } from './icons.js';
import { toast } from './Toast.js';

/** The prototype's `#npOv` — the pill expanded to fill the window. */
export function NowPlaying({ onClose }: { onClose: () => void }) {
  const trackId = usePlayer((s) => s.trackId);
  const playing = usePlayer((s) => s.playing);
  const position = usePlayer((s) => s.position);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);

  const track = trackById(trackId);
  if (!track) return null;

  const progress = (position / track.seconds) * 100;

  const seek = (event: ReactMouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    usePlayer.getState().seek((event.clientX - rect.left) / rect.width);
  };

  const cover = (
    <svg viewBox="0 0 24 24">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );

  return createPortal(
    <div id="npOv" className="show" onClick={onClose}>
      <button className="np-close" onClick={onClose} title={t('common.close')}>
        <IconClose />
      </button>

      <div className="np" onClick={(event) => event.stopPropagation()}>
        <div className="np-cov" style={{ background: GRADS[track.cover] }}>
          {cover}
        </div>
        <div className="np-title">{t(track.title)}</div>
        <div className="np-artist">
          {t(track.artist)} — {t(track.album)}
        </div>

        <div className="np-prog">
          <span className="mp-time">{fmt(position)}</span>
          <div className="pbar" onClick={seek}>
            <div className="pbar-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="mp-time r">{fmt(track.seconds)}</span>
        </div>

        <div className="np-btns">
          <button
            className={`pb${shuffle ? ' tgl-on' : ''}`}
            title={t('player.shuffle')}
            onClick={() => usePlayer.getState().toggleShuffle()}
          >
            <svg viewBox="0 0 24 24">
              <polyline points="16 3 21 3 21 8" />
              <line x1="4" y1="20" x2="21" y2="3" />
              <polyline points="21 16 21 21 16 21" />
              <line x1="15" y1="15" x2="21" y2="21" />
              <line x1="4" y1="4" x2="9" y2="9" />
            </svg>
          </button>

          <button
            className="pb"
            title={t('player.previous')}
            onClick={() => usePlayer.getState().previous()}
          >
            <svg className="fl" viewBox="0 0 24 24">
              <polygon points="19 20 9 12 19 4 19 20" />
              <rect x="4" y="4" width="3" height="16" />
            </svg>
          </button>

          <button
            className="pb play"
            title={t('player.playPause')}
            onClick={() => usePlayer.getState().toggle()}
          >
            <svg className="fl" viewBox="0 0 24 24">
              {playing ? (
                <>
                  <rect x="5" y="4" width="4.5" height="16" rx="1" />
                  <rect x="14.5" y="4" width="4.5" height="16" rx="1" />
                </>
              ) : (
                <polygon points="6 3 20 12 6 21 6 3" />
              )}
            </svg>
          </button>

          <button
            className="pb"
            title={t('player.next')}
            onClick={() => usePlayer.getState().next()}
          >
            <svg className="fl" viewBox="0 0 24 24">
              <polygon points="5 4 15 12 5 20 5 4" />
              <rect x="17" y="4" width="3" height="16" />
            </svg>
          </button>

          <button
            className={`pb${repeat ? ' tgl-on' : ''}`}
            title={t('player.repeat')}
            onClick={() => usePlayer.getState().toggleRepeat()}
          >
            <svg viewBox="0 0 24 24">
              <polyline points="17 1 21 5 17 9" />
              <path d="M3 11V9a4 4 0 0 1 4-4h14" />
              <polyline points="7 23 3 19 7 15" />
              <path d="M21 13v2a4 4 0 0 1-4 4H3" />
            </svg>
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <button
            className="mr-btn"
            style={{
              background: 'rgba(255,255,255,.12)',
              borderColor: 'rgba(255,255,255,.2)',
              color: '#fff',
            }}
            onClick={() => toast(t('player.toChatStage'))}
          >
            <svg viewBox="0 0 24 24">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
            {t('player.toChat')}
          </button>
        </div>

        <div className="np-path">Music\BMF\{t(track.title).replace(/ /g, '_')}.mp3</div>
      </div>
    </div>,
    document.body,
  );
}
