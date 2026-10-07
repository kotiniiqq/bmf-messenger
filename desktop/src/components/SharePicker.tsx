import { useEffect, useState } from 'react';
import type { ShareCapabilities, ShareSource } from '../../electron/share.js';
import { t } from '../i18n/index.js';

/**
 * What gets shared, and whether the machine's sound goes with it.
 *
 * Both questions are asked here, before anything is captured, because both are
 * answers a person changes their mind about: sharing a whole desktop when they
 * meant one window, or broadcasting whatever was playing to a room of
 * colleagues. Neither is recoverable after the fact.
 *
 * Under Wayland the surface is chosen by the desktop's own portal dialog, so
 * the grid is replaced by a line saying so — the audio question is still ours.
 */

interface Props {
  capabilities: ShareCapabilities;
  sources: ShareSource[];
  /** Null while the sources are still being collected. */
  loading: boolean;
  /** True where a monitor input exists to capture the output from (Linux). */
  monitorAudio: boolean;
  onCancel: () => void;
  onShare: (sourceId: string, audio: boolean) => void;
}

export function SharePicker({
  capabilities,
  sources,
  loading,
  monitorAudio,
  onCancel,
  onShare,
}: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [audio, setAudio] = useState(false);

  const audioAvailable = capabilities.loopbackAudio || monitorAudio;

  // The first screen is the answer most of the time; pre-selecting it means the
  // common case is one click, without hiding that a choice was made.
  useEffect(() => {
    if (selected) return;
    const first = sources.find((source) => source.kind === 'screen') ?? sources[0];
    if (first) setSelected(first.id);
  }, [sources, selected]);

  const chosen = capabilities.portal ? capabilities.portalSource : selected;

  return (
    <div className="share-sheet" onClick={onCancel}>
      <div className="share-card" onClick={(event) => event.stopPropagation()}>
        <div className="share-head">{t('share.title')}</div>

        {capabilities.portal ? (
          <div className="share-portal">
            {t('share.hint')}
          </div>
        ) : (
          <div className="share-grid">
            {loading && <div className="share-empty">{t('share.looking')}</div>}
            {!loading && !sources.length && (
              <div className="share-empty">{t('share.empty')}</div>
            )}

            {sources.map((source) => (
              <button
                key={source.id}
                className={`share-src${selected === source.id ? ' on' : ''}`}
                onClick={() => setSelected(source.id)}
                title={source.name}
              >
                <div className="share-thumb">
                  {source.thumbnail ? (
                    <img src={source.thumbnail} alt="" />
                  ) : (
                    <div className="share-blank" />
                  )}
                </div>
                <div className="share-src-name">
                  {source.kind === 'screen' ? '🖵 ' : ''}
                  {source.name}
                </div>
              </button>
            ))}
          </div>
        )}

        <label className={`share-audio${audioAvailable ? '' : ' off'}`}>
          <input
            type="checkbox"
            checked={audio && audioAvailable}
            disabled={!audioAvailable}
            onChange={(event) => setAudio(event.target.checked)}
          />
          <span>
            {t('share.withSystemAudio')}
            {!audioAvailable && (
              <em className="share-why"> {t('share.noAudioDevice')}</em>
            )}
          </span>
        </label>

        <div className="share-acts">
          <button className="share-btn" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button
            className="share-btn prim"
            disabled={!chosen}
            onClick={() => chosen && onShare(chosen, audio && audioAvailable)}
          >
            {t('share.start')}
          </button>
        </div>
      </div>
    </div>
  );
}
