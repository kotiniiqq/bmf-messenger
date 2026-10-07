import { createPortal } from 'react-dom';
import { t } from '../i18n/index.js';
import { SHORTCUTS } from '../shortcuts.js';

/** The prototype's `.cheat` overlay, opened with `?`. */
export function CheatSheet({ onClose }: { onClose: () => void }) {
  return createPortal(
    <div className="cheat-ov show" onClick={onClose}>
      <div className="cheat" onClick={(event) => event.stopPropagation()}>
        <h3>{t('cheat.title')}</h3>
        <div className="cheat-sub">{t('cheat.subtitle')}</div>
        <div className="cheat-grid">
          {SHORTCUTS.map((shortcut) => (
            <div className="cheat-r" key={shortcut.id}>
              <span>{t(shortcut.title)}</span>
              <div className="hk-k">
                {shortcut.combo.split('+').map((key) => (
                  <span className="kbd" key={key}>
                    {key}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
