import { useRef, type ReactNode } from 'react';
import { ACCENTS, patchTheme, resetTheme, useTheme, type NavLayout } from '../theme.js';
import { toast } from '../components/Toast.js';
import { IconChevron } from '../components/icons.js';
import { t, type MessageKey } from '../i18n/index.js';

/**
 * `SUBS.custom` from the prototype, in its own order. Every control here writes
 * to the same whitelisted config the app reads at boot — the format and the
 * screen are one thing, which is what spec section 8 asks for.
 */
const LAY_CARDS: { key: NavLayout; title: MessageKey; preview: ReactNode }[] = [
  {
    key: 'bottom',
    title: 'appearance.layoutBottom',
    preview: (
      <>
        <rect className="lp-bar" x="1" y="1" width="82" height="9" rx="6" />
        <rect className="lp-side" x="1" y="10" width="26" height="35" />
        <rect className="lp-nav" x="1" y="45" width="26" height="12" />
        <circle className="lp-dot" cx="7.5" cy="51" r="2" />
        <circle className="lp-dot on" cx="14" cy="51" r="2" />
        <circle className="lp-dot" cx="20.5" cy="51" r="2" />
      </>
    ),
  },
  {
    key: 'rail',
    title: 'appearance.layoutRail',
    preview: (
      <>
        <rect className="lp-bar" x="1" y="1" width="82" height="9" rx="6" />
        <rect className="lp-nav" x="1" y="10" width="13" height="47" />
        <rect className="lp-side" x="14" y="10" width="24" height="47" />
        <circle className="lp-dot on" cx="7.5" cy="19" r="2" />
        <circle className="lp-dot" cx="7.5" cy="27" r="2" />
        <circle className="lp-dot" cx="7.5" cy="35" r="2" />
      </>
    ),
  },
  {
    key: 'top',
    title: 'appearance.layoutTop',
    preview: (
      <>
        <rect className="lp-nav" x="1" y="1" width="82" height="12" rx="6" />
        <rect className="lp-side" x="1" y="13" width="26" height="44" />
        <circle className="lp-dot" cx="35" cy="7" r="2" />
        <circle className="lp-dot on" cx="42" cy="7" r="2" />
        <circle className="lp-dot" cx="49" cy="7" r="2" />
      </>
    ),
  },
];

const LAYOUT_NAMES: Record<NavLayout, MessageKey> = {
  top: 'appearance.layoutTopToast',
  rail: 'appearance.layoutRailToast',
  bottom: 'appearance.layoutBottomToast',
};

/** A picked image never leaves the machine: it is read straight to a data URL. */
function readImage(file: File | undefined, apply: (dataUrl: string) => void): void {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const result = reader.result;
    if (typeof result === 'string') apply(result);
  };
  reader.readAsDataURL(file);
}

