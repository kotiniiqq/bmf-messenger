import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ConnectionState,
  RoomEvent,
  Track,
  type LocalAudioTrack,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  Room,
} from 'livekit-client';
import type { CallCredentials } from '@bmf/shared';
import { t } from '../i18n/index.js';
import type { ShareCapabilities, ShareSource } from '../../electron/share.js';
import { api } from '../api/client.js';
import { getCallPrefs, iceTransportPolicy } from '../call-prefs.js';
import { IconClose } from '../components/icons.js';
import { SharePicker } from '../components/SharePicker.js';
import { findMonitorDevice, publishSystemAudio, unpublishSystemAudio } from '../system-audio.js';

/**
 * The call, in its own window.
 *
 * The prototype has a call history screen and no call screen, so this one is
 * built rather than ported — from the prototype's variables and metrics, and
 * with the arrangement the spec asks for: one control bar, bottom centre,
 * gone after three idle seconds.
 *
 * Closing this window does not hang up. The shell hides it and the main window
 * shows a pill, because a call you are listening to is not a call you want to
 * keep looking at.
 */

/** Spec section 7: the bar disappears after three seconds of nothing happening. */
const IDLE_MS = 3000;

/**
 * A shared screen is not the same picture as a face, and one participant can
 * publish both at once. Tiles are keyed by the pair, or the screen would
 * overwrite the camera and leave whichever arrived last.
 */
type TileSource = 'camera' | 'screen';

interface RemoteTile {
  /** `identity:source` — unique per picture rather than per person. */
  key: string;
  identity: string;
  name: string;
  source: TileSource;
  /** Set once a video track arrives; audio-only participants stay a placeholder. */
  element: HTMLVideoElement | null;
  speaking: boolean;
}

