import {
  app,
  BrowserWindow,
  Menu,
  Notification,
  Tray,
  desktopCapturer,
  globalShortcut,
  nativeImage,
  powerMonitor,
  protocol,
  screen,
  shell,
  ipcMain,
} from 'electron';
import { autoUpdater } from 'electron-updater';
import { existsSync, renameSync, rmdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import {
  acceptCandidate,
  blankMemory,
  readMemory,
  readReleases,
  reconcile,
  rememberPending,
  updateSupport,
  type ReleaseNote,
  type UpdateMemory,
  type UpdateState,
} from './updates.js';
import type { ShareCapabilities, ShareChoice, ShareSource } from './share.js';
import * as e2e from './e2e.js';

// The main process is bundled to CommonJS, so __dirname is the portable choice.
const here = __dirname;

/**
 * Set only by `npm run dev`. Keying off `app.isPackaged` instead would send an
 * unpackaged-but-built app to a dev server that is not running.
 */
// An empty string is not a URL: treated as set, it made loadURL fail with
// ERR_INVALID_URL instead of falling back to the bundled renderer.
const devServerUrl = process.env.VITE_DEV_SERVER_URL || undefined;

/**
 * The renderer is served from bmf://app rather than file://. A file:// page
 * sends "Origin: null" on every request, which the API cannot allowlist without
 * also trusting every other sandboxed document on the machine.
 */
const SCHEME = 'bmf';

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

function serveRenderer(): void {
  const root = join(here, '../dist');

  protocol.handle(SCHEME, async (request) => {
    const { pathname } = new URL(request.url);
    const relative = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));
    const target = normalize(join(root, relative));

    // Refuse anything that climbs out of the bundle directory.
    if (!target.startsWith(root)) {
      return new Response('Forbidden', { status: 403 });
    }

    try {
      // Read the file rather than net.fetch(file://): inside an asar archive the
      // file: scheme is not reliably resolvable, and a packaged build would then
      // show an empty window with no explanation.
      const body = await readFile(target);
      return new Response(body, {
        headers: { 'content-type': MIME[extname(target).toLowerCase()] ?? 'application/octet-stream' },
      });
    } catch (err) {
      console.error('renderer asset missing:', target, err);
      return new Response('Not found', { status: 404 });
    }
  });
}

let window: BrowserWindow | null = null;
let callWindow: BrowserWindow | null = null;
/** The floating controls shown while a screen is being shared. */
let shareBar: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;

/**
 * The surface the renderer's picker settled on, waiting for the
 * `getDisplayMedia` call that follows it. One pending choice at a time: the
 * picker is modal, and a stale one left behind would silently share the wrong
 * window on the next attempt.
 */
let pendingShare: ShareChoice | null = null;

/** Sent as a source id when the Wayland portal is the one doing the choosing. */
const PORTAL_SOURCE = 'portal:wayland';

/** Wayland shows its own surface picker; ours would be a list it may ignore. */
function usesPortal(): boolean {
  return (
    process.platform === 'linux' &&
    (process.env.XDG_SESSION_TYPE === 'wayland' || Boolean(process.env.WAYLAND_DISPLAY))
  );
}

/**
 * Electron names the data directory after the package, and this one is called
 * `@bmf/desktop` — so sessions, settings and the updater's own state used to
 * live in `%APPDATA%\@bmf\desktop`, a path that means nothing to the person
 * whose data it is.
 *
 * Renaming it costs one move now and a migration of every live install later,
 * which is why it happens before the beta rather than after. Anyone already
 * running a build keeps their session: the old directory is moved, not ignored.
 */
function useProductDataDirectory(): void {
  app.setName('BMF Messenger');

  // An explicit path wins. `--user-data-dir` is how a second profile is run —
  // for testing a call between two accounts, or for keeping work and personal
  // accounts apart — and overriding it would make the flag silently useless.
  if (process.argv.some((arg) => arg.startsWith('--user-data-dir'))) return;

  // Built by hand rather than read from getPath('userData'): that call creates
  // the directory as a side effect, and a target that always exists turns the
  // check below into "never migrate".
  const appData = app.getPath('appData');
  const target = join(appData, 'BMF Messenger');
  const legacyScope = join(appData, '@bmf');
  const legacy = join(legacyScope, 'desktop');

  if (existsSync(legacy) && !existsSync(target)) {
    try {
      renameSync(legacy, target);
      // Only ever held the one directory; leaving it would be litter.
      rmdirSync(legacyScope);
    } catch (err) {
      // Losing the move costs a sign-in, not the app: it starts on an empty
      // directory rather than refusing to run.
      console.error('could not move the data directory:', err);
    }
  }

  app.setPath('userData', target);
}

