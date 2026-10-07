import { useState } from 'react';
import { t, type MessageKey } from '../i18n/index.js';

/**
 * The prototype's mail section (`#sbMail` and `#mailView`) on mock letters.
 * Stage 3 builds the real module; nothing here talks to a server, and the empty
 * folders say so plainly rather than inventing traffic.
 *
 * Folders are keyed by a stable id rather than by their Russian name: the name
 * is what the user reads, and using it as the identity would make the section
 * untranslatable and would break the moment IMAP hands us `INBOX`.
 */
export type MailFolder = 'inbox' | 'sent' | 'drafts' | 'spam' | 'trash';

type MailCategory = 'all' | 'unread' | 'attachment';

interface MockLetter {
  id: number;
  from: MessageKey;
  address: string;
  subject: MessageKey;
  preview: MessageKey;
  body: MessageKey;
  time: MessageKey;
  unread: boolean;
  attachment: boolean;
}

/** Cover gradients, GRADS from the prototype. */
const GRADS = [
  'linear-gradient(135deg,#7c6cf8,#06b6d4)',
  'linear-gradient(135deg,#ec4899,#f59e0b)',
  'linear-gradient(135deg,#10b981,#06b6d4)',
  'linear-gradient(135deg,#6366f1,#ec4899)',
  'linear-gradient(135deg,#f59e0b,#ef4444)',
  'linear-gradient(135deg,#06b6d4,#6366f1)',
  'linear-gradient(135deg,#8b5cf6,#ec4899)',
  'linear-gradient(135deg,#14b8a6,#84cc16)',
];

const FOLDER_ICONS: Record<MailFolder, JSX.Element> = {
  inbox: (
    <>
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </>
  ),
  sent: (
    <>
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </>
  ),
  drafts: (
    <>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </>
  ),
  spam: (
    <>
      <circle cx="12" cy="12" r="10" />
      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
    </>
  ),
  trash: (
    <>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </>
  ),
};

const FOLDER_TITLES: Record<MailFolder, MessageKey> = {
  inbox: 'mail.folder.inbox',
  sent: 'mail.folder.sent',
  drafts: 'mail.folder.drafts',
  spam: 'mail.folder.spam',
  trash: 'mail.folder.trash',
};

const MAILS: Record<MailFolder, MockLetter[]> = {
  inbox: [
    {
      id: 1,
      from: 'mail.mock.ci.from',
      address: 'noreply@github.com',
      subject: 'mail.mock.ci.subject',
      preview: 'mail.mock.ci.preview',
      body: 'mail.mock.ci.body',
      time: 'mail.mock.ci.time',
      unread: true,
      attachment: false,
    },
    {
      id: 2,
      from: 'mail.mock.design.from',
      address: 'anna@bmf.ink',
      subject: 'mail.mock.design.subject',
      preview: 'mail.mock.design.preview',
      body: 'mail.mock.design.body',
      time: 'mail.mock.design.time',
      unread: true,
      attachment: true,
    },
    {
      id: 3,
      from: 'mail.mock.host.from',
      address: 'support@vps-host.example',
      subject: 'mail.mock.host.subject',
      preview: 'mail.mock.host.preview',
      body: 'mail.mock.host.body',
      time: 'mail.mock.host.time',
      unread: true,
      attachment: false,
    },
    {
      id: 4,
      from: 'mail.mock.digest.from',
      address: 'digest@bmf.ink',
      subject: 'mail.mock.digest.subject',
      preview: 'mail.mock.digest.preview',
      body: 'mail.mock.digest.body',
      time: 'mail.mock.digest.time',
      unread: false,
      attachment: true,
    },
  ],
  sent: [],
  drafts: [],
  spam: [],
  trash: [],
};

const FOLDERS = Object.keys(MAILS) as MailFolder[];

const CATEGORIES: { id: MailCategory; title: MessageKey }[] = [
  { id: 'all', title: 'mail.category.all' },
  { id: 'unread', title: 'mail.category.unread' },
  { id: 'attachment', title: 'mail.category.attachment' },
];

const lettersOf = (folder: MailFolder): MockLetter[] => MAILS[folder] ?? [];

const unreadIn = (folder: MailFolder, read: Set<number>): number =>
  lettersOf(folder).filter((letter) => letter.unread && !read.has(letter.id)).length;

