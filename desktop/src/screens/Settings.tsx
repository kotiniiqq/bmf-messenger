import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Device, User } from '@bmf/shared';
import type { ReleaseNote, UnsupportedReason, UpdateState } from '../../electron/updates.js';
import { api } from '../api/client.js';
import { getCallPrefs, setCallPrefs } from '../call-prefs.js';
import { t, type MessageKey } from '../i18n/index.js';
import { useApp } from '../store/app.js';
import { SHORTCUTS } from '../shortcuts.js';
import { statusLabel } from '../status.js';
import { Customization } from './Customization.js';
import { IconBack, IconChevron, IconClose } from '../components/icons.js';

/**
 * Settings use the prototype's own panel: a centred `.sp` card whose sub-screens
 * slide in from the right as `.sub-panel`. The menu is the prototype's list, in
 * its order, with its icons — screens whose backing is a later stage say which
 * stage rather than offering a control that does nothing.
 */
type Screen =
  | 'account'
  | 'notif'
  | 'mailset'
  | 'rules'
  | 'musicset'
  | 'ai'
  | 'update'
  | 'keys'
  | 'sounds'
  | 'lang'
  | 'custom';

interface MenuItem {
  id: Screen;
  title: MessageKey;
  desc: MessageKey;
  tint: [string, string];
  icon: ReactNode;
}

const MENU: MenuItem[] = [
  {
    id: 'account',
    title: 'settings.item.account',
    desc: 'settings.item.accountDesc',
    tint: ['rgba(124,108,248,.15)', '#7c6cf8'],
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    id: 'notif',
    title: 'settings.item.notif',
    desc: 'settings.item.notifDesc',
    tint: ['rgba(245,158,11,.15)', '#f59e0b'],
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    ),
  },
  {
    id: 'mailset',
    title: 'settings.item.mail',
    desc: 'settings.item.mailDesc',
    tint: ['rgba(6,182,212,.15)', '#06b6d4'],
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
        <polyline points="22,6 12,13 2,6" />
      </svg>
    ),
  },
  {
    id: 'rules',
    title: 'settings.item.rules',
    desc: 'settings.item.rulesDesc',
    tint: ['rgba(139,92,246,.15)', '#8b5cf6'],
    icon: (
      <svg viewBox="0 0 24 24">
        <line x1="4" y1="21" x2="4" y2="14" />
        <line x1="4" y1="10" x2="4" y2="3" />
        <line x1="12" y1="21" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12" y2="3" />
        <line x1="20" y1="21" x2="20" y2="16" />
        <line x1="20" y1="12" x2="20" y2="3" />
        <line x1="1" y1="14" x2="7" y2="14" />
        <line x1="9" y1="8" x2="15" y2="8" />
        <line x1="17" y1="16" x2="23" y2="16" />
      </svg>
    ),
  },
  {
    id: 'musicset',
    title: 'settings.item.music',
    desc: 'settings.item.musicDesc',
    tint: ['rgba(236,72,153,.15)', '#ec4899'],
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </svg>
    ),
  },
  {
    id: 'ai',
    title: 'settings.item.ai',
    desc: 'settings.item.aiDesc',
    tint: ['linear-gradient(135deg,rgba(124,108,248,.2),rgba(236,72,153,.2))', '#7c6cf8'],
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" />
        <path d="M18 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
      </svg>
    ),
  },
  {
    id: 'update',
    title: 'settings.item.update',
    desc: 'settings.item.updateDesc',
    tint: ['rgba(34,197,94,.15)', '#22c55e'],
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M21 2v6h-6" />
        <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
        <path d="M3 22v-6h6" />
        <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      </svg>
    ),
  },
  {
    id: 'keys',
    title: 'settings.item.keys',
    desc: 'settings.item.keysDesc',
    tint: ['rgba(100,116,139,.18)', '#64748b'],
    icon: (
      <svg viewBox="0 0 24 24">
        <rect x="2" y="6" width="20" height="13" rx="2" />
        <line x1="7" y1="15" x2="17" y2="15" />
      </svg>
    ),
  },
  {
    id: 'sounds',
    title: 'settings.item.sounds',
    desc: 'settings.item.soundsDesc',
    tint: ['rgba(20,184,166,.15)', '#14b8a6'],
    icon: (
      <svg viewBox="0 0 24 24">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
      </svg>
    ),
  },
  {
    id: 'lang',
    title: 'settings.item.lang',
    desc: 'settings.item.langDesc',
    tint: ['rgba(16,185,129,.15)', '#10b981'],
    icon: (
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    ),
  },
  {
    id: 'custom',
    title: 'settings.item.custom',
    desc: 'settings.item.customDesc',
    tint: ['linear-gradient(135deg,rgba(124,108,248,.25),rgba(6,182,212,.25))', 'var(--acc)'],
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
      </svg>
    ),
  },
];

