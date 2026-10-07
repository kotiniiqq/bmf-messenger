import { useEffect, useState } from 'react';
import type { ShareBarState } from '../../electron/share.js';
import { IconClose } from '../components/icons.js';
import { t } from '../i18n/index.js';

/**
 * The controls that float over whatever is being demonstrated.
 *
 * While a screen is shared the call window is behind the thing being shown, so
 * the spec asks for a compact block that follows the person around instead. It
 * owns nothing: every button is a message to the call window, and everything it
 * draws came back from there. That is what keeps the two from disagreeing about
 * whether the microphone is on.
 *
 * The block is dragged by its own body — `-webkit-app-region: drag` on the
 * frame, with each button opting back out.
 */
export function ShareBar() {
  const [state, setState] = useState<ShareBarState>({ micOn: true, elapsed: '00:00' });
  const shell = window.bmf;

  useEffect(() => shell?.onShareState(setState), [shell]);

  return (
    <div className="sbar">
      <div className="sbar-live">
        <span className="sbar-dot" />
        {state.elapsed}
      </div>

      <button
        className={`sbar-btn${state.micOn ? '' : ' off'}`}
        onClick={() => shell?.shareCommand('mic')}
        title={state.micOn ? t('call.micOff') : t('call.micOn')}
      >
        <svg viewBox="0 0 24 24">
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path d="M5 10a7 7 0 0 0 14 0" />
          <line x1="12" y1="17" x2="12" y2="22" />
        </svg>
      </button>

      <button
        className="sbar-btn stop"
        onClick={() => shell?.shareCommand('stop-share')}
        title={t('call.stopShare')}
      >
        <svg viewBox="0 0 24 24">
          <rect x="6" y="6" width="12" height="12" rx="2" />
        </svg>
      </button>

      <button
        className="sbar-btn end"
        onClick={() => shell?.shareCommand('hangup')}
        title={t('call.hangUp')}
      >
        <IconClose />
      </button>
    </div>
  );
}
