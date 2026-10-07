/**
 * What the screen-share picker needs from the shell.
 *
 * The renderer decides *what* to share and *whether the machine's own sound
 * goes with it*; the main process only carries out that decision. These types
 * are the contract between the two, and they live here rather than in the
 * renderer because the preload imports them too.
 */

export interface ShareSource {
  /** Opaque to the renderer — it travels back unchanged in `chooseScreenSource`. */
  id: string;
  name: string;
  kind: 'screen' | 'window';
  /** A data URL, or null when the compositor gave us an empty frame. */
  thumbnail: string | null;
}

export interface ShareCapabilities {
  /**
   * True where the surface is chosen by the desktop's own portal dialog rather
   * than by us — Wayland. Drawing our own grid there would show a list the
   * portal is free to ignore.
   */
  portal: boolean;
  /**
   * True where Electron can capture the machine's output directly. That is
   * Windows and only Windows: `audio: 'loopback'` is documented Windows-only.
   * Elsewhere the sound has to come from an audio *input* that mirrors the
   * output, which is what `desktop/src/system-audio.ts` looks for.
   */
  loopbackAudio: boolean;
  /** The id to send when the portal, not the picker, decides. */
  portalSource: string;
}

export interface ShareChoice {
  sourceId: string;
  audio: boolean;
}

/**
 * The three decisions that cannot wait until somebody finds the call window
 * again. Everything else stays where the rest of the controls are.
 */
export type ShareCommand = 'mic' | 'stop-share' | 'hangup';

/** What the floating block draws. It holds no state of its own. */
export interface ShareBarState {
  micOn: boolean;
  elapsed: string;
}
