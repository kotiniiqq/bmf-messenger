import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Message } from '@bmf/shared';
import { api } from '../api/client.js';
import { t } from '../i18n/index.js';
import { useApp } from '../store/app.js';
import { TRACKS } from '../music.js';
import { usePlayer } from '../player.js';

/**
 * The prototype's `.cmd` palette. Its filter prefixes narrow the
 * same server-side search the sidebar uses; commands are the ones that lead
 * somewhere that exists.
 */
interface Row {
  group: string;
  title: string;
  subtitle: string;
  icon: string;
  tag?: string;
  run: () => void;
}

interface Query {
  from: string | null;
  where: string | null;
  text: string;
}

/** The `from:`/`in:`/`has:` prefixes the prototype documents, in the UI language. */
function parseQuery(raw: string): Query {
  const words: string[] = [];
  const parsed: Query = { from: null, where: null, text: '' };

  const from = t('palette.prefixFrom');
  const where = t('palette.prefixWhere');
  const prefixes = [from, where, t('palette.prefixHas')];
  const filter = new RegExp(`^(${prefixes.join('|')}):(.+)$`, 'i');

  for (const word of raw.split(/\s+/)) {
    const match = filter.exec(word);
    if (!match) {
      words.push(word);
      continue;
    }

    const [, key, value] = match;
    if (key?.toLowerCase() === from) parsed.from = value?.toLowerCase() ?? null;
    else if (key?.toLowerCase() === where) parsed.where = value?.toLowerCase() ?? null;
  }

  parsed.text = words.join(' ').trim().toLowerCase();
  return parsed;
}

export function CommandPalette({
  onClose,
  onSection,
  onOpenSettings,
}: {
  onClose: () => void;
  onSection: (section: 'chats' | 'mail' | 'music') => void;
  onOpenSettings: () => void;
}) {
  const chats = useApp((s) => s.chats);
  const openChat = useApp((s) => s.openChat);

  const [raw, setRaw] = useState('');
  const [hits, setHits] = useState<{ message: Message; chatTitle: string }[]>([]);
  const [active, setActive] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);

  const query = useMemo(() => parseQuery(raw), [raw]);

  useEffect(() => {
    if (query.text.length < 2) {
      setHits([]);
      return;
    }

    const timer = window.setTimeout(() => {
      void api
        .search(query.text)
        .then((res) => setHits(res.items))
        .catch(() => setHits([]));
    }, 220);

    return () => window.clearTimeout(timer);
  }, [query.text]);

  const rows = useMemo<Row[]>(() => {
    const matches = (text: string) => !query.text || text.toLowerCase().includes(query.text);
    const inScope = (key: string) => !query.where || key.startsWith(query.where.slice(0, 4));
    const out: Row[] = [];

    if (!query.where && !query.from) {
      const commands: Row[] = [
        {
          group: t('palette.groupCommands'),
          title: t('palette.appearance'),
          subtitle: t('palette.appearanceSub'),
          icon: '⚙',
          run: onOpenSettings,
        },
        {
          group: t('palette.groupCommands'),
          title: t('palette.openMail'),
          subtitle: t('palette.openMailSub'),
          icon: '✉',
          run: () => onSection('mail'),
        },
        {
          group: t('palette.groupCommands'),
          title: t('palette.openMusic'),
          subtitle: t('palette.openMusicSub'),
          icon: '♪',
          run: () => onSection('music'),
        },
      ];
      out.push(...commands.filter((row) => matches(row.title) || matches(row.subtitle)));
    }

    if (inScope(t('palette.scopeChats'))) {
      for (const chat of chats) {
        if (query.from && !chat.title.toLowerCase().includes(query.from)) continue;
        if (!matches(chat.title)) continue;
        out.push({
          group: t('palette.groupChats'),
          title: chat.title || t('palette.dmFallback'),
          subtitle: chat.lastMessage?.body.slice(0, 60) || t('palette.noMessages'),
          icon: '💬',
          tag:
            chat.type === 'group'
              ? t('palette.tagGroup')
              : chat.type === 'channel'
                ? t('palette.tagChannel')
                : undefined,
          run: () => {
            onSection('chats');
            void openChat(chat.id);
          },
        });
        if (out.filter((row) => row.group === t('palette.groupChats')).length >= 5) break;
      }

      for (const hit of hits.slice(0, 6)) {
        out.push({
          group: t('palette.groupMessages'),
          title: hit.message.body.slice(0, 60) || t('palette.attachment'),
          subtitle: hit.chatTitle || t('palette.dmFallback'),
          icon: '🔎',
          run: () => {
            onSection('chats');
            void openChat(hit.message.chatId);
          },
        });
      }
    }

    if (inScope(t('palette.scopeMusic'))) {
      const found = TRACKS.filter(
        (item) => matches(t(item.title)) || matches(t(item.artist)),
      ).slice(0, 4);

      for (const track of found) {
        out.push({
          group: t('palette.groupMusic'),
          title: t(track.title),
          subtitle: `${t(track.artist)} — ${t(track.album)}`,
          icon: '♪',
          run: () => {
            onSection('music');
            usePlayer.getState().play(
              track.id,
              TRACKS.map((item) => item.id),
            );
          },
        });
      }
    }

    return out;
  }, [chats, hits, query, onOpenSettings, onSection, openChat]);

  useEffect(() => setActive(0), [rows.length]);

  function runRow(index: number) {
    const row = rows[index];
    if (!row) return;
    onClose();
    row.run();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((current) => Math.min(current + 1, rows.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      runRow(active);
    }
  }

  let lastGroup = '';

  return createPortal(
    <div className="cmd-ov show" onClick={onClose}>
      <div className="cmd" onClick={(event) => event.stopPropagation()}>
        <div className="cmd-top">
          <svg viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            className="cmd-inp"
            autoFocus
            value={raw}
            placeholder={t('palette.placeholder')}
            onChange={(e) => setRaw(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <span className="cmd-kbd">Esc</span>
        </div>

        <div className="cmd-body" ref={bodyRef}>
          {rows.length === 0 ? (
            <div className="cmd-empty">
              {t('palette.nothing')}
              <br />
              {t('palette.filtersHint')} <b>{t('palette.filterFrom')}</b> ·{' '}
            <b>{t('palette.filterWhere')}</b>
            </div>
          ) : (
            rows.map((row, index) => {
              const header = row.group !== lastGroup ? row.group : null;
              lastGroup = row.group;
              return (
                <div key={`${row.group}-${row.title}-${index}`}>
                  {header && <div className="cmd-grp">{header}</div>}
                  <div
                    className={`cmd-row${index === active ? ' act' : ''}`}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => runRow(index)}
                  >
                    <div className="cmd-ico">{row.icon}</div>
                    <div className="cmd-mid">
                      <div className="cmd-t">{row.title}</div>
                      <div className="cmd-x">{row.subtitle}</div>
                    </div>
                    {row.tag && <span className="cmd-tag">{row.tag}</span>}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
