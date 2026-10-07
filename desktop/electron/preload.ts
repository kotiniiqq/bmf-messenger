import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { ReleaseNote, UpdateState } from './updates.js';
import type {
  ShareBarState,
  ShareCapabilities,
  ShareCommand,
  ShareSource,
} from './share.js';
import type { PublishableKeys, RemoteBundle, SealedEnvelope } from './e2e.js';

/**
 * A narrow, typed surface — the renderer gets exactly these calls and nothing
 * else. Widening this is how Electron apps grow holes.
 */
contextBridge.exposeInMainWorld('bmf', {
  setUnreadCount: (count: number) => ipcRenderer.send('unread-count', count),
  showWindow: () => ipcRenderer.send('show-window'),

  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.send('window:toggle-maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),

  // The call runs in its own window; these are how the two reach each other.
  openCall: (callId: string) => ipcRenderer.send('call:open', callId),
  hideCall: () => ipcRenderer.send('call:hide'),
  minimizeCall: () => ipcRenderer.send('call:minimize'),
  toggleMaximizeCall: () => ipcRenderer.send('call:maximize'),
  endedCall: () => ipcRenderer.send('call:ended'),
  syncCall: (payload: unknown) => ipcRenderer.send('call:sync', payload),

  onCallWindow: (handler: (state: { open: boolean; callId: string | null }) => void) => {
    const listener = (_event: IpcRendererEvent, state: { open: boolean; callId: string | null }) =>
      handler(state);
    ipcRenderer.on('call:window', listener);
    return () => ipcRenderer.removeListener('call:window', listener);
  },

  onCallSync: (handler: (payload: unknown) => void) => {
    const listener = (_event: IpcRendererEvent, payload: unknown) => handler(payload);
    ipcRenderer.on('call:sync', listener);
    return () => ipcRenderer.removeListener('call:sync', listener);
  },
  // Screen sharing: the picker asks what there is, then says what it settled on
  // — including whether the machine's sound travels with the picture.
  screenSources: (): Promise<ShareSource[]> => ipcRenderer.invoke('screen:sources'),
  screenCapabilities: (): Promise<ShareCapabilities> => ipcRenderer.invoke('screen:capabilities'),
  chooseScreenSource: (sourceId: string, audio: boolean): Promise<boolean> =>
    ipcRenderer.invoke('screen:choose', { sourceId, audio }),

  // The block that floats over the shared screen. The call window shows it and
  // answers it; the block itself only presses buttons.
  showShareBar: (callId: string) => ipcRenderer.send('share-bar:show', callId),
  hideShareBar: () => ipcRenderer.send('share-bar:hide'),
  shareCommand: (command: ShareCommand) => ipcRenderer.send('share-bar:command', command),
  shareState: (state: ShareBarState) => ipcRenderer.send('share-bar:state', state),

  onShareCommand: (handler: (command: ShareCommand) => void) => {
    const listener = (_event: IpcRendererEvent, command: ShareCommand) => handler(command);
    ipcRenderer.on('share-bar:command', listener);
    return () => ipcRenderer.removeListener('share-bar:command', listener);
  },

  onShareState: (handler: (state: ShareBarState) => void) => {
    const listener = (_event: IpcRendererEvent, state: ShareBarState) => handler(state);
    ipcRenderer.on('share-bar:state', listener);
    return () => ipcRenderer.removeListener('share-bar:state', listener);
  },

  /**
   * The privacy mode. The renderer sends text and receives ciphertext, or the
   * other way round — it never touches a key, and there is deliberately no call
   * here that would hand it one.
   */
  e2eKeys: (accountKey: string): Promise<PublishableKeys> =>
    ipcRenderer.invoke('e2e:keys', accountKey),
  e2eStartSession: (accountKey: string, localDeviceId: string, bundle: RemoteBundle):
    Promise<boolean> =>
    ipcRenderer.invoke('e2e:start-session', { accountKey, localDeviceId, bundle }),
  e2eHasSession: (accountKey: string, peerDeviceId: string): Promise<boolean> =>
    ipcRenderer.invoke('e2e:has-session', { accountKey, peerDeviceId }),
  e2eEncrypt: (input: {
    accountKey: string;
    localDeviceId: string;
    peerDeviceId: string;
    plaintext: string;
  }): Promise<SealedEnvelope> => ipcRenderer.invoke('e2e:encrypt', input),
  e2eDecrypt: (input: {
    accountKey: string;
    localDeviceId: string;
    peerDeviceId: string;
    type: number;
    body: string;
  }): Promise<string> => ipcRenderer.invoke('e2e:decrypt', input),
  e2eReset: (accountKey: string): Promise<boolean> => ipcRenderer.invoke('e2e:reset', accountKey),
  e2eStorage: (): Promise<{ encrypted: boolean }> => ipcRenderer.invoke('e2e:storage'),

  notify: (title: string, body: string) => ipcRenderer.send('notify', { title, body }),

  getAutostart: (): Promise<boolean> => ipcRenderer.invoke('get-autostart'),
  setAutostart: (enabled: boolean): Promise<boolean> =>
    ipcRenderer.invoke('set-autostart', enabled),

  appVersion: (): Promise<string> => ipcRenderer.invoke('app-version'),

  /** Seconds the machine has been untouched — the automatic status asks. */
  idleSeconds: (): Promise<number> => ipcRenderer.invoke('idle-seconds'),

  updateState: (): Promise<UpdateState> => ipcRenderer.invoke('update:state'),
  checkUpdates: (): Promise<UpdateState> => ipcRenderer.invoke('update:check'),
  downloadUpdate: (): Promise<UpdateState> => ipcRenderer.invoke('update:download'),
  installUpdate: (): Promise<boolean> => ipcRenderer.invoke('update:install'),
  openReleases: (): Promise<void> => ipcRenderer.invoke('update:open-releases'),

  getAutoDownload: (): Promise<boolean> => ipcRenderer.invoke('update:auto-download-state'),
  setAutoDownload: (enabled: boolean): Promise<boolean> =>
    ipcRenderer.invoke('update:auto-download', enabled),

  getBetaChannel: (): Promise<boolean> => ipcRenderer.invoke('update:beta-channel-state'),
  setBetaChannel: (enabled: boolean): Promise<boolean> =>
    ipcRenderer.invoke('update:beta-channel', enabled),

  updateReleases: (refresh?: boolean): Promise<{ releases: ReleaseNote[]; fetchedAt?: number }> =>
    ipcRenderer.invoke('update:releases', refresh === true),

  /**
   * Returns its own unsubscribe. The settings screen mounts every time it is
   * opened, and a listener that outlives it would pile up until Electron starts
   * warning about a leak.
   */
  onUpdateState: (handler: (state: UpdateState) => void) => {
    const listener = (_event: IpcRendererEvent, state: UpdateState) => handler(state);
    ipcRenderer.on('update:state', listener);
    return () => ipcRenderer.removeListener('update:state', listener);
  },
  onResetAppearance: (handler: () => void) => {
    ipcRenderer.on('reset-appearance', () => handler());
  },

  platform: process.platform,
});