// Before anything reads a path — the single-instance lock is a file inside it.
useProductDataDirectory();

/** Only one copy may run; a second launch focuses the first (spec stage 2). */
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 600,
    show: false,
    backgroundColor: '#e9ecf8',
    title: 'BMF Messenger',
    // Windows takes the icon from the executable, Linux from the window itself —
    // without this the taskbar there shows Electron's own default.
    icon: ICON_PATH,
    // The prototype draws its own title bar: `.tbar` carries the logo, the
    // navigation and the three window buttons. A system frame on top of it
    // would be a second, taller header belonging to a different application.
    frame: false,
    webPreferences: {
      preload: join(here, 'preload.cjs'),
      // Hard rule from CONTRIBUTING.md: the renderer never gets Node.
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  win.once('ready-to-show', () => win.show());

  // A blank window with no message is the least debuggable failure there is.
  win.webContents.on('did-fail-load', (_event, code, description, url) => {
    console.error(`failed to load ${url}: ${description} (${code})`);
    void win.webContents.executeJavaScript(
      `document.body.innerHTML = '<pre style="padding:24px;font:13px monospace;white-space:pre-wrap">` +
        `Не удалось загрузить интерфейс.\n\n${description} (${code})\n${url}</pre>'`,
    ).catch(() => undefined);
  });

  win.webContents.on('render-process-gone', (_event, details) =>
    console.error('renderer gone:', details.reason),
  );

  // Closing hides to tray instead of quitting, so notifications keep working.
  win.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    win.hide();
  });

  // External links open in the real browser, never inside the app shell.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  void win.loadURL(devServerUrl ?? `${SCHEME}://app/`);

  return win;
}

function show(): void {
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

/**
 * The call lives in its own window, the way it does in Telegram: the messenger
 * stays usable underneath, and the call can sit on top of other applications.
 *
 * Closing that window does not end the call — it hides it, and the main window
 * grows a pill. The media session lives in this renderer, so destroying the
 * window would drop the call; hiding keeps audio flowing while the person reads
 * something else.
 */
function openCallWindow(callId: string): void {
  if (callWindow && !callWindow.isDestroyed()) {
    callWindow.show();
    callWindow.focus();
    window?.webContents.send('call:window', { open: true, callId });
    return;
  }

  const win = new BrowserWindow({
    width: 900,
    height: 620,
    minWidth: 480,
    minHeight: 360,
    show: false,
    frame: false,
    backgroundColor: '#11121a',
    title: 'BMF — звонок',
    icon: ICON_PATH,
    webPreferences: {
      preload: join(here, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      // A hidden window is throttled to about one frame a second by default,
      // which stalls the timers driving the call — including the one that
      // notices the other side hung up.
      backgroundThrottling: false,
    },
  });

  callWindow = win;
  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });

  win.on('close', (event) => {
    // Only a real quit or the call actually ending destroys this window.
    if (quitting) return;
    event.preventDefault();
    win.hide();
  });

  /**
   * The pill in the main window follows visibility, and visibility changes by
   * more than one route: the red circle, the close button and `call:hide` all
   * end in hide() without ever raising 'close'. Reporting from 'close' alone
   * meant the window vanished and no pill took its place.
   */
  win.on('hide', () => window?.webContents.send('call:window', { open: false, callId }));
  win.on('show', () => window?.webContents.send('call:window', { open: true, callId }));

  win.on('closed', () => {
    callWindow = null;
  });

  /**
   * A call needs the microphone and the camera; nothing else is granted. Left
   * unanswered, Electron's default is to refuse, and the failure surfaces as a
   * generic media error with no hint that permission was the problem.
   */
  win.webContents.session.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(permission === 'media');
  });

  /**
   * Screen sharing. In a browser `getDisplayMedia` shows the picker itself; in
   * Electron nothing happens unless the main process answers the request, so
   * without this the share button silently does nothing at all.
   *
   * The renderer picks the source and decides about audio before it ever calls
   * `getDisplayMedia`; this handler only honours that choice. Electron's own
   * `useSystemPicker` is macOS 15+ only, so on the two platforms we ship it left
   * this handler choosing the first screen for everybody — no way to share a
   * single window, and no way to share without the sound of the machine.
   */
  win.webContents.session.setDisplayMediaRequestHandler((_request, callback) => {
    const choice = pendingShare;
    pendingShare = null;

    void desktopCapturer
      .getSources({ types: ['screen', 'window'] })
      .then((sources) => {
        const source =
          sources.find((candidate) => candidate.id === choice?.sourceId) ??
          // Under the Wayland portal the id is decided by the portal dialog and
          // cannot be known in advance, so the renderer sends this sentinel and
          // whatever the portal handed back is the thing to share.
          (choice?.sourceId === PORTAL_SOURCE ? sources[0] : undefined);

        if (!source) {
          // Nothing to share — refuse rather than hand back a broken stream.
          callback({ video: undefined });
          return;
        }

        callback({ video: source, audio: choice?.audio ? 'loopback' : undefined });
      })
      .catch(() => callback({ video: undefined }));
  });

  const base = devServerUrl ?? `${SCHEME}://app/`;
  void win.loadURL(`${base}${base.includes('?') ? '&' : '?'}call=${encodeURIComponent(callId)}`);

  window?.webContents.send('call:window', { open: true, callId });
}

