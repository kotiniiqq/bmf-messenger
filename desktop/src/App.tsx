import { useEffect, useState } from 'react';
import { loadSession } from './api/client.js';
import { useApp } from './store/app.js';
import { useTheme } from './theme.js';
import { Auth } from './screens/Auth.js';
import { ChatsSidebar, ChatView } from './screens/Messenger.js';
import { MailSidebar, MailView, mailUnreadCount, type MailFolder } from './screens/Mail.js';
import { MusicSidebar, MusicView, type MusicList } from './screens/Music.js';
import { Notes } from './screens/Notes.js';
import { Settings, type SettingsScreen } from './screens/Settings.js';
import { Nav, type Section } from './components/Nav.js';
import { CallPill } from './components/CallPill.js';
import { Calls } from './components/Calls.js';
import { IncomingCall } from './components/IncomingCall.js';
import { CheatSheet } from './components/CheatSheet.js';
import { CommandPalette } from './components/CommandPalette.js';
import { Contacts } from './components/Contacts.js';
import { CreateChat } from './components/CreateChat.js';
import { Drawer, type DrawerAction } from './components/Drawer.js';
import { Market } from './components/Market.js';
import { NowPlaying } from './components/NowPlaying.js';
import { Pill } from './components/Pill.js';
import { Profile } from './components/Profile.js';
import { ResetBanner } from './components/ResetBanner.js';
import { StatusPicker } from './components/StatusPicker.js';
import { Toaster } from './components/Toast.js';
import { WindowControls } from './components/WindowControls.js';
import { IconLogo } from './components/icons.js';
import { t } from './i18n/index.js';
import { comboOf } from './shortcuts.js';
import { usePlayer } from './player.js';
import { getTheme, patchTheme } from './theme.js';

/**
 * The prototype's shell: a title bar carrying the logo, the `.dock` and the
 * player slot, then `.body` holding `.rail`, `.sdb` and `.main`. All three
 * navigation slots are always rendered — `#app.nav-*` decides which one shows,
 * so switching the layout stays a CSS change and nothing remounts.
 */