function Row({ label, desc, children }: { label: string; desc?: string; children?: ReactNode }) {
  return (
    <div className="sub-row">
      <div>
        <div className="sub-row-label">{label}</div>
        {desc && <div className="sub-row-desc">{desc}</div>}
      </div>
      {children}
    </div>
  );
}

/** A row whose backing is a later stage; the description says which one. */
function Later({ label, stage }: { label: string; stage: string }) {
  return (
    <Row label={label} desc={stage}>
      <button className="sub-btn" disabled title={stage}>
        {t('settings.soon')}
      </button>
    </Row>
  );
}

/**
 * Relay or direct, and what each one actually costs.
 *
 * The warning is deliberately about the right thing. LiveKit is an SFU, so the
 * person on the other end never sees your address either way — what changes is
 * whether the media server sees it or only the relay standing in front of it.
 * Promising more privacy than the architecture delivers would be worse than
 * offering no setting at all.
 */
function CallConnection() {
  const [prefs, setPrefs] = useState(getCallPrefs);

  return (
    <>
      <Row label={t('settings.account.direct')} desc={t('settings.account.directDesc')}>
        <div
          className={`tog${prefs.allowDirect ? ' on' : ''}`}
          title={
            prefs.allowDirect ? t('settings.account.directOn') : t('settings.account.directOff')
          }
          onClick={() => setPrefs(setCallPrefs({ allowDirect: !prefs.allowDirect }))}
        />
      </Row>
      <div className="ct-sub" style={{ padding: '8px 4px' }}>
        {prefs.allowDirect
          ? t('settings.account.directOnText')
          : t('settings.account.directOffText')}
      </div>
      <div className="ct-sub" style={{ padding: '0 4px 8px' }}>
        {t('settings.account.directApplies')}
      </div>
    </>
  );
}