/**
 * The block that floats over whatever is being shared.
 *
 * While someone shares their screen the call window is usually behind the thing
 * they are showing, so the controls have to leave it — the spec asks for a
 * compact draggable block, and this is it: always on top, out of the taskbar,
 * and moved by dragging the block itself.
 *
 * It is deliberately small and holds only the three decisions that cannot wait:
 * mute, stop showing, hang up.
 */
function openShareBar(callId: string): void {
  if (shareBar && !shareBar.isDestroyed()) {
    shareBar.showInactive();
    return;
  }

  const win = new BrowserWindow({
    width: 208,
    height: 52,
    show: false,
    frame: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#11121a',
    title: 'BMF — демонстрация',
    webPreferences: {
      preload: join(here, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  shareBar = win;
  // Above full-screen applications too: a presentation is exactly when this is
  // needed, and a normal always-on-top window loses to one.
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  const area = screen.getPrimaryDisplay().workArea;
  win.setPosition(Math.round(area.x + area.width / 2 - 104), area.y + 18);

  // showInactive: taking focus away from what is being demonstrated is the one
  // thing this window must never do.
  win.once('ready-to-show', () => win.showInactive());
  win.on('closed', () => {
    shareBar = null;
  });

  const base = devServerUrl ?? `${SCHEME}://app/`;
  void win.loadURL(
    `${base}${base.includes('?') ? '&' : '?'}share-bar=${encodeURIComponent(callId)}`,
  );
}

function closeShareBar(): void {
  if (!shareBar || shareBar.isDestroyed()) return;

  const win = shareBar;
  shareBar = null;
  win.destroy();
}

/** The call is over: the window has nothing left to show. */
function destroyCallWindow(): void {
  closeShareBar();
  if (!callWindow || callWindow.isDestroyed()) return;

  const win = callWindow;
  callWindow = null;
  win.destroy();
  window?.webContents.send('call:window', { open: false, callId: null });
}

/** The product's own icon, copied next to the bundle by the build script. */
const ICON_PATH = join(here, 'icon.png');

function appIcon(): Electron.NativeImage {
  return nativeImage.createFromPath(ICON_PATH);
}

function createTray(): void {
  // Resized here rather than shipped at tray size: one file stays the source of
  // truth, and Windows and Linux disagree about what that size should be.
  const full = appIcon();
  const icon = full.isEmpty()
    ? full
    : full.resize({ width: 16, height: 16, quality: 'best' });

  tray = new Tray(icon);
  tray.setToolTip('BMF Messenger');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Открыть', click: show },
      { type: 'separator' },
      {
        label: 'Выход',
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on('click', show);
}

/**
 * Notifications only fire when the window is not the one the user is looking at.
 * Alerting about a message that is already on screen trains people to ignore them.
 */
function notify(title: string, body: string): void {
  if (!Notification.isSupported()) return;
  if (window?.isVisible() && window.isFocused()) return;

  const notification = new Notification({ title, body, silent: false, icon: appIcon() });
  notification.on('click', show);
  notification.show();
}

function registerShortcuts(): void {
  // Quick reply: bring the window forward from anywhere.
  globalShortcut.register('CommandOrControl+Shift+B', show);

  // Needed to diagnose a packaged build; there is no other way to see the
  // renderer's console once the app is installed.
  globalShortcut.register('CommandOrControl+Shift+I', () =>
    window?.webContents.toggleDevTools(),
  );

  // Hard rule 9: the appearance reset also works when the window is not focused,
  // and it is registered by the shell rather than the page, so no theme can
  // intercept it.
  globalShortcut.register('CommandOrControl+Alt+R', () => {
    show();
    window?.webContents.send('reset-appearance');
  });
}

/** Where a build that cannot update itself sends the user instead. */
const RELEASES_URL = 'https://github.com/bmf-messenger/bmf-releases/releases';

/** The same releases as data, for the history the app shows itself. */
const RELEASES_API = 'https://api.github.com/repos/bmf-messenger/bmf-releases/releases?per_page=20';

let updateState: UpdateState = { status: 'idle', version: '0.0.0' };
let updateMemory: UpdateMemory = blankMemory();
let autoDownload = true;
/** Whether pre-releases count as updates. Off is the plain release channel. */
let betaChannel = false;
let releaseHistory: ReleaseNote[] = [];
/** Epoch ms of the last successful fetch, so the panel can say how old it is. */
let releasesFetchedAt: number | undefined;
let updateStorePath = '';

/**
 * The updater's own memory: what it last handed to the installer, and which
 * versions turned out not to install at all. Kept in userData rather than in
 * the renderer, because the decision it feeds happens before any window exists.
 */
async function loadUpdateStore(): Promise<void> {
  updateStorePath = join(app.getPath('userData'), 'updates.json');

  try {
    const raw = JSON.parse(await readFile(updateStorePath, 'utf8')) as Record<string, unknown>;
    updateMemory = readMemory(raw.memory);
    autoDownload = raw.autoDownload !== false;
    betaChannel = raw.betaChannel === true;
    releaseHistory = readReleases(raw.releases);
    releasesFetchedAt = typeof raw.releasesFetchedAt === 'number' ? raw.releasesFetchedAt : undefined;
  } catch {
    // No file yet, or an unreadable one. Either way the defaults are correct.
    updateMemory = blankMemory();
    autoDownload = true;
    betaChannel = false;
    releaseHistory = [];
    releasesFetchedAt = undefined;
  }
}

async function saveUpdateStore(): Promise<void> {
  try {
    await writeFile(
      updateStorePath,
      JSON.stringify({
        memory: updateMemory,
        autoDownload,
        betaChannel,
        releases: releaseHistory,
        releasesFetchedAt,
      }),
      'utf8',
    );
  } catch (err) {
    // Losing the file costs one redundant download, not correctness.
    console.error('could not write update state:', err);
  }
}

/**
 * Fetches the published releases so the app can show its own history instead of
 * sending the user to a browser (defect #13).
 *
 * The list is public, so no token is involved — and it must stay that way: the
 * client has no credentials for anything on GitHub, by design. The last good
 * answer is kept in the store, which is what makes the panel work on a machine
 * that is offline right now and read the list yesterday.
 */
async function fetchReleases(): Promise<ReleaseNote[]> {
  try {
    const response = await fetch(RELEASES_API, {
      headers: { accept: 'application/vnd.github+json' },
      // A history panel is not worth a hung request; the cache answers instead.
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`releases: HTTP ${response.status}`);

    const releases = readReleases(await response.json());
    // An empty answer is not an answer: keeping yesterday's list beats replacing
    // it with nothing because a proxy returned something unexpected.
    if (!releases.length) return releaseHistory;

    releaseHistory = releases;
    releasesFetchedAt = Date.now();
    await saveUpdateStore();
  } catch (err) {
    console.error('could not read release history:', err instanceof Error ? err.message : err);
  }

  return releaseHistory;
}

function pushUpdateState(patch: Partial<UpdateState>): void {
  updateState = { ...updateState, ...patch };
  window?.webContents.send('update:state', updateState);
}

async function checkForUpdates(): Promise<UpdateState> {
  // Checking again mid-download would restart the transfer for no gain.
  if (['unsupported', 'checking', 'downloading', 'ready'].includes(updateState.status)) {
    return updateState;
  }

  try {
    await autoUpdater.checkForUpdates();
  } catch {
    // The 'error' event has already recorded this. A failed check must never
    // take the app down with it.
  }

  return updateState;
}

async function configureUpdates(): Promise<void> {
  const version = app.getVersion();
  updateState = { status: 'idle', version };

  const support = updateSupport({
    platform: process.platform,
    packaged: app.isPackaged && !devServerUrl,
    portableDir: process.env.PORTABLE_EXECUTABLE_DIR,
    appImage: process.env.APPIMAGE,
  });

  if (!support.supported) {
    updateState = { status: 'unsupported', version, reason: support.reason };
    return;
  }

  await loadUpdateStore();

  // Decide the fate of the previous install before anything can look for a new
  // one: if it left the same version running, that version must not come back.
  const settled = reconcile(version, updateMemory);
  updateMemory = settled.memory;
  if (settled.failed) {
    console.error(`update ${settled.failed} installed but ${version} is still running`);
    updateState = { ...updateState, failedVersion: settled.failed };
  }
  await saveUpdateStore();

  // Updates come from the public releases repo (electron-builder.yml). Pointing
  // this at the private monorepo would mean shipping a token inside the client.
  //
  // autoDownload is off because the updater must not be the one deciding: it
  // trusts whatever version the release metadata claims, and a release published
  // with a stale latest.yml is then "newer" on every single check. The gate
  // below is the app's own answer to that.
  autoUpdater.autoDownload = false;
  autoUpdater.allowDowngrade = false;
  // The beta channel is the same repository, pre-releases included: one release
  // stream, two audiences. Turning it off does not move anybody back — the app
  // simply stops being offered pre-releases, and a tester already running one
  // stays there until a plain release overtakes it.
  autoUpdater.allowPrerelease = betaChannel;
  // Applying a downloaded update on a plain quit is what makes an update feel
  // like a restart rather than an installation.
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => pushUpdateState({ status: 'checking' }));

  autoUpdater.on('update-available', (info) => {
    const verdict = acceptCandidate(
      version,
      info.version,
      updateMemory,
      betaChannel ? 'beta' : 'release',
    );

    if (!verdict.accept) {
      console.error(`ignoring offered update ${info.version}: ${verdict.reason}`);
      pushUpdateState({ status: 'none', candidate: undefined, checkedAt: Date.now() });
      return;
    }

    pushUpdateState({ status: 'available', candidate: info.version, checkedAt: Date.now() });
    if (autoDownload) void autoUpdater.downloadUpdate().catch(() => undefined);
  });

  autoUpdater.on('update-not-available', () =>
    pushUpdateState({ status: 'none', candidate: undefined, checkedAt: Date.now() }),
  );

  autoUpdater.on('download-progress', (progress) =>
    pushUpdateState({ status: 'downloading', percent: Math.round(progress.percent) }),
  );

  autoUpdater.on('update-downloaded', (info) => {
    // Written before the install rather than when the button is pressed: the
    // update also applies on a normal quit, and that path has no button.
    updateMemory = rememberPending(info.version, updateMemory);
    void saveUpdateStore();

    pushUpdateState({ status: 'ready', candidate: info.version, percent: 100 });
    notify('Обновление готово', `Версия ${info.version} установится при перезапуске.`);
  });

  autoUpdater.on('error', (err) => {
    console.error('update check failed:', err.message);
    pushUpdateState({ status: 'error', error: err.message });
  });

  void checkForUpdates();
  // Once a day is plenty for a beta and keeps the release host untroubled.
  setInterval(() => void checkForUpdates(), 24 * 60 * 60 * 1000);
}

app.on('second-instance', show);

app.whenReady().then(() => {
  // Electron installs a File/Edit/View/Window/Help bar when an app defines no
  // menu of its own. The prototype has no menu bar and the shell's own chrome is
  // the dock, so the default one is someone else's application showing through.
  Menu.setApplicationMenu(null);

  if (!devServerUrl) serveRenderer();
  window = createWindow();
  createTray();
  registerShortcuts();
  void configureUpdates();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) window = createWindow();
  });
});

app.on('before-quit', () => {
  quitting = true;
});

app.on('will-quit', () => globalShortcut.unregisterAll());

// The renderer cannot count unread messages for the tray by itself.
ipcMain.on('unread-count', (_event, count: number) => {
  if (typeof count !== 'number') return;
  tray?.setToolTip(count > 0 ? `BMF Messenger — ${count} непрочитанных` : 'BMF Messenger');
  if (process.platform === 'win32') window?.setOverlayIcon(null, count > 0 ? String(count) : '');
});

ipcMain.on('show-window', show);

// The window buttons live in the renderer's own title bar, so the shell has to
// expose what a system frame would have done by itself.
ipcMain.on('window:minimize', () => window?.minimize());

ipcMain.on('window:toggle-maximize', () => {
  if (!window) return;
  if (window.isMaximized()) window.unmaximize();
  else window.maximize();
});

// Closing hides to tray — the same thing the window's own close does, and what
// the prototype's red button is labelled with.
ipcMain.on('window:close', () => window?.hide());

// The call window's own buttons. It is a different window, so it cannot reuse
// the handlers above — those always mean the main window.
ipcMain.on('call:open', (_event, callId: unknown) => {
  if (typeof callId === 'string' && callId) openCallWindow(callId);
});

ipcMain.on('call:minimize', () => callWindow?.hide());

ipcMain.on('call:maximize', () => {
  if (!callWindow) return;
  if (callWindow.isMaximized()) callWindow.unmaximize();
  else callWindow.maximize();
});

/** Hiding, not ending: the pill in the main window is how it comes back. */
ipcMain.on('call:hide', () => callWindow?.hide());

ipcMain.on('call:ended', destroyCallWindow);

/**
 * Forwards between the two windows. They share an origin and a session, so each
 * talks to the API itself — what they cannot do is notice each other, and a call
 * answered in one has to stop ringing in the other.
 */
ipcMain.on('call:sync', (_event, payload: unknown) => {
  window?.webContents.send('call:sync', payload);
  if (callWindow && !callWindow.isDestroyed()) callWindow.webContents.send('call:sync', payload);
});

/**
 * The screen-share picker.
 *
 * `getSources` is asked for thumbnails because a list of window titles is not
 * enough to tell two editors apart. Under Wayland this call opens the portal
 * dialog, so the renderer is told to skip the grid entirely rather than pop the
 * system dialog just to draw a preview nobody asked for yet.
 */
ipcMain.handle('screen:sources', async (): Promise<ShareSource[]> => {
  if (usesPortal()) return [];

  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 320, height: 180 },
  });

  return sources.map((source) => ({
    id: source.id,
    name: source.name,
    kind: source.id.startsWith('screen:') ? 'screen' : 'window',
    thumbnail: source.thumbnail.isEmpty() ? null : source.thumbnail.toDataURL(),
  }));
});

