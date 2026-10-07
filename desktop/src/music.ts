import { t, type MessageKey } from './i18n/index.js';

/**
 * Mock library for the music section. The real player reads a local folder
 * (spec stage 5); nothing here touches the filesystem or plays audio — the
 * position advances on a timer so the interface can be built and looked at.
 */
export interface MockTrack {
  id: number;
  /** Dictionary keys, resolved by the screen that draws the row. */
  title: MessageKey;
  artist: MessageKey;
  album: MessageKey;
  seconds: number;
  /** Index into GRADS — the cover stand-in the prototype uses. */
  cover: number;
  favourite: boolean;
}

export const GRADS = [
  'linear-gradient(135deg,#7c6cf8,#06b6d4)',
  'linear-gradient(135deg,#ec4899,#f59e0b)',
  'linear-gradient(135deg,#10b981,#06b6d4)',
  'linear-gradient(135deg,#6366f1,#ec4899)',
  'linear-gradient(135deg,#f59e0b,#ef4444)',
  'linear-gradient(135deg,#06b6d4,#6366f1)',
  'linear-gradient(135deg,#8b5cf6,#ec4899)',
  'linear-gradient(135deg,#14b8a6,#84cc16)',
];

export const TRACKS: MockTrack[] = [
  {
    id: 1,
    title: 'music.mock.night.title',
    artist: 'music.mock.night.artist',
    album: 'music.mock.night.album',
    seconds: 222,
    cover: 0,
    favourite: true,
  },
  {
    id: 2,
    title: 'music.mock.port.title',
    artist: 'music.mock.port.artist',
    album: 'music.mock.port.album',
    seconds: 247,
    cover: 1,
    favourite: false,
  },
  {
    id: 3,
    title: 'music.mock.cursor.title',
    artist: 'music.mock.cursor.artist',
    album: 'music.mock.cursor.album',
    seconds: 178,
    cover: 2,
    favourite: true,
  },
  {
    id: 4,
    title: 'music.mock.redis.title',
    artist: 'music.mock.redis.artist',
    album: 'music.mock.redis.album',
    seconds: 313,
    cover: 3,
    favourite: false,
  },
];

export const PLAYLISTS: { name: MessageKey; ids: number[] }[] = [
  { name: 'music.mock.playlistWork', ids: [1, 3] },
  { name: 'music.mock.playlistEvening', ids: [2, 4] },
];

export type MusicList = 'all' | 'fav' | `pl${number}`;

const playlistOf = (list: MusicList) =>
  list.startsWith('pl') ? PLAYLISTS[Number(list.slice(2))] : undefined;

export function tracksOf(list: MusicList): MockTrack[] {
  if (list === 'all') return TRACKS;
  if (list === 'fav') return TRACKS.filter((track) => track.favourite);

  const ids = playlistOf(list)?.ids ?? [];
  return ids.flatMap((id) => TRACKS.filter((track) => track.id === id));
}

export function titleOf(list: MusicList): string {
  if (list === 'all') return t('music.allTracks');
  if (list === 'fav') return t('music.favourites');

  const playlist = playlistOf(list);
  return playlist ? t(playlist.name) : t('music.playlist');
}

export function trackById(id: number | null): MockTrack | undefined {
  return id === null ? undefined : TRACKS.find((track) => track.id === id);
}

export function fmt(seconds: number): string {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
