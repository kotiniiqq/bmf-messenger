import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../i18n/index.js';
import { onThemeReset } from '../theme.js';
import { IconClose } from './icons.js';

/**
 * The prototype's `.reset-banner`. Ctrl+Alt+R is deliberately silent about what
 * it did otherwise: someone who pressed it because the interface became
 * unreadable needs to see that it worked.
 */
export function ResetBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let timer = 0;

    const stop = onThemeReset(() => {
      setVisible(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setVisible(false), 5000);
    });

    return () => {
      window.clearTimeout(timer);
      stop();
    };
  }, []);

  return createPortal(
    <div className={`reset-banner${visible ? ' show' : ''}`}>
      <svg viewBox="0 0 24 24">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <polyline points="9 12 11 14 15 10" />
      </svg>
      <div>
        <b>{t('resetBanner.title')}</b>
        <span>{t('resetBanner.text')}</span>
      </div>
      <button className="ib" onClick={() => setVisible(false)} title={t('common.hide')}>
        <IconClose />
      </button>
    </div>,
    document.body,
  );
}
