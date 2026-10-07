import { create } from 'zustand';
import { TRACKS, trackById } from './music.js';

/**
 * Player state, shared by the track list and the pill in the title bar.
 *
 * No audio is decoded — stage 5 does that. The position advances on a timer so
 * progress, track changes and the end-of-queue behaviour can be built and seen
 * now; swapping the timer for an element later does not touch this shape.
 */
interface PlayerState {
  trackId: number | null;
  playing: boolean;
  /** Seconds into the current track. */
  position: number;
  /** Ids the next/previous buttons walk through. */
  queue: number[];
  shuffle: boolean;
  repeat: boolean;
  volume: number;

  play: (trackId: number, queue?: number[]) => void;
  playList: (ids: number[]) => void;
  toggle: () => void;
  next: (automatic?: boolean) => void;
  previous: () => void;
  seek: (fraction: number) => void;
  setVolume: (volume: number) => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
}

const TICK_MS = 250;
let timer = 0;

export const usePlayer = create<PlayerState>((set, get) => {
  function stop() {
    window.clearInterval(timer);
    timer = 0;
  }

  function start() {
    stop();
    timer = window.setInterval(() => {
      const { trackId, position, repeat } = get();
      const track = trackById(trackId);
      if (!track) return stop();

      const next = position + TICK_MS / 1000;
      if (next < track.seconds) {
        set({ position: next });
        return;
      }

      if (repeat) set({ position: 0 });
      else get().next(true);
    }, TICK_MS);
  }

  return {
    trackId: null,
    playing: false,
    position: 0,
    queue: TRACKS.map((track) => track.id),
    shuffle: false,
    repeat: false,
    volume: 0.7,

    play(trackId, queue) {
      if (queue) set({ queue });
      // Tapping the track already playing is a pause, not a restart.
      if (get().trackId === trackId) return get().toggle();

      set({ trackId, position: 0, playing: true });
      start();
    },

    playList(ids) {
      if (!ids.length) return;
      const first = get().shuffle ? ids[Math.floor(Math.random() * ids.length)] : ids[0];
      if (first !== undefined) get().play(first, ids);
    },

    toggle() {
      const { trackId, playing } = get();
      if (trackId === null) return get().playList(get().queue);

      set({ playing: !playing });
      if (playing) stop();
      else start();
    },

    next(automatic) {
      const { trackId, queue, shuffle, repeat, playing } = get();
      if (trackId === null || !queue.length) return;

      const index = queue.indexOf(trackId);
      let following: number | undefined;

      if (shuffle) {
        do {
          following = queue[Math.floor(Math.random() * queue.length)];
        } while (queue.length > 1 && following === trackId);
      } else {
        following = queue[(index + 1) % queue.length];
      }

      // Reaching the end on its own stops rather than looping the queue.
      if (automatic && !repeat && !shuffle && index === queue.length - 1) {
        stop();
        set({ playing: false, position: 0 });
        return;
      }

      if (following === undefined) return;
      set({ trackId: following, position: 0 });
      if (playing) start();
    },

    previous() {
      const { trackId, queue, position, playing } = get();
      if (trackId === null || !queue.length) return;

      // Part way in, "previous" means the start of this track.
      if (position > 4) return set({ position: 0 });

      const index = queue.indexOf(trackId);
      const earlier = queue[(index - 1 + queue.length) % queue.length];
      if (earlier === undefined) return;

      set({ trackId: earlier, position: 0 });
      if (playing) start();
    },

    seek(fraction) {
      const track = trackById(get().trackId);
      if (!track) return;
      set({ position: track.seconds * Math.min(1, Math.max(0, fraction)) });
    },

    setVolume(volume) {
      set({ volume: Math.min(1, Math.max(0, volume)) });
    },

    toggleShuffle() {
      set({ shuffle: !get().shuffle });
    },

    toggleRepeat() {
      set({ repeat: !get().repeat });
    },
  };
});
