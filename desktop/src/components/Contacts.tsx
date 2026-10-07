import { useEffect, useState } from 'react';
import type { User } from '@bmf/shared';
import { api } from '../api/client.js';
import { t } from '../i18n/index.js';
import { useApp } from '../store/app.js';
import { nameFor } from '../contacts.js';
import { statusById, statusLabel } from '../status.js';
import { LeftPanel, colourOf } from './LeftPanel.js';
import { toast } from './Toast.js';

/**
 * The prototype's `lpMode === 'contacts'`. Its contact list is a fixed array;
 * here it is the server's user directory, so the panel needs a search field —
 * `.wz-inp`, the input the prototype uses inside a panel.
 */
export function Contacts({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<User[]>([]);
  const [busy, setBusy] = useState(false);

  const openChat = useApp((s) => s.openChat);
  const loadChats = useApp((s) => s.loadChats);
  const ensureChat = useApp((s) => s.ensureChat);
  const contacts = useApp((s) => s.contacts);

  // Newest first, the order the server returns them in.
  const mine = Object.values(contacts);

  useEffect(() => {
    if (query.trim().length < 2) {
      setFound([]);
      return;
    }

    // Debounced: a request per keystroke would hammer the directory.
    const timer = window.setTimeout(() => {
      void api
        .searchUsers(query.trim())
        .then((res) => setFound(res.items))
        .catch(() => setFound([]));
    }, 250);

    return () => window.clearTimeout(timer);
  }, [query]);

  async function open(user: User) {
    if (busy) return;
    setBusy(true);
    try {
      const chat = await api.openDirect(user.id);
      await loadChats();
      // A chat this person deleted is not in the list the server just sent;
      // asking for it by name is reason enough to see it again, empty.
      ensureChat(chat);
      await openChat(chat.id);
      onClose();
    } catch {
      toast(t('contacts.openFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <LeftPanel title={t('contacts.title')} onClose={onClose}>
      <input
        className="wz-inp"
        value={query}
        autoFocus
        placeholder={t('contacts.searchPlaceholder')}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div style={{ marginTop: 8 }}>
        {found.map((user) => (
          <Row key={user.id} user={user} label={nameFor(user, contacts)} onOpen={() => void open(user)} />
        ))}
      </div>

      {found.length === 0 && (query.trim().length >= 2 ? (
          <div className="ct-sub" style={{ padding: '14px 4px', textAlign: 'center' }}>
            {t('contacts.none')}
          </div>
        ) : (
          // With nothing typed the panel shows the contacts themselves. It used
          // to show the hint and nothing else, which made "Контакты" a search
          // box that had never heard of a contact.
          <>
            <div className="wz-lbl">{t('contacts.mine')}</div>
            {mine.length === 0 ? (
              <div className="ct-sub" style={{ padding: '14px 4px', textAlign: 'center' }}>
                {t('contacts.empty')}
              </div>
            ) : (
              mine.map((contact) => (
                <Row
                  key={contact.user.id}
                  user={contact.user}
                  label={contact.localName?.trim() || contact.user.displayName}
                  onOpen={() => void open(contact.user)}
                />
              ))
            )}
          </>
        ))}
    </LeftPanel>
  );
}

/** One person, in the search results or in the list of contacts. */
function Row({ user, label, onOpen }: { user: User; label: string; onOpen: () => void }) {
  return (
    <div className="ct-row" onClick={onOpen}>
      <div className="av" style={{ background: colourOf(user.id) }}>
        {user.username.slice(0, 2).toUpperCase()}
        <span className="av-st emoji">{statusById(user.statusId).emoji}</span>
      </div>
      <div className="ct-mid">
        <div className="ct-name">{label}</div>
        <div className="ct-sub">
          {statusLabel(user)} · @{user.username}
        </div>
      </div>
    </div>
  );
}