function formatElapsed(startedAt: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export function Call({ callId }: { callId: string }) {
  const [credentials, setCredentials] = useState<CallCredentials | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<ConnectionState>(ConnectionState.Disconnected);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [tiles, setTiles] = useState<RemoteTile[]>([]);
  const [elapsed, setElapsed] = useState('00:00');
  const [barVisible, setBarVisible] = useState(true);
  /**
   * Fit shows the whole frame, fill crops it to the tile. Fit is the default the
   * spec asks for — a cropped head is worse than a letterboxed one — but filling
   * is what people want once everyone is on the same aspect ratio.
   */
  const [fill, setFill] = useState(false);
  const [picker, setPicker] = useState<{ sources: ShareSource[]; loading: boolean } | null>(null);
  const [capabilities, setCapabilities] = useState<ShareCapabilities | null>(null);
  const [monitorAudio, setMonitorAudio] = useState(false);

  const roomRef = useRef<Room | null>(null);
  const selfVideoRef = useRef<HTMLVideoElement | null>(null);
  const idleTimer = useRef<number | null>(null);
  /** Linux only: the machine's output, captured as an input beside the picture. */
  const systemAudioRef = useRef<LocalAudioTrack | null>(null);
  const shell = window.bmf;

  /** Join once, on mount. The window is opened per call, so this is per call. */
  useEffect(() => {
    let cancelled = false;
    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;

    room
      .on(RoomEvent.ConnectionStateChanged, (next) => setState(next))
      .on(
        RoomEvent.TrackSubscribed,
        (track: RemoteTrack, pub: RemoteTrackPublication, participant: RemoteParticipant) => {
          const source = sourceOf(pub);

          if (track.kind === Track.Kind.Video) {
            const element = track.attach() as HTMLVideoElement;
            setTiles((current) => upsertTile(current, participant, source, element));
            return;
          }

          // Audio needs no tile, but it does need to be attached to play. The
          // sound of somebody's shared screen is not a person arriving, so it
          // gets no placeholder of its own.
          track.attach();
          if (pub.source !== Track.Source.ScreenShareAudio) {
            setTiles((current) => upsertTile(current, participant, 'camera', null));
          }
        },
      )
      .on(RoomEvent.TrackUnsubscribed, (track, pub, participant) => {
        track.detach().forEach((el) => el.remove());
        if (track.kind !== Track.Kind.Video) return;

        // A screen that stopped being shared is gone; a camera that switched off
        // leaves the person in the call, so their tile stays as a placeholder.
        setTiles((current) =>
          sourceOf(pub) === 'screen'
            ? current.filter((tile) => tile.key !== tileKey(participant.identity, 'screen'))
            : current.map((tile) =>
                tile.key === tileKey(participant.identity, 'camera')
                  ? { ...tile, element: null }
                  : tile,
              ),
        );
      })
      .on(RoomEvent.ParticipantDisconnected, (participant) => {
        setTiles((current) => current.filter((tile) => tile.identity !== participant.identity));
      })
      .on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        const loud = new Set(speakers.map((s) => s.identity));
        setTiles((current) =>
          // Only faces light up. A shared screen framed in green every time its
          // owner speaks is noise, not information.
          current.map((tile) => ({
            ...tile,
            speaking: tile.source === 'camera' && loud.has(tile.identity),
          })),
        );
      })
      .on(RoomEvent.LocalTrackUnpublished, (pub) => {
        // Windows and the desktop portals both put their own "stop sharing" bar
        // on screen. Pressed there, the track ends without anything of ours
        // being clicked — and the button would still claim we were sharing.
        if (pub.source === Track.Source.ScreenShare) setSharing(false);
      })
      .on(RoomEvent.Disconnected, () => {
        // The other side hung up, or the room was closed by the server.
        shell?.endedCall();
      });

    void (async () => {
      try {
        const joined = await api.joinCall(callId);
        if (cancelled) return;
        setCredentials(joined);

        await room.connect(joined.url, joined.token, {
          rtcConfig: {
            // These are the servers the API signed for us.
            iceServers: joined.iceServers,
            // Relay by default (spec §7). Allowed to go direct, ICE tries the
            // short path first and falls back to TURN on its own, silently.
            iceTransportPolicy: iceTransportPolicy(getCallPrefs()),
          },
        });
        if (cancelled) return;

        // Devices are opened after joining, and their failure is not the call's
        // failure: someone who refused the microphone should still hear the
        // other side rather than be dropped with an error about connecting.
        try {
          await room.localParticipant.setMicrophoneEnabled(true);
        } catch {
          if (!cancelled) {
            setMicOn(false);
            setError(t('callWindow.micDenied'));
          }
        }

        if (joined.call.kind === 'video') {
          try {
            await room.localParticipant.setCameraEnabled(true);
            if (!cancelled) setCamOn(true);
          } catch {
            if (!cancelled) {
              setCamOn(false);
              setError(t('callWindow.camDenied'));
            }
          }
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t('callWindow.joinFailed'));
      }
    })();

    return () => {
      cancelled = true;
      void room.disconnect();
      roomRef.current = null;
    };
  }, [callId, shell]);

  /**
   * What this shell can do about screens, asked once. The picker needs it to
   * open at all, so waiting until the button is pressed would show an empty
   * dialog for the length of an IPC round trip.
   */
  useEffect(() => {
    if (!shell) return;
    void shell.screenCapabilities().then(setCapabilities).catch(() => setCapabilities(null));
  }, [shell]);

  /**
   * The floating block exists for exactly as long as the share does, and only
   * this window can say when that is.
   */
  useEffect(() => {
    if (!shell) return;
    if (sharing) shell.showShareBar(callId);
    else shell.hideShareBar();
  }, [sharing, callId, shell]);

  /** Whatever the block draws, it got from here. */
  useEffect(() => {
    if (!shell || !sharing) return;
    shell.shareState({ micOn, elapsed });
  }, [shell, sharing, micOn, elapsed]);

  /** The clock in the header. */
  useEffect(() => {
    if (!credentials) return;
    const startedAt = credentials.call.startedAt;
    setElapsed(formatElapsed(startedAt));

    const timer = window.setInterval(() => setElapsed(formatElapsed(startedAt)), 1000);
    return () => window.clearInterval(timer);
  }, [credentials]);

  /** The camera preview, attached once the track exists. */
  useEffect(() => {
    const room = roomRef.current;
    const video = selfVideoRef.current;
    if (!room || !video || !camOn) return;

    const publication = room.localParticipant.getTrackPublication(Track.Source.Camera);
    const track = publication?.videoTrack;
    if (!track) return;

    track.attach(video);
    return () => {
      track.detach(video);
    };
  }, [camOn, state]);

  const wake = useCallback(() => {
    setBarVisible(true);
    if (idleTimer.current) window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setBarVisible(false), IDLE_MS);
  }, []);

  useEffect(() => {
    wake();
    return () => {
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
    };
  }, [wake]);

  async function toggleMic() {
    const room = roomRef.current;
    if (!room) return;

    const next = !micOn;
    try {
      await room.localParticipant.setMicrophoneEnabled(next);
      setMicOn(next);
      setError(null);
    } catch {
      setError(t('callWindow.micUnavailable'));
    }
  }

  async function toggleCam() {
    const room = roomRef.current;
    if (!room) return;

    const next = !camOn;
    try {
      await room.localParticipant.setCameraEnabled(next);
      setCamOn(next);
      setError(null);
    } catch {
      setError(t('callWindow.camUnavailable'));
    }
  }

  /**
   * The share button asks before it captures anything: which surface, and
   * whether the sound of this machine goes out with it. Both are decisions
   * people change their mind about, and neither can be taken back afterwards.
   */
  async function openPicker() {
    if (!shell || !capabilities) return;
    setPicker({ sources: [], loading: true });

    try {
      // Collecting thumbnails takes a moment, and under the Wayland portal it
      // returns nothing at all — the dialog does the choosing there.
      const [sources, monitor] = await Promise.all([shell.screenSources(), findMonitorDevice()]);
      setMonitorAudio(Boolean(monitor));
      setPicker({ sources, loading: false });
    } catch {
      setPicker(null);
      setError(t('callWindow.windowsFailed'));
    }
  }

  /**
   * Windows carries the machine's sound with the picture through a loopback
   * device; everywhere else it has to be published as a second track, because
   * Electron's loopback option is documented Windows-only.
   */
  async function startShare(sourceId: string, audio: boolean) {
    const room = roomRef.current;
    if (!room || !shell) return;

    setPicker(null);
    const loopback = audio && (capabilities?.loopbackAudio ?? false);

    try {
      await shell.chooseScreenSource(sourceId, loopback);
      await room.localParticipant.setScreenShareEnabled(true, { audio: loopback });
      setSharing(true);
      setError(null);

      if (audio && !loopback) {
        systemAudioRef.current = await publishSystemAudio(room);
        if (!systemAudioRef.current) {
          setError(t('callWindow.shareNoAudio'));
        }
      }
    } catch {
      setSharing(false);
      setError(t('callWindow.shareFailed'));
    }
  }

  async function stopShare() {
    const room = roomRef.current;
    if (!room) return;

    await unpublishSystemAudio(room, systemAudioRef.current);
    systemAudioRef.current = null;

    try {
      await room.localParticipant.setScreenShareEnabled(false);
    } finally {
      setSharing(false);
    }
  }

  async function hangUp() {
    try {
      await api.leaveCall(callId);
    } finally {
      shell?.endedCall();
    }
  }

  /**
   * Buttons pressed on the floating block. It has no room and no tracks — this
   * window does the work and then tells it what happened.
   */
  useEffect(() => {
    if (!shell) return;

    return shell.onShareCommand((command) => {
      if (command === 'mic') void toggleMic();
      else if (command === 'stop-share') void stopShare();
      else if (command === 'hangup') void hangUp();
    });
    // The handlers read `micOn` and `sharing`, so the subscription is renewed
    // whenever either changes — otherwise the block would toggle against a
    // state that stopped being true minutes ago.
  }, [shell, micOn, sharing]);

  const call = credentials?.call;
  const connecting = state !== ConnectionState.Connected && !error;
  // A shared screen takes the stage; faces move to a strip beside it.
  const screens = tiles.filter((tile) => tile.source === 'screen').length;

  return (
    <div className="call-root" onMouseMove={wake}>
      <div className="call-bar-top">
        <div className="call-who">
          <span className="call-dot" data-live={state === ConnectionState.Connected} />
          {call ? t('callWindow.ongoing', { elapsed }) : t('callWindow.connecting')}
        </div>
        <div className="wc-wind">
          <div
            className="circ grn"
            title={t('callWindow.minimise')}
            onClick={() => shell?.minimizeCall()}
          >
            <svg viewBox="0 0 10 2">
              <line x1="1" y1="1" x2="9" y2="1" />
            </svg>
          </div>
          <div
            className="circ yel"
            title={t('callWindow.maximise')}
            onClick={() => shell?.toggleMaximizeCall()}
          >
            <svg viewBox="0 0 10 10">
              <polyline points="1,4 1,1 4,1" />
              <polyline points="6,1 9,1 9,4" />
              <polyline points="9,6 9,9 6,9" />
              <polyline points="4,9 1,9 1,6" />
            </svg>
          </div>
          <div
            className="circ red"
            title={t('callWindow.toPill')}
            onClick={() => shell?.hideCall()}
          >
            <svg viewBox="0 0 10 10">
              <line x1="1" y1="1" x2="9" y2="9" />
              <line x1="9" y1="1" x2="1" y2="9" />
            </svg>
          </div>
        </div>
      </div>

      <div className="call-stage">
        {error && <div className="call-note">{error}</div>}
        {connecting && !error && <div className="call-note">{t('callWindow.connectingNote')}</div>}

        <div className="call-grid" data-count={tiles.length} data-screen={screens > 0}>
          {tiles.map((tile) => (
            <Tile key={tile.key} tile={tile} fill={fill} />
          ))}
          {tiles.length === 0 && !connecting && !error && (
            <div className="call-note">
              {t('callWindow.ringing')}
              <br />
              {t('callWindow.ringingHint')}
            </div>
          )}
        </div>

        <video
          ref={selfVideoRef}
          className={`call-self${camOn ? '' : ' off'}`}
          autoPlay
          muted
          playsInline
        />
      </div>

      <div className={`call-ctl${barVisible ? ' show' : ''}`}>
        <button
          className={`call-btn${micOn ? '' : ' off'}`}
          onClick={() => void toggleMic()}
          title={t('callWindow.mic')}
        >
          <svg viewBox="0 0 24 24">
            <rect x="9" y="2" width="6" height="12" rx="3" />
            <path d="M5 10a7 7 0 0 0 14 0" />
            <line x1="12" y1="17" x2="12" y2="22" />
          </svg>
        </button>

        <button
          className={`call-btn${camOn ? '' : ' off'}`}
          onClick={() => void toggleCam()}
          title={t('callWindow.cam')}
        >
          <svg viewBox="0 0 24 24">
            <polygon points="23 7 16 12 23 17 23 7" />
            <rect x="1" y="5" width="15" height="14" rx="2" />
          </svg>
        </button>

        <button
          className={`call-btn${sharing ? ' on' : ''}`}
          onClick={() => void (sharing ? stopShare() : openPicker())}
          title={sharing ? t('callWindow.shareStop') : t('callWindow.share')}
        >
          <svg viewBox="0 0 24 24">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
        </button>

        <button
          className={`call-btn${fill ? ' on' : ''}`}
          onClick={() => setFill((current) => !current)}
          title={fill ? t('callWindow.fitWhole') : t('callWindow.fitFill')}
        >
          <svg viewBox="0 0 24 24">
            <polyline points="4 9 4 4 9 4" />
            <polyline points="15 4 20 4 20 9" />
            <polyline points="20 15 20 20 15 20" />
            <polyline points="9 20 4 20 4 15" />
          </svg>
        </button>

        <button className="call-btn end" onClick={() => void hangUp()} title={t('callWindow.hangUp')}>
          <IconClose />
        </button>
      </div>

      {picker && capabilities && (
        <SharePicker
          capabilities={capabilities}
          sources={picker.sources}
          loading={picker.loading}
          monitorAudio={monitorAudio}
          onCancel={() => setPicker(null)}
          onShare={(sourceId, audio) => void startShare(sourceId, audio)}
        />
      )}
    </div>
  );
}