function Account({ user, onEditStatus }: { user: User | null; onEditStatus: () => void }) {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [showDevices, setShowDevices] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const signOut = useApp((s) => s.signOut);
  const reload = () => api.devices().then((r) => setDevices(r.items));

  useEffect(() => {
    if (showDevices) void reload();
  }, [showDevices]);

  async function changePassword() {
    try {
      const res = await api.changePassword(current, next);
      setCurrent('');
      setNext('');
      setNote({
        ok: true,
        text: res.revokedSessions
          ? t('settings.account.passwordChangedSessions', { count: res.revokedSessions })
          : t('settings.account.passwordChanged'),
      });
    } catch (err) {
      setNote({ ok: false, text: err instanceof Error ? err.message : t('settings.failed') });
    }
  }

  return (
    <>
      <Row label={t('settings.account.name')} desc={user?.displayName ?? '—'} />
      <Row label={t('settings.account.username')} desc={user ? `@${user.username}` : '—'} />
      <Row label={t('settings.account.status')} desc={user ? statusLabel(user) : '—'}>
        <button className="sub-btn" onClick={onEditStatus}>
          {t('common.edit')}
        </button>
      </Row>

      <div className="sp-slbl">{t('settings.account.passwordSection')}</div>
      <input
        className="wz-inp"
        type="password"
        value={current}
        placeholder={t('settings.account.currentPassword')}
        onChange={(e) => setCurrent(e.target.value)}
      />
      <input
        className="wz-inp"
        type="password"
        value={next}
        style={{ marginTop: 8 }}
        placeholder={t('settings.account.newPassword')}
        onChange={(e) => setNext(e.target.value)}
      />
      <button
        className="lp-cta"
        style={{ height: 36, fontSize: 12.5, marginTop: 10 }}
        disabled={!current || next.length < 10}
        onClick={() => void changePassword()}
      >
        {t('settings.account.changePassword')}
      </button>
      {note && <div className={note.ok ? 'msg-ok' : 'msg-err'}>{note.text}</div>}
      <div className="ct-sub" style={{ padding: '8px 4px' }}>
        {t('settings.account.passwordNote')}
      </div>

      <div className="sp-div" />
      <div className="sp-slbl">{t('settings.account.sessions')}</div>

      {!showDevices ? (
        <Row label={t('settings.account.devices')} desc={t('settings.account.devicesDesc')}>
          <button className="sub-btn" onClick={() => setShowDevices(true)}>
            {t('common.show')}
          </button>
        </Row>
      ) : !devices ? (
        <div className="ct-sub" style={{ padding: '10px 4px' }}>
          {t('common.loading')}
        </div>
      ) : (
        devices.map((device) => (
          <Row
            key={device.id}
            label={device.name + (device.current ? t('settings.account.thisDevice') : '')}
            desc={`${device.platform}${device.city ? ` · ${device.city}` : ''} · ${new Date(
              device.lastSeenAt,
            ).toLocaleString('ru-RU')}`}
          >
            {!device.current && (
              <button
                className="sub-btn"
                onClick={() => void api.revokeDevice(device.id).then(reload)}
              >
                {t('settings.account.revoke')}
              </button>
            )}
          </Row>
        ))
      )}

      <div className="sp-div" />
      <div className="sp-slbl">{t('settings.account.calls')}</div>
      <CallConnection />

      <div className="sp-div" />
      <Later
        label={t('settings.account.deleteAccount')}
        stage={t('settings.account.deleteAccountStage')}
      />

      <button className="sp-reset" style={{ marginTop: 14 }} onClick={() => void signOut()}>
        {t('settings.account.signOut')}
      </button>
    </>
  );
}

function Notifications() {
  return (
    <>
      <Row label={t('settings.notif.show')} desc={t('settings.notif.showDesc')}>
        <div className="tog on" title={t('settings.notif.alwaysOn')} />
      </Row>
      <div className="ct-sub" style={{ padding: '8px 4px' }}>
        {t('settings.notif.why')}
      </div>
      <div className="sp-div" />
      <Later label={t('settings.notif.sound')} stage={t('settings.notif.soundStage')} />
      <Later label={t('settings.notif.dnd')} stage={t('settings.notif.stage5')} />
    </>
  );
}

function MailSettings() {
  return (
    <>
      <div className="ct-sub" style={{ padding: '0 4px 10px' }}>
        {t('settings.mail.note')}
      </div>
      <Later label={t('settings.mail.address')} stage={t('settings.mail.addressStage')} />
      <Later label={t('settings.mail.imap')} stage={t('settings.mail.stage3')} />
      <Later label={t('settings.mail.signature')} stage={t('settings.mail.stage3')} />
      <div className="ct-sub" style={{ padding: '8px 4px' }}>
        {t('settings.mail.port25')}
      </div>
    </>
  );
}

function MailRules() {
  return (
    <>
      <div className="ct-sub" style={{ padding: '0 4px 10px' }}>
        {t('settings.rules.intro')}
      </div>
      <div className="rule">
        <div className="rule-h">
          <span className="rule-n">{t('settings.rules.example')}</span>
        </div>
        <div className="rule-line">
          <span className="rule-w">{t('settings.rules.if')}</span>
          <select className="sub-sel" disabled>
            <option>{t('settings.rules.sender')}</option>
          </select>
          <span className="rule-w">{t('settings.rules.contains')}</span>
          <input className="rule-inp" disabled value="github.com" readOnly />
        </div>
        <div className="rule-line">
          <span className="rule-w">{t('settings.rules.then')}</span>
          <div className="rule-acts">
            <button className="chip on" disabled>
              {t('settings.rules.toFolder')}
            </button>
            <button className="chip" disabled>
              {t('settings.rules.markRead')}
            </button>
          </div>
        </div>
      </div>
      <div className="ct-sub" style={{ padding: '10px 4px' }}>
        {t('settings.rules.note')}
      </div>
    </>
  );
}