ipcMain.handle('screen:capabilities', (): ShareCapabilities => ({
  portal: usesPortal(),
  loopbackAudio: process.platform === 'win32',
  portalSource: PORTAL_SOURCE,
}));

/**
 * The floating block and the call window talking past each other.
 *
 * They are two renderers of the same bundle with no way to reach one another,
 * so the commands go up here and back down: the block presses, the call window
 * acts and reports what the state became, the block redraws. Only the call
 * window owns the media session — the block owns nothing at all.
 */
ipcMain.on('share-bar:show', (_event, callId: unknown) => {
  if (typeof callId !== 'string' || !callId) return;
  openShareBar(callId);
});

ipcMain.on('share-bar:hide', closeShareBar);

ipcMain.on('share-bar:command', (_event, command: unknown) => {
  if (typeof command !== 'string') return;
  if (callWindow && !callWindow.isDestroyed()) {
    callWindow.webContents.send('share-bar:command', command);
  }
});

ipcMain.on('share-bar:state', (_event, state: unknown) => {
  if (shareBar && !shareBar.isDestroyed()) shareBar.webContents.send('share-bar:state', state);
});

ipcMain.handle('screen:choose', (_event, choice: unknown): boolean => {
  const candidate = choice as Partial<ShareChoice> | null;
  if (!candidate || typeof candidate.sourceId !== 'string') {
    pendingShare = null;
    return false;
  }

  pendingShare = { sourceId: candidate.sourceId, audio: candidate.audio === true };
  return true;
});

