import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Note } from '@bmf/shared';
import { api } from '../api/client.js';
import { toast } from '../components/Toast.js';
import { t } from '../i18n/index.js';

/**
 * `#notesView` from the prototype: a bar, a folder strip, a grid of cards and an
 * editor that slides over them.
 *
 * The markup and every class name are the prototype's own — this screen was
 * drawn there in full, so it is ported rather than designed.
 *
 * Saving is debounced rather than tied to a button. The prototype's editor has
 * no save control at all, and a note that needs one is a note somebody loses.
 */

const SAVE_DEBOUNCE_MS = 600;

/** The light markup the editor's placeholder promises, and nothing beyond it. */
function render(body: string): string {
  const escaped = body
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped
    .split('\n')
    .map((line) => {
      const bold = line.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
      if (/^#\s+/.test(bold)) return `<h3>${bold.replace(/^#\s+/, '')}</h3>`;
      if (/^-\s\[[ x]\]\s/i.test(bold)) {
        const done = /^-\s\[x\]/i.test(bold);
        return `<div class="nt-tpl-b">${done ? '☑' : '☐'} ${bold.replace(/^-\s\[[ x]\]\s/i, '')}</div>`;
      }
      if (/^-\s+/.test(bold)) return `<div class="nt-tpl-b">• ${bold.replace(/^-\s+/, '')}</div>`;
      return bold ? `<div>${bold}</div>` : '<br>';
    })
    .join('');
}

/** The first line that carries anything, for a card with no title of its own. */
function preview(note: Note): string {
  const line = note.body.split('\n').find((text) => text.trim());
  // Strips the leading markup so a card shows the words, not the syntax.
  return line?.replace(/^[#\-\s[\]x]*/i, '').slice(0, 120) ?? t('notes.emptyNote');
}

export function Notes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<{ folder: string; count: number }[]>([]);
  const [folder, setFolder] = useState<string | null>(null);
  const [open, setOpen] = useState<Note | null>(null);
  const [editing, setEditing] = useState(true);
  const [loading, setLoading] = useState(true);

  const saveTimer = useRef<number | null>(null);

  const reload = useCallback(async () => {
    const [page, folderList] = await Promise.all([
      api.notes(null, folder),
      api.noteFolders(),
    ]);
    setNotes(page.items);
    setFolders(folderList.items);
    setLoading(false);
  }, [folder]);

  useEffect(() => {
    void reload().catch(() => {
      setLoading(false);
      toast(t('notes.loadFailed'));
    });
  }, [reload]);

  /** Writes what is on screen, at most once every debounce window. */
  const scheduleSave = useCallback((next: Note) => {
    setOpen(next);
    setNotes((current) => current.map((note) => (note.id === next.id ? next : note)));

    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void api
        .updateNote(next.id, { title: next.title, body: next.body })
        .catch(() => toast(t('notes.saveFailed')));
    }, SAVE_DEBOUNCE_MS);
  }, []);

  // Leaving the editor must not drop the last few keystrokes.
  const flush = useCallback(() => {
    if (!saveTimer.current) return;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = null;
  }, []);

  async function createNote() {
    try {
      const note = await api.createNote({ folder });
      setNotes((current) => [note, ...current]);
      setOpen(note);
      setEditing(true);
    } catch {
      toast(t('notes.createFailed'));
    }
  }

  async function removeNote() {
    if (!open) return;
    const id = open.id;
    flush();
    setOpen(null);

    try {
      await api.deleteNote(id);
      setNotes((current) => current.filter((note) => note.id !== id));
      void reload();
    } catch {
      toast(t('notes.deleteFailed'));
    }
  }

  async function togglePin(note: Note) {
    try {
      const next = await api.updateNote(note.id, { pinned: !note.pinned });
      setNotes((current) =>
        [...current.map((item) => (item.id === next.id ? next : item))].sort(
          (a, b) => Number(b.pinned) - Number(a.pinned),
        ),
      );
    } catch {
      toast(t('notes.pinFailed'));
    }
  }

  const visible = useMemo(
    () => (folder ? notes.filter((note) => note.folder === folder) : notes),
    [notes, folder],
  );

  return (
    <div id="notesView">
      <div className="nt-bar">
        {open && (
          <button
            className="sub-back"
            title={t('notes.backToList')}
            onClick={() => {
              flush();
              setOpen(null);
              void reload();
            }}
          >
            <svg viewBox="0 0 24 24">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        )}

        <span className="nt-title">
          {open ? open.title || t('notes.untitled') : t('notes.title')}
        </span>

        {open && (
          <>
            <button className="ib" title={t('notes.deleteNote')} onClick={() => void removeNote()}>
              <svg viewBox="0 0 24 24">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
              </svg>
            </button>
            <button className="mail-cat" onClick={() => setEditing((current) => !current)}>
              {editing ? t('notes.view') : t('notes.edit')}
            </button>
          </>
        )}

        {!open && (
          <button className="mail-cat" onClick={() => void createNote()}>
            {t('notes.newNote')}
          </button>
        )}
      </div>

      {!open && (
        <div className="nt-folders">
          <div className={`nt-fold${folder === null ? ' on' : ''}`} onClick={() => setFolder(null)}>
            <span className="nt-fold-n">{t('notes.allFolders')}</span>
          </div>
          {folders.map((item) => (
            <div
              key={item.folder}
              className={`nt-fold${folder === item.folder ? ' on' : ''}`}
              onClick={() => setFolder(item.folder)}
            >
              <span className="nt-fold-n">
                {item.folder} · {item.count}
              </span>
            </div>
          ))}
        </div>
      )}

      {!open && (
        <div className="nt-grid">
          {loading && <div className="nt-empty">{t('notes.loading')}</div>}
          {!loading && !visible.length && (
            <div className="nt-empty">
              {t('notes.emptyTitle')}
              <br />
              {t('notes.emptyHint')}
            </div>
          )}

          {visible.map((note) => (
            <div
              key={note.id}
              className="nt-card"
              onClick={() => {
                setOpen(note);
                setEditing(false);
              }}
            >
              <div className="nt-card-t">{note.title || t('notes.untitled')}</div>
              <div className="nt-card-b">{preview(note)}</div>
              <div className="nt-card-f">
                {note.folder && <span className="nt-card-x">{note.folder}</span>}
                <span
                  className="nt-card-fwd"
                  title={note.pinned ? t('notes.unpin') : t('notes.pin')}
                  onClick={(event) => {
                    event.stopPropagation();
                    void togglePin(note);
                  }}
                >
                  {note.pinned ? '★' : '☆'}
                </span>
                <span className="nt-card-x">
                  {new Date(note.updatedAt).toLocaleDateString('ru-RU', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="nt-ed">
          <input
            className="nt-ed-t"
            placeholder={t('notes.titlePlaceholder')}
            value={open.title}
            onChange={(event) => scheduleSave({ ...open, title: event.target.value })}
          />

          {editing ? (
            <textarea
              className="nt-ed-x"
              placeholder={t('notes.bodyPlaceholder')}
              value={open.body}
              onChange={(event) => scheduleSave({ ...open, body: event.target.value })}
            />
          ) : (
            <div className="nt-view" dangerouslySetInnerHTML={{ __html: render(open.body) }} />
          )}
        </div>
      )}
    </div>
  );
}
