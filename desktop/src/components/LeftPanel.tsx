import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../i18n/index.js';
import { IconBack, IconClose } from './icons.js';

/**
 * The prototype's `.lp` panel — the overlay every picker and wizard lives in.
 * Keeping it in one place means a new picker inherits the right head, scroll
 * behaviour and footer instead of growing its own markup.
 *
 * Rendered into `<body>`, where the prototype puts it. That is not tidiness:
 * `.sdb` and `.main` carry `backdrop-filter`, which makes them the containing
 * block for `position: fixed` children, so an overlay left inside one would be
 * trapped in that column instead of covering the window.
 */
export function LeftPanel({
  title,
  onClose,
  onBack,
  footer,
  children,
}: {
  title: string;
  onClose: () => void;
  onBack?: () => void;
  footer?: { label: string; enabled: boolean; onClick: () => void };
  children: ReactNode;
}) {
  return createPortal(
    <div className="lp-ov show" onClick={onClose}>
      <div className="lp" onClick={(event) => event.stopPropagation()}>
        <div className="lp-head">
          {onBack && (
            <button className="sub-back" onClick={onBack} title={t('common.back')}>
              <IconBack />
            </button>
          )}
          <span className="lp-title" style={{ flex: 1 }}>
            {title}
          </span>
          <button className="sp-close" onClick={onClose} title={t('common.close')}>
            <IconClose />
          </button>
        </div>

        <div className="lp-body">{children}</div>

        {footer && (
          <div className="lp-foot">
            <button className="lp-cta" disabled={!footer.enabled} onClick={footer.onClick}>
              {footer.label}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** `.pk-chk` — the round tick the prototype uses for multi-select rows. */
export function PickCheck() {
  return (
    <div className="pk-chk">
      <svg viewBox="0 0 24 24">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </div>
  );
}

/** Deterministic avatar colour, SENDER_COLS from the prototype. */
const COLOURS = ['#7c6cf8', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#8b5cf6'];

export function colourOf(seed: string): string {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return COLOURS[hash % COLOURS.length] as string;
}