export function Customization({ onOpenMarket }: { onOpenMarket: () => void }) {
  const theme = useTheme();
  const wallpaperInput = useRef<HTMLInputElement>(null);
  const chatBgInput = useRef<HTMLInputElement>(null);

  const setImage = (key: 'wallpaper' | 'chatBg', dataUrl: string, name: string) => {
    if (patchTheme({ [key]: dataUrl })) toast(t('appearance.imageSet', { name }));
    else toast(t('appearance.imageTooBig', { name }));
  };

  return (
    <>
      <input
        ref={wallpaperInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        style={{ display: 'none' }}
        onChange={(e) =>
          readImage(e.target.files?.[0], (url) =>
            setImage('wallpaper', url, t('appearance.wallpaperName')),
          )
        }
      />
      <input
        ref={chatBgInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        style={{ display: 'none' }}
        onChange={(e) =>
          readImage(e.target.files?.[0], (url) =>
            setImage('chatBg', url, t('appearance.chatBgName')),
          )
        }
      />

      <div className="sp-slbl" style={{ paddingTop: 0 }}>
        {t('appearance.layout')}
      </div>
      <div className="lay-row">
        {LAY_CARDS.map((card) => (
          <div
            key={card.key}
            className={`lay-card${theme.layout === card.key ? ' sel' : ''}`}
            onClick={() => {
              patchTheme({ layout: card.key });
              toast(t(LAYOUT_NAMES[card.key]));
            }}
          >
            <svg className="lay-prev" viewBox="0 0 84 58">
              <rect className="lp-win" x="1" y="1" width="82" height="56" rx="6" />
              {card.preview}
            </svg>
            <span>{t(card.title)}</span>
          </div>
        ))}
      </div>

      <div className="sp-slbl">{t('appearance.theme')}</div>
      <div className="th-row">
        <div
          className={`tc lt${theme.mode === 'light' ? ' sel' : ''}`}
          onClick={() => {
            patchTheme({ mode: 'light' });
            toast(t('appearance.lightToast'));
          }}
        >
          <span>{t('appearance.light')}</span>
        </div>
        <div
          className={`tc dk-t${theme.mode === 'dark' ? ' sel' : ''}`}
          onClick={() => {
            patchTheme({ mode: 'dark' });
            toast(t('appearance.darkToast'));
          }}
        >
          <span>{t('appearance.dark')}</span>
        </div>
      </div>

      <div className="sp-slbl">{t('appearance.opacity')}</div>
      <div className="ct-sub" style={{ padding: '0 4px 6px' }}>
        {t('appearance.opacityHint')}
      </div>
      <div className="orow">
        <svg viewBox="0 0 24 24" style={{ opacity: 0.35 }}>
          <circle cx="12" cy="12" r="10" />
        </svg>
        <input
          type="range"
          min={30}
          max={100}
          value={Math.round(theme.opacity * 100)}
          onChange={(e) => patchTheme({ opacity: Number(e.target.value) / 100 })}
        />
        <span className="ov">{Math.round(theme.opacity * 100)}%</span>
      </div>

      <div className="sp-slbl">{t('appearance.blur')}</div>
      <div className="orow">
        <svg viewBox="0 0 24 24" style={{ opacity: 0.35 }}>
          <circle cx="12" cy="12" r="4" />
        </svg>
        <input
          type="range"
          min={0}
          max={60}
          value={theme.blur}
          onChange={(e) => patchTheme({ blur: Number(e.target.value) })}
        />
        <span className="ov">{theme.blur}px</span>
      </div>

      <label className="upl-lbl" onClick={() => wallpaperInput.current?.click()}>
        <svg viewBox="0 0 24 24">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
        {t('appearance.ownWallpaper')}
      </label>
      <button
        className="sp-reset"
        onClick={() => {
          patchTheme({ wallpaper: null });
          toast(t('appearance.defaultWallpaper'));
        }}
      >
        {t('appearance.resetWallpaper')}
      </button>

      <div className="sp-slbl">{t('appearance.market')}</div>
      <div className="sp-item" style={{ padding: '9px 6px' }} onClick={onOpenMarket}>
        <div
          className="sp-icon"
          style={{
            background:
              'linear-gradient(135deg,rgba(124,108,248,.2),rgba(6,182,212,.2))',
            color: 'var(--acc)',
          }}
        >
          <svg viewBox="0 0 24 24">
            <path d="M3 9l9-6 9 6v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <path d="M9 21V12h6v9" />
          </svg>
        </div>
        <div className="sp-item-info">
          <div className="sp-item-title">{t('appearance.openMarket')}</div>
          <div className="sp-item-desc">{t('appearance.openMarketSub')}</div>
        </div>
        <div className="sp-chev">
          <IconChevron />
        </div>
      </div>

      <div className="rescue">
        <svg viewBox="0 0 24 24">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <div>
          {t('appearance.rescueBefore')}
          <span className="kbd">Ctrl</span>
          <span className="kbd">Alt</span>
          <span className="kbd">R</span>
          {t('appearance.rescueAfter')}
        </div>
      </div>
      <button className="sp-reset" onClick={() => resetTheme()}>
        {t('appearance.resetNow')}
      </button>

      <div className="sp-slbl">{t('appearance.accent')}</div>
      <div className="acc-row">
        {ACCENTS.map((colour) => (
          <div
            key={colour}
            className={`acc-dot${theme.accent === colour ? ' sel' : ''}`}
            style={{ background: colour }}
            onClick={() => {
              patchTheme({ accent: colour });
              toast(t('appearance.accentToast', { colour }));
            }}
          />
        ))}
      </div>

      <div className="sp-slbl">{t('appearance.sections')}</div>
      <div className="sub-row">
        <div>
          <div className="sub-row-label">{t('appearance.mail')}</div>
          <div className="sub-row-desc">{t('appearance.mailHint')}</div>
        </div>
        <div
          className={`tog${theme.sections.mail ? ' on' : ''}`}
          onClick={() => {
            const next = !theme.sections.mail;
            patchTheme({ sections: { ...theme.sections, mail: next } });
            toast(
              t('appearance.sectionToast', {
                section: t('appearance.mail'),
                state: next ? t('appearance.shown') : t('appearance.hidden'),
              }),
            );
          }}
        />
      </div>
      <div className="sub-row">
        <div>
          <div className="sub-row-label">{t('appearance.music')}</div>
          <div className="sub-row-desc">{t('appearance.musicHint')}</div>
        </div>
        <div
          className={`tog${theme.sections.music ? ' on' : ''}`}
          onClick={() => {
            const next = !theme.sections.music;
            patchTheme({ sections: { ...theme.sections, music: next } });
            toast(
              t('appearance.sectionToast', {
                section: t('appearance.music'),
                state: next ? t('appearance.shown') : t('appearance.hidden'),
              }),
            );
          }}
        />
      </div>

      <div className="sp-slbl">{t('appearance.chatBg')}</div>
      <div
        className={`chatbg-prev${theme.chatBg ? ' has-bg' : ''}`}
        style={theme.chatBg ? { backgroundImage: `url('${theme.chatBg}')` } : undefined}
        onClick={() => chatBgInput.current?.click()}
      >
        {theme.chatBg ? '' : t('appearance.chatBgPick')}
      </div>
      <button
        className="sp-reset"
        onClick={() => {
          patchTheme({ chatBg: null });
          toast(t('appearance.chatBgRemoved'));
        }}
      >
        {t('appearance.chatBgRemove')}
      </button>
    </>
  );
}