function tileKey(identity: string, source: TileSource): string {
  return `${identity}:${source}`;
}

/** Screen-share audio rides with the screen; everything else is the camera. */
function sourceOf(pub: RemoteTrackPublication): TileSource {
  return pub.source === Track.Source.ScreenShare || pub.source === Track.Source.ScreenShareAudio
    ? 'screen'
    : 'camera';
}

/**
 * Adds the tile if this picture is new, updates it if it is not.
 *
 * A null element means "make sure this person has a tile" rather than "they have
 * no video": audio arriving for someone already on screen must not blank them.
 */
function upsertTile(
  current: RemoteTile[],
  participant: RemoteParticipant,
  source: TileSource,
  element: HTMLVideoElement | null,
): RemoteTile[] {
  const key = tileKey(participant.identity, source);
  const name = participant.name || participant.identity;
  const existing = current.find((tile) => tile.key === key);

  if (!existing) {
    return [
      ...current,
      { key, identity: participant.identity, name, source, element, speaking: false },
    ];
  }

  return current.map((tile) =>
    tile.key === key ? { ...tile, name, element: element ?? tile.element } : tile,
  );
}

/**
 * One picture: a participant's camera, or the screen they are sharing.
 *
 * The container follows the source's own aspect ratio rather than the other way
 * round — the spec is explicit about it, because forcing a 4:3 camera into a
 * 16:9 box is what crops people's heads off. `fill` is the deliberate opposite,
 * chosen from the control bar when the letterboxing is the bigger annoyance.
 */
