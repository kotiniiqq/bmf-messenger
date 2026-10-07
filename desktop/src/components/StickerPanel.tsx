import { useEffect, useRef, useState } from 'react';
import { t, type MessageKey } from '../i18n/index.js';

/**
 * The prototype's `.stk-panel` — emoji, sticker packs and GIFs above the input
 * row. Packs are local: the store behind them is stage 5.
 */
const EMOJI = [
  '👍', '❤️', '🔥', '😂', '🥰', '😮', '😢', '👏', '🎉', '🤔', '😎', '🙏',
  '💯', '✅', '👀', '😍', '🤝', '⚡', '🌟', '🚀', '☕', '🍕', '😴', '🤯',
  '😅', '🙌', '💡', '📌', '❄️', '🎧', '🐈', '🎯', '😀', '🙂', '😉', '😌',
  '🤩', '😘', '🤗', '🤨', '😐', '🙄', '🥳', '😤', '🥺', '😱', '✌️', '👌',
];

const PACKS = [
  {
    id: 'classic',
    icon: '😺',
    title: 'stickers.pack.classic' as MessageKey,
    items: ['😺', '😸', '😹', '😻', '😼', '🙀'],
  },
  {
    id: 'work',
    icon: '💼',
    title: 'stickers.pack.work' as MessageKey,
    items: ['💼', '📈', '🗓', '☕', '🧠', '🔧'],
  },
];

export function StickerPanel({
  tab,
  onInsert,
  onSend,
  onClose,
}: {
  tab: 'emoji' | 'stickers';
  onInsert: (text: string) => void;
  onSend: (text: string) => void;
  onClose: () => void;
}) {
  const [pack, setPack] = useState(PACKS[0]?.id ?? 'classic');
  const box = useRef<HTMLDivElement>(null);

  // Clicking anywhere else closes it, like the prototype's document handler.
  useEffect(() => {
    const dismiss = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) onClose();
    };
    // Deferred so the click that opened the panel does not immediately close it.
    const timer = window.setTimeout(() => window.addEventListener('click', dismiss), 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('click', dismiss);
    };
  }, [onClose]);

  const items = PACKS.find((item) => item.id === pack)?.items ?? [];

  return (
    <div className="stk-panel show" ref={box}>
      <div className="stk-tabs">
        <button
          className={`stk-tab${tab === 'emoji' ? ' on' : ''}`}
          title={t('stickers.emoji')}
          onClick={() => undefined}
        >
          🙂
        </button>
        {PACKS.map((item) => (
          <button
            key={item.id}
            className={`stk-tab${tab === 'stickers' && pack === item.id ? ' on' : ''}`}
            title={item.title}
            onClick={() => setPack(item.id)}
          >
            {item.icon}
          </button>
        ))}
      </div>

      <div className="stk-body">
        {tab === 'emoji' ? (
          <div className="stk-grid" style={{ gridTemplateColumns: 'repeat(8,1fr)' }}>
            {EMOJI.map((emoji) => (
              <button
                key={emoji}
                className="stk"
                style={{ fontSize: 22 }}
                onClick={() => onInsert(emoji)}
              >
                {emoji}
              </button>
            ))}
          </div>
        ) : (
          <div className="stk-grid">
            {items.map((sticker) => (
              <button key={sticker} className="stk" onClick={() => onSend(sticker)}>
                {sticker}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="stk-foot">
        <button className="stk-store" disabled title={t('stickers.storeStage')}>
          {t('stickers.store')}
        </button>
      </div>
    </div>
  );
}
