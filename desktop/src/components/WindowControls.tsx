import { t } from '../i18n/index.js';

/**
 * The prototype's `.wc-wind` — three circles at the right end of the title bar.
 * They exist because the window has no system frame: `frame: false` in the main
 * process hands the whole header to us, buttons included.
 *
 * Red hides to tray rather than quits, which is what the prototype's own tooltip
 * says and what closing the window already does.
 */
export function WindowControls() {
  const shell = window.bmf;

  // In a browser there is no window to minimise, and three dead circles would
  // read as a broken title bar.
  if (!shell) return null;

  return (
    <div className="wc-wind">
      <div className="circ grn" title={t('window.minimise')} onClick={() => shell.minimizeWindow()}>
        <svg viewBox="0 0 10 2">
          <line x1="1" y1="1" x2="9" y2="1" />
        </svg>
      </div>

      <div
        className="circ yel"
        title={t('window.maximise')}
        onClick={() => shell.toggleMaximizeWindow()}
      >
        <svg viewBox="0 0 10 10">
          <polyline points="1,4 1,1 4,1" />
          <polyline points="6,1 9,1 9,4" />
          <polyline points="9,6 9,9 6,9" />
          <polyline points="4,9 1,9 1,6" />
        </svg>
      </div>

      <div className="circ red" title={t('window.tray')} onClick={() => shell.closeWindow()}>
        <svg viewBox="0 0 10 10">
          <line x1="1" y1="1" x2="9" y2="9" />
          <line x1="9" y1="1" x2="1" y2="9" />
        </svg>
      </div>
    </div>
  );
}
