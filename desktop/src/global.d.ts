import type { ReleaseNote, UpdateState } from '../electron/updates.js';
import type {
  ShareBarState,
  ShareCapabilities,
  ShareCommand,
  ShareSource,
} from '../electron/share.js';
import type { PublishableKeys, RemoteBundle, SealedEnvelope } from '../electron/e2e.js';

export {};

declare global {
  interface Window {
    /** Exposed by the Electron preload; absent when running in a plain browser. */
    bmf?: {
      setUnreadCount: (count: number) => void;
      showWindow: () => void;
      minimizeWindow: () => void;
      toggleMaximizeWindow: () => void;
      closeWindow: () => void;

      openCall: (callId: string) => void;
      hideCall: () => void;
      minimizeCall: () => void;
      toggleMaximizeCall: () => void;
      endedCall: () => void;
      syncCall: (payload: unknown) => void;
      /** Both return their own unsubscribe. */
      onCallWindow: (
        handler: (state: { open: boolean; callId: string | null }) => void,
      ) => () => void;
      onCallSync: (handler: (payload: unknown) => void) => () => void;

      screenSources: () => Promise<ShareSource[]>;
      screenCapabilities: () => Promise<ShareCapabilities>;
      chooseScreenSource: (sourceId: string, audio: boolean) => Promise<boolean>;

      showShareBar: (callId: string) => void;
      hideShareBar: () => void;
      shareCommand: (command: ShareCommand) => void;
      shareState: (state: ShareBarState) => void;
      /** Both return their own unsubscribe. */
      onShareCommand: (handler: (command: ShareCommand) => void) => () => void;
      onShareState: (handler: (state: ShareBarState) => void) => () => void;

      e2eKeys: (accountKey: string) => Promise<PublishableKeys>;
      e2eStartSession: (
        accountKey: string,
        localDeviceId: string,
        bundle: RemoteBundle,
      ) => Promise<boolean>;
      e2eHasSession: (accountKey: string, peerDeviceId: string) => Promise<boolean>;
      e2eEncrypt: (input: {
        accountKey: string;
        localDeviceId: string;
        peerDeviceId: string;
        plaintext: string;
      }) => Promise<SealedEnvelope>;
      e2eDecrypt: (input: {
        accountKey: string;
        localDeviceId: string;
        peerDeviceId: string;
        type: number;
        body: string;
      }) => Promise<string>;
      e2eReset: (accountKey: string) => Promise<boolean>;
      e2eStorage: () => Promise<{ encrypted: boolean }>;

      notify: (title: string, body: string) => void;
      getAutostart: () => Promise<boolean>;
      setAutostart: (enabled: boolean) => Promise<boolean>;
      appVersion: () => Promise<string>;
      idleSeconds: () => Promise<number>;

      updateState: () => Promise<UpdateState>;
      checkUpdates: () => Promise<UpdateState>;
      downloadUpdate: () => Promise<UpdateState>;
      installUpdate: () => Promise<boolean>;
      openReleases: () => Promise<void>;
      getAutoDownload: () => Promise<boolean>;
      setAutoDownload: (enabled: boolean) => Promise<boolean>;
      getBetaChannel: () => Promise<boolean>;
      setBetaChannel: (enabled: boolean) => Promise<boolean>;
      updateReleases: (refresh?: boolean) => Promise<{ releases: ReleaseNote[]; fetchedAt?: number }>;
      /** Returns the unsubscribe function. */
      onUpdateState: (handler: (state: UpdateState) => void) => () => void;

      onResetAppearance: (handler: () => void) => void;
      platform: string;
    };
  }
}
