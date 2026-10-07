import { plural, t } from '../i18n/index.js';
import { GRADS, PLAYLISTS, fmt, titleOf, tracksOf, type MusicList } from '../music.js';
import { usePlayer } from '../player.js';

/**
 * The prototype's music section (`#sbMusic` and `#musicView`) on mock tracks.
 * The player state is shared with the pill in the title bar.
 */
export type { MusicList };

/** `#sbMusic`: the source folder, the scan button, library and playlists. */
export function MusicSidebar({
  list,
  onList,
}: {
  list: MusicList;
  onList: (list: MusicList) => void;
}) {
  return (
    <>
      <div className="mu-src">
        <div className="mu-src-lbl">{t('music.source')}</div>
        <div className="mu-src-path">
          Music\<b>BMF</b>\
        </div>
      </div>

      <button className="scan-btn" disabled title={t('music.stage5')}>
        <svg viewBox="0 0 24 24">
          <polyline points="23 4 23 10 17 10" />
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        </svg>
        <span>{t('music.scan')}</span>
      </button>

      <div className="sb-div" />
      <div className="sb-title">{t('music.library')}</div>

      <div>
        <div className={`mf-item${list === 'all' ? ' on' : ''}`} onClick={() => onList('all')}>
          <svg viewBox="0 0 24 24">
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
          {t('music.allTracks')}
        </div>
        <div className={`mf-item${list === 'fav' ? ' on' : ''}`} onClick={() => onList('fav')}>
          <svg viewBox="0 0 24 24">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          {t('music.favourites')}
        </div>
      </div>

      <div className="sb-title">{t('music.playlists')}</div>

      <div className="sb-scroll">
        {PLAYLISTS.map((playlist, index) => {
          const id = `pl${index}` as MusicList;
          return (
            <div
              key={playlist.name}
              className={`mf-item${list === id ? ' on' : ''}`}
              onClick={() => onList(id)}
            >
              <svg viewBox="0 0 24 24">
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" />
                <line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
              {t(playlist.name)}
              <span className="mf-count">{playlist.ids.length}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

/** `#musicView`: the header block and the track list. */
export function MusicView({ list }: { list: MusicList }) {
  const currentId = usePlayer((s) => s.trackId);
  const playing = usePlayer((s) => s.playing);

  const tracks = tracksOf(list);
  const ids = tracks.map((track) => track.id);
  const total = tracks.reduce((sum, track) => sum + track.seconds, 0);

  return (
    <div id="musicView" style={{ display: 'flex' }}>
      <div className="mu-head">
        <div className="mu-hero">
          <svg viewBox="0 0 24 24">
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
        </div>
        <div className="mu-h-info">
          <div className="mu-h-lbl">
            {list.startsWith('pl') ? t('music.playlist') : t('music.folder')}
          </div>
          <div className="mu-h-title">{titleOf(list)}</div>
          <div className="mu-h-sub">
            {t('music.summary', {
              count: tracks.length,
              word: plural(
                tracks.length,
                t('music.trackWord.one'),
                t('music.trackWord.few'),
                t('music.trackWord.many'),
              ),
              minutes: Math.round(total / 60),
            })}
          </div>
        </div>
        <button className="mu-play-all" onClick={() => usePlayer.getState().playList(ids)}>
          <svg viewBox="0 0 24 24">
            <polygon points="6 3 20 12 6 21 6 3" />
          </svg>
          {t('music.listen')}
        </button>
      </div>

      <div className="tr-list">
        {tracks.map((track, index) => {
          const current = currentId === track.id;
          return (
            <div
              key={track.id}
              className={`tr${current ? ' on' : ''}${current && playing ? ' playing' : ''}`}
              onClick={() => usePlayer.getState().play(track.id, ids)}
            >
              <div className="tr-n">
                <span>{index + 1}</span>
                <span className="tr-pl">
                  <svg viewBox="0 0 24 24">
                    <polygon points="6 3 20 12 6 21 6 3" />
                  </svg>
                </span>
                <span className="eq">
                  <i />
                  <i />
                  <i />
                </span>
              </div>
              <div className="tr-cov" style={{ background: GRADS[track.cover] }}>
                <svg viewBox="0 0 24 24">
                  <path d="M9 18V5l12-2v13" />
                  <circle cx="6" cy="18" r="3" />
                  <circle cx="18" cy="16" r="3" />
                </svg>
              </div>
              <div className="tr-mid">
                <div className="tr-title">{t(track.title)}</div>
                <div className="tr-artist">{t(track.artist)}</div>
              </div>
              <div className="tr-al">{t(track.album)}</div>
              <div className="tr-d">{fmt(track.seconds)}</div>
              <button className="tr-fav" disabled title={t('music.stage5')}>
                <svg viewBox="0 0 24 24">
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
              </button>
              <button
                className={`tr-fav${track.favourite ? ' fav' : ''}`}
                disabled
                title={t('music.stage5')}
              >
                <svg viewBox="0 0 24 24">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
