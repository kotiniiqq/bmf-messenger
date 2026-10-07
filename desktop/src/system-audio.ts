import { LocalAudioTrack, Track, type Room } from 'livekit-client';

/**
 * The machine's own sound, for the half of our platforms Electron will not give
 * it to.
 *
 * On Windows the shell captures it directly: `audio: 'loopback'` in the
 * display-media handler, and livekit publishes it with the picture. That option
 * is documented Windows-only, so on Linux the sound has to be found somewhere
 * else — and PulseAudio and PipeWire both already publish one: the *monitor* of
 * the output device, which Chromium lists as an ordinary audio input.
 *
 * This works the same under X11 and under Wayland. The display server was never
 * what decided it, which is why the old check for a Wayland session was both
 * wrong (`navigator.userAgent` says `X11` on every Linux, Wayland included) and
 * beside the point.
 */

/** PulseAudio labels these `Monitor of …`; localised desktops translate it. */
// Device labels come from the OS in its own language, so this pattern matches
// text rather than shows it. i18n-ok
const MONITOR = /\bmonitor\b|мониторинг|монитор /i;

/**
 * Device labels are empty until some capture permission has been granted, so
 * this is only meaningful once the call has opened the microphone — which it
 * does before anyone can reach the share button.
 */
export async function findMonitorDevice(): Promise<MediaDeviceInfo | null> {
  if (!navigator.mediaDevices?.enumerateDevices) return null;

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.find((device) => device.kind === 'audioinput' && MONITOR.test(device.label)) ?? null;
  } catch {
    return null;
  }
}

/**
 * Publishes the monitor as a second track beside the screen, under the source
 * the other side already expects screen audio to arrive on.
 *
 * Returns null when there is nothing to capture — a machine with bare ALSA, or
 * a session where the labels never appeared. The caller says so out loud rather
 * than sharing in silence and leaving people to wonder.
 */
export async function publishSystemAudio(room: Room): Promise<LocalAudioTrack | null> {
  const device = await findMonitorDevice();
  if (!device) return null;

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: { exact: device.deviceId },
      // A monitor is not a microphone. The three filters meant for voice would
      // gate music between notes and duck whatever is playing the moment
      // somebody speaks over it.
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });

  const [captured] = stream.getAudioTracks();
  if (!captured) return null;

  const track = new LocalAudioTrack(captured, undefined, false);
  await room.localParticipant.publishTrack(track, { source: Track.Source.ScreenShareAudio });
  return track;
}

/** Stops the monitor track and takes it off the room. */
export async function unpublishSystemAudio(
  room: Room,
  track: LocalAudioTrack | null,
): Promise<void> {
  if (!track) return;

  try {
    await room.localParticipant.unpublishTrack(track, true);
  } finally {
    track.stop();
  }
}