/**
 * The privacy mode's cryptography.
 *
 * Every one of these hands the renderer a result and never a key. The account
 * key names whose material to load — one identity per account per machine, so
 * signing in as somebody else does not inherit the previous person's sessions.
 */
ipcMain.handle('e2e:keys', async (_event, accountKey: unknown) => {
  if (typeof accountKey !== 'string' || !accountKey) throw new Error('accountKey required');
  return e2e.publishableKeys(accountKey);
});

ipcMain.handle('e2e:start-session', async (_event, input: unknown) => {
  const { accountKey, localDeviceId, bundle } = input as {
    accountKey: string;
    localDeviceId: string;
    bundle: e2e.RemoteBundle;
  };
  await e2e.startSession(accountKey, localDeviceId, bundle);
  return true;
});

ipcMain.handle('e2e:has-session', async (_event, input: unknown) => {
  const { accountKey, peerDeviceId } = input as { accountKey: string; peerDeviceId: string };
  return e2e.hasSession(accountKey, peerDeviceId);
});

ipcMain.handle('e2e:encrypt', async (_event, input: unknown) =>
  e2e.encrypt(input as Parameters<typeof e2e.encrypt>[0]),
);

ipcMain.handle('e2e:decrypt', async (_event, input: unknown) =>
  e2e.decrypt(input as Parameters<typeof e2e.decrypt>[0]),
);