function MusicSettings() {
  return (
    <>
      <div className="mu-src" style={{ margin: '2px 0 10px' }}>
        <div className="mu-src-lbl">{t('settings.music.folder')}</div>
        <div className="mu-src-path">
          Music\<b>BMF</b>\
        </div>
      </div>
      <Later
        label={t('settings.music.changeFolder')}
        stage={t('settings.music.changeFolderStage')}
      />
      <Later label={t('settings.music.sleep')} stage={t('settings.music.stage5')} />
      <Later label={t('settings.music.crossfade')} stage={t('settings.music.stage5')} />
      <div className="ct-sub" style={{ padding: '8px 4px' }}>
        {t('settings.music.note')}
      </div>
    </>
  );
}

function AiSettings() {
  return (
    <>
      <div className="ct-sub" style={{ padding: '0 4px 10px' }}>
        {t('settings.ai.note')}
      </div>
      <Later label={t('settings.ai.key')} stage={t('settings.ai.stage5')} />
      <Later label={t('settings.ai.model')} stage={t('settings.ai.stage5')} />
      <Later label={t('settings.ai.persona')} stage={t('settings.ai.stage5')} />
      <div className="pro-card" style={{ marginTop: 12 }}>
        <div className="pro-card-t">
          <svg viewBox="0 0 24 24">
            <polygon points="12 2 15 9 22 9.3 16.5 13.8 18.5 21 12 17 5.5 21 7.5 13.8 2 9.3 9 9" />
          </svg>
          BMF Pro
        </div>
        <div className="pro-card-x">{t('settings.ai.pro')}</div>
      </div>
    </>
  );
}

/** Why a build cannot replace itself, in the words the user needs. */
const UNSUPPORTED: Record<UnsupportedReason, MessageKey> = {
  unpackaged: 'settings.update.unpackaged',
  portable: 'settings.update.portable',
  deb: 'settings.update.deb',
};

function updateText(state: UpdateState, auto: boolean): string {
  const version = state.candidate ?? '';

  switch (state.status) {
    case 'unsupported':
      return t(UNSUPPORTED[state.reason ?? 'unpackaged']);
    case 'checking':
      return t('settings.update.checking');
    case 'none':
      return t('settings.update.latest');
    case 'available':
      return auto
        ? t('settings.update.availableDownloading', { version })
        : t('settings.update.available', { version });
    case 'downloading':
      return t('settings.update.downloading', { version, percent: state.percent ?? 0 });
    case 'ready':
      return t('settings.update.ready', { version });
    case 'error':
      return t('settings.update.error', {
        reason: state.error ?? t('settings.update.noConnection'),
      });
    default:
      return t('settings.update.idle');
  }
}

/**
 * What changed in every published release, inside the app.
 *
 * The button used to open a browser (defect #13), which answers a different
 * question: somebody reading the update screen wants to know what they are being
 * offered, not to go looking for it. The list comes from the public releases
 * page and is cached by the shell, so a machine that has read it once still
 * shows it offline — with a line saying the list is the stored one.
 */