/** `#sbMail`: the compose button and the folder list. */
export function MailSidebar({
  folder,
  onFolder,
  read,
}: {
  folder: MailFolder;
  onFolder: (folder: MailFolder) => void;
  read: Set<number>;
}) {
  return (
    <>
      <button className="compose-btn" disabled title={t('mail.stage3')}>
        <svg viewBox="0 0 24 24">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
        </svg>
        {t('mail.compose')}
      </button>

      <div className="sb-div" />
      <div className="sb-title">{t('mail.folders')}</div>

      <div className="sb-scroll">
        {FOLDERS.map((id) => {
          const unread = unreadIn(id, read);
          return (
            <div
              key={id}
              className={`mf-item${id === folder ? ' on' : ''}`}
              onClick={() => onFolder(id)}
            >
              <svg viewBox="0 0 24 24">{FOLDER_ICONS[id]}</svg>
              {t(FOLDER_TITLES[id])}
              {unread > 0 && <span className="mf-count">{unread}</span>}
            </div>
          );
        })}
      </div>
    </>
  );
}

/** `#mailView`: toolbar, then the list/reading pane split. */
export function MailView({
  folder,
  read,
  onRead,
}: {
  folder: MailFolder;
  read: Set<number>;
  onRead: (id: number) => void;
}) {
  const [category, setCategory] = useState<MailCategory>('all');
  const [openId, setOpenId] = useState<number | null>(null);

  const all = lettersOf(folder);
  const isUnread = (letter: MockLetter) => letter.unread && !read.has(letter.id);

  const letters = all.filter((letter) =>
    category === 'unread' ? isUnread(letter) : category === 'attachment' ? letter.attachment : true,
  );

  const open = all.find((letter) => letter.id === openId) ?? null;

  return (
    <div id="mailView" style={{ display: 'flex' }}>
      <div className="mail-toolbar">
        <span className="mail-toolbar-title">{t(FOLDER_TITLES[folder])}</span>
        <div className="mail-cats">
          {CATEGORIES.map((item) => (
            <button
              key={item.id}
              className={`mail-cat${category === item.id ? ' on' : ''}`}
              onClick={() => setCategory(item.id)}
            >
              {t(item.title)}
            </button>
          ))}
        </div>
      </div>

      <div className="mail-split">
        <div className="mail-list">
          {letters.map((letter) => (
            <div
              key={letter.id}
              className={`me${isUnread(letter) ? ' unread' : ''}${
                openId === letter.id ? ' on' : ''
              }`}
              onClick={() => {
                setOpenId(letter.id);
                onRead(letter.id);
              }}
            >
              <div className="me-top">
                <span className="me-from">{t(letter.from)}</span>
                <span className="me-time">{t(letter.time)}</span>
              </div>
              <div className="me-subj">{t(letter.subject)}</div>
              <div className="me-prev">{t(letter.preview)}</div>
              {letter.attachment && <span className="me-att">📎 {t('mail.attachment')}</span>}
            </div>
          ))}

          {letters.length === 0 && (
            <div
              style={{
                padding: '30px 10px',
                textAlign: 'center',
                fontSize: 12.5,
                color: 'var(--txt2)',
              }}
            >
              {t('mail.empty')}
            </div>
          )}
        </div>

        <div className="mail-read">
          {open ? (
            <>
              <div className="mr-subj">{t(open.subject)}</div>
              <div className="mr-meta">
                <div className="av" style={{ background: GRADS[open.id % GRADS.length] }}>
                  {t(open.from)[0]}
                </div>
                <div className="mr-who">
                  <div className="mr-from">{t(open.from)}</div>
                  <div className="mr-addr">
                    {open.address} · {t(open.time)}
                  </div>
                </div>
              </div>
              <div className="mr-body">{t(open.body)}</div>
              <div className="mr-acts">
                <button className="mr-btn" disabled title={t('mail.stage3')}>
                  <svg viewBox="0 0 24 24">
                    <polyline points="9 17 4 12 9 7" />
                    <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
                  </svg>
                  {t('mail.reply')}
                </button>
                <button className="mr-btn" disabled title={t('mail.stage3')}>
                  <svg viewBox="0 0 24 24">
                    <polyline points="15 17 20 12 15 7" />
                    <path d="M4 18v-2a4 4 0 0 1 4-4h12" />
                  </svg>
                  {t('mail.forward')}
                </button>
                <button className="mr-btn" disabled title={t('mail.stage3')}>
                  <svg viewBox="0 0 24 24">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  {t('mail.discuss')}
                </button>
              </div>
            </>
          ) : (
            <div className="mr-empty">
              <svg viewBox="0 0 24 24">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              {t('mail.mockNotice')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const MAIL_FOLDERS = FOLDERS;

export function mailUnreadCount(read: Set<number>): number {
  return FOLDERS.reduce((sum, id) => sum + unreadIn(id, read), 0);
}