function Tile({ tile, fill }: { tile: RemoteTile; fill: boolean }) {
  const holder = useRef<HTMLDivElement | null>(null);
  const [ratio, setRatio] = useState(16 / 9);

  useEffect(() => {
    const host = holder.current;
    const video = tile.element;
    if (!host || !video) return;

    host.appendChild(video);
    video.autoplay = true;
    video.playsInline = true;

    const measure = () => {
      const settings = video.videoWidth && video.videoHeight
        ? video.videoWidth / video.videoHeight
        : null;
      if (settings) setRatio(settings);
    };

    video.addEventListener('loadedmetadata', measure);
    measure();

    return () => {
      video.removeEventListener('loadedmetadata', measure);
      video.remove();
    };
  }, [tile.element]);

  return (
    <div
      className={`call-tile${tile.speaking ? ' speaking' : ''}`}
      data-source={tile.source}
      // A shared screen is read, not looked at: cropping it hides the very
      // lines somebody is pointing at, so it ignores the fill toggle.
      data-fill={fill && tile.source === 'camera'}
      style={{ aspectRatio: String(ratio) }}
    >
      <div className="call-video" ref={holder} />
      {!tile.element && <div className="call-avatar">{tile.name.slice(0, 2).toUpperCase()}</div>}
      <div className="call-name">
        {tile.name}
        {tile.source === 'screen' && t('callWindow.screenSuffix')}
      </div>
    </div>
  );
}