function ReleaseHistory({ current }: { current: string }) {
  const shell = window.bmf;
  const [releases, setReleases] = useState<ReleaseNote[] | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    (refresh: boolean) => {
      if (!shell) return;

      setBusy(true);
      void shell
        .updateReleases(refresh)
        .then((answer) => {
          setReleases(answer.releases);
          setFetchedAt(answer.fetchedAt);
        })
        .finally(() => setBusy(false));
    },
    [shell],
  );

  useEffect(() => load(false), [load]);

  if (!releases) {
    return <div className="ct-sub rel-note">{t('settings.update.historyLoading')}</div>;
  }

  if (!releases.length) {
    return (
      <div className="rel-list">
        <div className="ct-sub rel-note">{t('settings.update.historyEmpty')}</div>
        <div className="rel-foot">
          <button className="sub-btn" onClick={() => load(true)} disabled={busy}>
            {t('settings.update.historyRefresh')}
          </button>
          <button className="sub-btn" onClick={() => void shell?.openReleases()}>
            {t('settings.update.historyOnSite')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rel-list">
      {releases.map((release) => (
        <div className="rel-item" key={release.version}>
          <div className="rel-head">
            <span className="rel-ver">{release.name}</span>
            {release.prerelease && <span className="rel-tag">{t('settings.update.historyBeta')}</span>}
            {release.version === current && (
              <span className="rel-tag now">{t('settings.update.historyCurrent')}</span>
            )}
            <span className="rel-date">
              {release.publishedAt
                ? new Date(release.publishedAt).toLocaleDateString('ru-RU', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })
                : ''}
            </span>
          </div>
          <div className="rel-notes">{release.notes || t('settings.update.historyNoNotes')}</div>
        </div>
      ))}

      <div className="rel-foot">
        <span className="ct-sub">
          {fetchedAt
            ? t('settings.update.historyFetched', {
                time: new Date(fetchedAt).toLocaleDateString('ru-RU', {
                  day: 'numeric',
                  month: 'long',
                }),
              })
            : t('settings.update.historyOffline')}
        </span>
        <button className="sub-btn" onClick={() => load(true)} disabled={busy}>
          {t('settings.update.historyRefresh')}
        </button>
      </div>
    </div>
  );
}

