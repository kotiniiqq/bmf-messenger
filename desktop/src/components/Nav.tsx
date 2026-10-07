import type { ReactNode } from 'react';
import { t, type MessageKey } from '../i18n/index.js';
import { IconChats, IconMail, IconMenu, IconMusic } from './icons.js';

/**
 * The section switcher, rendered into all three places the prototype offers:
 * `.dock` in the title bar, `.rail` down the left edge, `.sdb-dock` under the
 * sidebar. Which one is visible is decided by `#app.nav-*` in prototype.css, so
 * every slot is always in the tree — the layout switch stays a CSS change.
 */
export type Section = 'chats' | 'mail' | 'music' | 'notes';
export type NavPlace = 'top' | 'rail' | 'bottom';

interface NavEntry {
  key: Section;
  title: MessageKey;
  icon: ReactNode;
}

const ENTRIES: NavEntry[] = [
  { key: 'chats', title: 'nav.chats', icon: <IconChats /> },
  { key: 'mail', title: 'nav.mail', icon: <IconMail /> },
  { key: 'music', title: 'nav.music', icon: <IconMusic /> },
  {
    key: 'notes',
    title: 'nav.notes',
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="8" y1="13" x2="16" y2="13" />
        <line x1="8" y1="17" x2="13" y2="17" />
      </svg>
    ),
  },
];

export interface NavProps {
  place: NavPlace;
  section: Section;
  onSelect: (section: Section) => void;
  onMenu: () => void;
  onProfile: () => void;
  /** Sections the user has switched off on the appearance screen. */
  visible: Record<Exclude<Section, 'chats'>, boolean>;
  badges: Partial<Record<Section, number>>;
  /** First letter of the display name, the way the prototype fills `.rl-av`. */
  initial: string;
}

export function Nav({
  place,
  section,
  onSelect,
  onMenu,
  onProfile,
  visible,
  badges,
  initial,
}: NavProps) {
  const menu = (
    <button className="rl-btn" onClick={onMenu} title={t('nav.menu')}>
      <IconMenu />
      {place === 'top' && <b>{t('nav.menu')}</b>}
    </button>
  );

  const buttons = ENTRIES.filter((entry) => entry.key === 'chats' || visible[entry.key]).map(
    (entry) => {
      const badge = badges[entry.key] ?? 0;
      return (
        <button
          key={entry.key}
          className={`rl-btn${section === entry.key ? ' on' : ''}`}
          data-nav={entry.key}
          onClick={() => onSelect(entry.key)}
          title={t(entry.title)}
        >
          {entry.icon}
          {place === 'top' && <b>{t(entry.title)}</b>}
          {badge > 0 && <span className="rl-badge">{badge > 99 ? '99+' : badge}</span>}
        </button>
      );
    },
  );

  const avatar = (
    <div className="rl-av" data-av onClick={onProfile} title={t('nav.profile')}>
      {initial}
    </div>
  );

  if (place === 'top') {
    return (
      <>
        <div className="dk-group">
          {menu}
          <div className="dk-div" />
          {buttons}
        </div>
        <div className="dk-group" style={{ padding: 3 }}>
          {avatar}
        </div>
      </>
    );
  }

  if (place === 'rail') {
    return (
      <>
        {menu}
        {buttons}
        <div className="rl-sep" />
        {avatar}
      </>
    );
  }

  return (
    <>
      {menu}
      {buttons}
      {avatar}
    </>
  );
}