ipcMain.handle('e2e:reset', async (_event, accountKey: unknown) => {
  if (typeof accountKey !== 'string' || !accountKey) return false;
  await e2e.reset(accountKey);
  return true;
});

/** Whether the keys on this machine are protected by the OS keychain. */
ipcMain.handle('e2e:storage', () => ({ encrypted: e2e.storageIsEncrypted() }));

ipcMain.on('notify', (_event, payload: { title?: unknown; body?: unknown }) => {
  const { title, body } = payload ?? {};
  if (typeof title !== 'string' || typeof body !== 'string') return;
  notify(title, body);
});

ipcMain.handle('get-autostart', () => app.getLoginItemSettings().openAtLogin);

ipcMain.handle('set-autostart', (_event, enabled: boolean) => {
  app.setLoginItemSettings({ openAtLogin: Boolean(enabled), openAsHidden: true });
  return app.getLoginItemSettings().openAtLogin;
});

ipcMain.handle('app-version', () => app.getVersion());

// System-wide idleness, not the window's: someone writing in another
// application is at their machine, and an automatic status that says otherwise
// is worse than none.
ipcMain.handle('idle-seconds', () => powerMonitor.getSystemIdleTime());

ipcMain.handle('update:state', () => updateState);

ipcMain.handle('update:check', () => checkForUpdates());