function Updates() {
  const [autostart, setAutostart] = useState<boolean | null>(null);
  const [state, setState] = useState<UpdateState | null>(null);
  const [auto, setAuto] = useState(true);
  const [beta, setBeta] = useState(false);
  const [history, setHistory] = useState(false);
  const shell = window.bmf;

  useEffect(() => {
    if (!shell) return;

    void shell.getAutostart().then(setAutostart);
    void shell.updateState().then(setState);
    void shell.getAutoDownload().then(setAuto);
    void shell.getBetaChannel().then(setBeta);

    return shell.onUpdateState(setState);
  }, [shell]);

  if (!shell) {
    return (
      <div className="ct-sub" style={{ padding: '4px' }}>
        {t('settings.update.installedOnly')}
      </div>
    );
  }

  const status = state?.status ?? 'idle';
  const busy = status === 'checking' || status === 'downloading';
  const supported = status !== 'unsupported';

  // The bar is indeterminate while checking, because a check reports no
  // progress — it either answers or it does not.
  const showBar = busy;
  const percent = status === 'downloading' ? (state?.percent ?? 0) : 0;

  function action() {
    if (!shell) return;

    if (status === 'ready') {
      void shell.installUpdate();
      return;
    }
    if (status === 'available' && !auto) {
      void shell.downloadUpdate().then(setState);
      return;
    }

    // Answer the click before the check does, or the button looks dead for as
    // long as the release host takes to reply.
    setState((current) => ({ ...(current ?? { status: 'idle', version: '' }), status: 'checking' }));
    void shell.checkUpdates().then(setState);
  }

  function actionLabel(): string {
    if (status === 'ready') return t('settings.update.restart');
    if (status === 'downloading')
      return t('settings.update.downloadingShort', { percent: state?.percent ?? 0 });
    if (status === 'checking') return t('settings.update.checkingShort');
    if (status === 'available' && !auto)
      return t('settings.update.download', { version: state?.candidate ?? '' });
    return t('settings.update.check');
  }

  return (
    <>
      <div className="upd-hero">
        <div className="upd-ver">BMF {state?.version || '—'}</div>
        <div className="upd-state">
          {state ? updateText(state, auto) : t('settings.update.reading')}
        </div>
        <div className={`upd-bar${showBar ? ' show' : ''}`}>
          <div
            className={`upd-fill${status === 'checking' ? ' indet' : ''}`}
            style={status === 'downloading' ? { width: `${percent}%` } : undefined}
          />
        </div>
      </div>

      {/* An update that installed and left the same version running is blocked
          from then on, so the app cannot loop on it. Saying so is the only way
          the user learns the update needs doing by hand. */}
      {state?.failedVersion && (
        <div className="msg-err">
          {t('settings.update.failedVersion', { version: state.failedVersion })}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, margin: '10px 0 4px' }}>
        <button
          className="lp-cta"
          style={{ height: 36, fontSize: 12.5 }}
          onClick={action}
          disabled={busy || !supported}
        >
          {actionLabel()}
        </button>
      </div>

      <div className="sp-div" />

      <Row label={t('settings.update.auto')} desc={t('settings.update.autoDesc')}>
        <div
          className={`tog${auto ? ' on' : ''}`}
          onClick={() => void shell.setAutoDownload(!auto).then(setAuto)}
        />
      </Row>

      {/* One release stream, two audiences: joining the beta only means
          pre-releases stop being filtered out. Leaving it moves nobody back — a
          tester stays on what they installed until a plain release overtakes it. */}
      <Row label={t('settings.update.beta')} desc={t('settings.update.betaDesc')}>
        <div
          className={`tog${beta ? ' on' : ''}`}
          onClick={() => void shell.setBetaChannel(!beta).then(setBeta)}
        />
      </Row>

      <Row label={t('settings.update.history')} desc={t('settings.update.historyDesc')}>
        <button className="sub-btn" onClick={() => setHistory((open) => !open)}>
          {history ? t('settings.update.hide') : t('settings.update.open')}
        </button>
      </Row>

      {history && <ReleaseHistory current={state?.version ?? ''} />}

      <div className="sp-div" />

      <Row label={t('settings.update.autostart')} desc={t('settings.update.autostartDesc')}>
        <div
          className={`tog${autostart ? ' on' : ''}`}
          onClick={() => void shell.setAutostart(!autostart).then(setAutostart)}
        />
      </Row>

      <div className="ct-sub" style={{ padding: '8px 4px' }}>
        {state?.checkedAt
          ? t('settings.update.lastCheck', {
              time: new Date(state.checkedAt).toLocaleTimeString('ru-RU', {
                hour: '2-digit',
                minute: '2-digit',
              }),
            })
          : t('settings.update.cadence')}
        <br />
        <br />
        {t('settings.update.tray')}
        <br />
        <br />
        {t('settings.update.smartScreen')}
      </div>
    </>
  );
}

