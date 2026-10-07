import { useState } from 'react';
import { t } from '../i18n/index.js';
import { ContextMenu, type MenuAction } from './ContextMenu.js';

/**
 * The prototype's message context menu: the same `.ctx` box every menu uses,
 * with the quick reactions on top. `＋` unfolds the rest.
 */
const QUICK = ['👍', '❤️', '🔥', '😂'];

const ALL = [
  '👍', '❤️', '🔥', '😂', '🥰', '😮', '😢', '👏', '🎉', '🤔', '😎', '🙏',
  '💯', '✅', '👀', '😍', '🤝', '⚡', '🌟', '🚀', '☕', '🍕', '😴', '🤯',
  '😅', '🙌', '💡', '📌', '❄️', '🎧', '🐈', '🎯',
];

export type { MenuAction } from './ContextMenu.js';

export function MessageMenu({
  at,
  actions,
  onReact,
  onClose,
}: {
  at: { x: number; y: number };
  actions: MenuAction[];
  onReact: (emoji: string) => void;
  onClose: () => void;
}) {
  const [showAll, setShowAll] = useState(false);

  return (
    <ContextMenu
      at={at}
      actions={actions}
      onClose={onClose}
      header={
        <>
          <div className="rx-row">
            {QUICK.map((emoji) => (
              <button key={emoji} className="rx-btn" title={emoji} onClick={() => onReact(emoji)}>
                {emoji}
              </button>
            ))}
            <button
              className="rx-btn rx-more"
              title={t('messageMenu.moreReactions')}
              onClick={() => setShowAll((open) => !open)}
            >
              ＋
            </button>
          </div>

          <div className={`rx-all${showAll ? ' show' : ''}`}>
            {ALL.map((emoji) => (
              <button key={emoji} className="rx-btn" onClick={() => onReact(emoji)}>
                {emoji}
              </button>
            ))}
          </div>
        </>
      }
    />
  );
}