export function App() {
  const loading = useApp((s) => s.loading);
  const chats = useApp((s) => s.chats);
  const user = useApp((s) => s.user);
  const bootstrap = useApp((s) => s.bootstrap);

  const theme = useTheme();

  const [section, setSection] = useState<Section>('chats');
  const [drawer, setDrawer] = useState(false);
  const [settings, setSettings] = useState<{ screen?: SettingsScreen } | null>(null);
  /** Whether the panel now open was reached from settings, and so has a way back. */
  const [cameFromSettings, setCameFromSettings] = useState(false);
  const [market, setMarket] = useState(false);
  const [nowPlaying, setNowPlaying] = useState(false);
  const [palette, setPalette] = useState(false);
  const [cheat, setCheat] = useState(false);
  // One overlay at a time, the way the prototype's single `.lp` behaves.
  const [panel, setPanel] = useState<DrawerAction | null>(null);

  // Mail and music are mocks; their state lives here so switching sections does
  // not reset the folder the user was looking at.
  const [mailFolder, setMailFolder] = useState<MailFolder>('inbox');
  const [mailRead, setMailRead] = useState<Set<number>>(() => new Set());
  const [musicList, setMusicList] = useState<MusicList>('all');

  const activeCall = useApp((s) => s.activeCall);
  const incomingCall = useApp((s) => s.incomingCall);
  const dismissIncoming = useApp((s) => s.dismissIncoming);
  // The call has its own window; while that window is open the pill would be a
  // second copy of the same thing, so the shell tells us which it is.
  const [callWindowOpen, setCallWindowOpen] = useState(false);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => window.bmf?.onCallWindow((s) => setCallWindowOpen(s.open)), []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        !!target && (/^(INPUT|TEXTAREA)$/.test(target.tagName) || target.isContentEditable);

      if (event.key === 'Escape') {
        setPalette(false);
        setCheat(false);
        setNowPlaying(false);
        setMarket(false);
        setDrawer(false);
        setPanel(null);
        setSettings(null);
        return;
      }

      // A bare "?" would fight with typing one.
      if (!typing && event.key === '?') {
        event.preventDefault();
        setCheat(true);
        return;
      }

      switch (comboOf(event)) {
        case 'Ctrl+K':
          event.preventDefault();
          setPalette(true);
          break;
        case 'Ctrl+1':
          event.preventDefault();
          setSection('chats');
          break;
        case 'Ctrl+2':
          event.preventDefault();
          setSection('mail');
          break;
        case 'Ctrl+3':
          event.preventDefault();
          setSection('music');
          break;
        case 'Ctrl+,':
          event.preventDefault();
          setSettings({});
          break;
        case 'Ctrl+Shift+D':
          event.preventDefault();
          patchTheme({ mode: getTheme().mode === 'dark' ? 'light' : 'dark' });
          break;
        case 'Ctrl+Shift+P':
          event.preventDefault();
          usePlayer.getState().toggle();
          break;
        case 'Ctrl+Shift+.':
          event.preventDefault();
          usePlayer.getState().next();
          break;
        case 'Ctrl+Shift+,':
          event.preventDefault();
          usePlayer.getState().previous();
          break;
        default:
          break;
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (loading) return <div className="auth">{t('common.loading')}</div>;
  if (!loadSession()) return <Auth />;

  // A call is folded into the title bar only while its own window is closed, and
  // the title bar has to know as much: two pills and three window buttons are
  // more than the row fits, so the layout gives way differently when both are up.
  const foldedCall = activeCall && !callWindowOpen ? activeCall : null;

  const unread = chats.reduce((sum, chat) => sum + chat.unreadCount, 0);
  const initial = (user?.displayName || user?.username || '·').trim()[0]?.toUpperCase() ?? '·';

  // A section the user switched off must not stay on screen either, or the way
  // back to it disappears with the button.
  const shown: Section =
    section !== 'chats' && !theme.sections[section] ? 'chats' : section;

  const nav = {
    section: shown,
    onSelect: setSection,
    onMenu: () => setDrawer(true),
    onProfile: () => {
      setCameFromSettings(false);
      setPanel('profile');
    },
    visible: theme.sections,
    badges: { chats: unread, mail: mailUnreadCount(mailRead) },
    initial,
  };

  function runDrawerAction(action: DrawerAction) {
    if (action === 'updates') setSettings({ screen: 'update' });
    else if (action === 'settings') setSettings({});
    else setPanel(action);
  }

  return (
    <div id="app" className={`nav-${theme.layout}`}>
      <div className="tbar">
        <div className="tbar-left">
          <div className="app-logo">
            <IconLogo />
            <span>BMF</span>
          </div>
        </div>

        <div className="dock">
          <Nav place="top" {...nav} />
        </div>

        <div className={`tbar-right${foldedCall ? ' with-call' : ''}`}>
          {foldedCall && (
            <CallPill call={foldedCall} onOpen={() => window.bmf?.openCall(foldedCall.id)} />
          )}
          <Pill onOpen={() => setNowPlaying(true)} />
          <WindowControls />
        </div>
      </div>

      <div className="body">
        <div className="rail">
          <Nav place="rail" {...nav} />
        </div>

        <div className="sdb">
          <div key={shown} className="side-in" style={SIDEBAR_FILL}>
            {shown === 'chats' ? (
              <ChatsSidebar />
            ) : shown === 'mail' ? (
              <MailSidebar folder={mailFolder} onFolder={setMailFolder} read={mailRead} />
            ) : shown === 'music' ? (
              <MusicSidebar list={musicList} onList={setMusicList} />
            ) : null}
          </div>

          <div className="sdb-dock">
            <Nav place="bottom" {...nav} />
          </div>
        </div>

        <div className="main">
          <div key={shown} className="view-in" style={SIDEBAR_FILL}>
            {shown === 'chats' ? (
              <ChatView />
            ) : shown === 'mail' ? (
              <MailView
                folder={mailFolder}
                read={mailRead}
                onRead={(id) => setMailRead((prev) => new Set(prev).add(id))}
              />
            ) : shown === 'music' ? (
              <MusicView list={musicList} />
            ) : (
              <Notes />
            )}
          </div>
        </div>
      </div>

      {drawer && (
        <Drawer user={user} onClose={() => setDrawer(false)} onAction={runDrawerAction} />
      )}

      {panel === 'contacts' && <Contacts onClose={() => setPanel(null)} />}
      {panel === 'calls' && <Calls onClose={() => setPanel(null)} />}
      {(panel === 'group' || panel === 'channel') && (
        <CreateChat kind={panel} onClose={() => setPanel(null)} />
      )}
      {panel === 'profile' && user && (
        <Profile
          user={user}
          onClose={() => setPanel(null)}
          onEditStatus={() => setPanel('status')}
        />
      )}
      {panel === 'status' && user && (
        <StatusPicker
          user={user}
          onClose={() => setPanel(null)}
          // Reached from the account screen, closing used to drop the person
          // out of settings entirely with no way back (defect #19).
          onBack={
            cameFromSettings
              ? () => {
                  setPanel(null);
                  setSettings({ screen: 'account' });
                }
              : undefined
          }
        />
      )}

      {settings && (
        <Settings
          initialScreen={settings.screen}
          onClose={() => setSettings(null)}
          onOpenMarket={() => setMarket(true)}
          onEditStatus={() => {
            setCameFromSettings(true);
            setPanel('status');
          }}
        />
      )}
      {market && <Market onClose={() => setMarket(false)} />}
      {nowPlaying && <NowPlaying onClose={() => setNowPlaying(false)} />}
      {palette && (
        <CommandPalette
          onClose={() => setPalette(false)}
          onSection={setSection}
          onOpenSettings={() => setSettings({ screen: 'custom' })}
        />
      )}
      {cheat && <CheatSheet onClose={() => setCheat(false)} />}

      {incomingCall && (
        <IncomingCall
          call={incomingCall}
          onAnswer={() => {
            // The window joins the call itself — it has the same session.
            window.bmf?.openCall(incomingCall.id);
            dismissIncoming();
          }}
          onDismiss={dismissIncoming}
        />
      )}

      <ResetBanner />
      <Toaster />
    </div>
  );
}

/**
 * The prototype puts the section views directly inside `.sdb` and `.main`; the
 * extra wrapper here exists only to replay `.side-in` / `.view-in` on switch, so
 * it has to pass the flex sizing straight through.
 */
const SIDEBAR_FILL = {
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minHeight: 0,
} as const;