function Keys() {
  return (
    <>
      <div className="ct-sub" style={{ padding: '0 4px 8px' }}>
        {t('settings.keys.note')}
      </div>
      {SHORTCUTS.map((shortcut) => (
        <div className="hk-row" key={shortcut.id}>
          <span className="hk-n">{t(shortcut.title)}</span>
          <div className="hk-k">
            {shortcut.combo.split('+').map((key) => (
              <span className="kbd" key={key}>
                {key}
              </span>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

function Sounds() {
  return (
    <>
      <div className="ct-sub" style={{ padding: '0 4px 10px' }}>
        {t('settings.sounds.note')}
      </div>
      {(
        [
          ['settings.sounds.setBmf', 'settings.sounds.setBmfDesc'],
          ['settings.sounds.setClassic', 'settings.sounds.setClassicDesc'],
          ['settings.sounds.setSoft', 'settings.sounds.setSoftDesc'],
          ['settings.sounds.setBright', 'settings.sounds.setBrightDesc'],
          ['settings.sounds.setMute', 'settings.sounds.setMuteDesc'],
        ] as [MessageKey, MessageKey][]
      ).map(([name, about]) => (
        <Row key={name} label={t(name)} desc={t(about)}>
          <button className="sub-btn" disabled title={t('settings.sounds.stage')}>
            {t('settings.sounds.pick')}
          </button>
        </Row>
      ))}
    </>
  );
}

function Language() {
  return (
    <>
      <Row label={t('settings.lang.language')} desc={t('settings.lang.languageDesc')}>
        <select className="sub-sel" defaultValue="ru">
          <option value="ru">{t('settings.lang.russian')}</option>
        </select>
      </Row>
      <div className="ct-sub" style={{ padding: '8px 4px' }}>
        {t('settings.lang.note')}
      </div>
    </>
  );
}

export function Settings({
  onClose,
  onOpenMarket,
  onEditStatus,
  initialScreen,
}: {
  onClose: () => void;
  onOpenMarket: () => void;
  onEditStatus: () => void;
  initialScreen?: Screen;
}) {
  const user = useApp((s) => s.user);
  const [screen, setScreen] = useState<Screen | null>(initialScreen ?? null);

  const open = MENU.find((item) => item.id === screen);

  function body(): ReactNode {
    switch (screen) {
      case 'account':
        return (
          <Account
            user={user}
            onEditStatus={() => {
              onClose();
              onEditStatus();
            }}
          />
        );
      case 'notif':
        return <Notifications />;
      case 'mailset':
        return <MailSettings />;
      case 'rules':
        return <MailRules />;
      case 'musicset':
        return <MusicSettings />;
      case 'ai':
        return <AiSettings />;
      case 'update':
        return <Updates />;
      case 'keys':
        return <Keys />;
      case 'sounds':
        return <Sounds />;
      case 'lang':
        return <Language />;
      case 'custom':
        return (
          <Customization
            onOpenMarket={() => {
              // Two stacked overlays would bury the one underneath, so the
              // prototype closes settings first.
              onClose();
              onOpenMarket();
            }}
          />
        );
      default:
        return null;
    }
  }

  return createPortal(
    <div className="sov show" onClick={onClose}>
      <div className="sp" onClick={(event) => event.stopPropagation()}>
        <div className="sp-close-row">
          <button className="sp-close" onClick={onClose} title={t('common.close')}>
            <IconClose />
          </button>
        </div>

        <div className="sp-head">
          <div className="sp-head-av">{(user?.username ?? '··').slice(0, 2).toUpperCase()}</div>
          <div className="sp-head-mid">
            <div className="sp-head-n">{user?.displayName ?? t('common.loading')}</div>
            <div className="sp-head-u">@{user?.username ?? ''}</div>
          </div>
        </div>

        <div className="sp-hdiv" />

        <div className="sp-body">
          <div className="sp-slbl">{t('settings.title')}</div>

          {MENU.filter((item) => item.id !== 'custom').map((item) => (
            <div className="sp-item" key={item.id} onClick={() => setScreen(item.id)}>
              <div className="sp-icon" style={{ background: item.tint[0], color: item.tint[1] }}>
                {item.icon}
              </div>
              <div className="sp-item-info">
                <div className="sp-item-title">{t(item.title)}</div>
                <div className="sp-item-desc">{t(item.desc)}</div>
              </div>
              <div className="sp-chev">
                <IconChevron />
              </div>
            </div>
          ))}

          <div className="sp-div" />
          <div className="sp-slbl">{t('settings.appearanceGroup')}</div>

          {MENU.filter((item) => item.id === 'custom').map((item) => (
            <div className="sp-item" key={item.id} onClick={() => setScreen(item.id)}>
              <div className="sp-icon" style={{ background: item.tint[0], color: item.tint[1] }}>
                {item.icon}
              </div>
              <div className="sp-item-info">
                <div className="sp-item-title">{t(item.title)}</div>
                <div className="sp-item-desc">{t(item.desc)}</div>
              </div>
              <div className="sp-chev">
                <IconChevron />
              </div>
            </div>
          ))}
        </div>

        {/* Sub-screens slide in over the menu, exactly as the prototype does. */}
        <div className={`sub-panel${screen ? ' show' : ''}`}>
          <div className="sub-header">
            <button className="sub-back" onClick={() => setScreen(null)} title={t('common.back')}>
              <IconBack />
            </button>
            <div className="sub-title">{open ? t(open.title) : ''}</div>
          </div>
          <div className="sub-body">{body()}</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export type { Screen as SettingsScreen };