ipcMain.handle('update:download', () => {
  if (updateState.status !== 'available') return updateState;
  void autoUpdater.downloadUpdate().catch(() => undefined);
  return updateState;
});

ipcMain.handle('update:auto-download', async (_event, enabled: boolean) => {
  autoDownload = Boolean(enabled);
  await saveUpdateStore();

  // Turning it on with an update already waiting should start that download,
  // not wait a day for the next check to find it again.
  if (autoDownload && updateState.status === 'available') {
    void autoUpdater.downloadUpdate().catch(() => undefined);
  }

  return autoDownload;
});

ipcMain.handle('update:auto-download-state', () => autoDownload);

ipcMain.handle('update:beta-channel-state', () => betaChannel);

ipcMain.handle('update:beta-channel', async (_event, enabled: boolean) => {
  betaChannel = Boolean(enabled);
  autoUpdater.allowPrerelease = betaChannel;
  await saveUpdateStore();

  // The channel only means anything at the next check, and waiting a day to
  // find out whether joining the beta did something reads as a dead switch.
  // A candidate found under the old channel is dropped first, so leaving the
  // beta cannot leave a pre-release sitting there as "available".
  if (!['checking', 'downloading', 'ready'].includes(updateState.status)) {
    pushUpdateState({ status: 'idle', candidate: undefined });
    void checkForUpdates();
  }

  return betaChannel;
});

ipcMain.handle('update:releases', async (_event, refresh: boolean) => {
  // The cached list answers instantly; a fetch happens on the first ask of the
  // session and whenever the panel asks for it outright.
  const releases = refresh || !releaseHistory.length ? await fetchReleases() : releaseHistory;
  return { releases, fetchedAt: releasesFetchedAt };
});

ipcMain.handle('update:install', () => {
  // Nothing is downloaded, so there is nothing to restart into.
  if (updateState.status !== 'ready') return false;

  quitting = true;
  // Silent, and running afterwards: the NSIS wizard has nothing to ask that the
  // user has not already answered, and an update that ends in a restart rather
  // than an installer is the behaviour people expect from a messenger.
  autoUpdater.quitAndInstall(true, true);
  return true;
});

ipcMain.handle('update:open-releases', () => shell.openExternal(RELEASES_URL));
