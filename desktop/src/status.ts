import type { CSSProperties } from 'react';
import type { StatusId, User } from '@bmf/shared';
import { t, type MessageKey } from './i18n/index.js';

/** STATUSES from the prototype; the ids are the ones the server stores. */
export interface StatusPreset {
  id: StatusId;
  emoji: string;
  /** Read through `t()` at render time, not stored translated (hard rule 1). */
  title: MessageKey;
  colour: string;
}

export const STATUSES: StatusPreset[] = [
  { id: 'on', emoji: '💬', title: 'status.on', colour: '#22c55e' },
  { id: 'focus', emoji: '🎯', title: 'status.focus', colour: '#7c6cf8' },
  { id: 'call', emoji: '📞', title: 'status.call', colour: '#06b6d4' },
  { id: 'away', emoji: '☕', title: 'status.away', colour: '#f59e0b' },
  { id: 'dnd', emoji: '🌙', title: 'status.dnd', colour: '#ef4444' },
  { id: 'off', emoji: '🏖', title: 'status.off', colour: '#8b8fa3' },
];

export function statusById(id: StatusId): StatusPreset {
  return STATUSES.find((status) => status.id === id) ?? (STATUSES[0] as StatusPreset);
}

/** The line shown under the name: the custom text wins, the preset is the fallback. */
export function statusLabel(user: Pick<User, 'statusId' | 'statusText'>): string {
  return user.statusText?.trim() || t(statusById(user.statusId).title);
}

/** What the client knows about somebody's presence, as far as the dot cares. */
type Seen = { online: boolean; statusId: StatusId | null } | undefined;

/**
 * The dot's colour for someone whose presence we have.
 *
 * Green for reachable was the whole vocabulary before (defect #11): a person who
 * had chosen "не беспокоить", or been away from the keyboard for an hour, looked
 * exactly like one who was typing. The server decides which status applies —
 * this only paints it — and an unreachable person has no dot at all.
 */
export function presenceColour(presence: Seen): string | undefined {
  if (!presence?.online) return undefined;
  return statusById(presence.statusId ?? 'on').colour;
}

/**
 * The custom property `.av.ol::after` paints itself with.
 *
 * Typed as CSSProperties because that is what it is spread into; React passes
 * custom properties through untouched, but the type does not know they exist.
 */
export function dotStyle(presence: Seen): CSSProperties {
  const colour = presenceColour(presence);
  return colour ? ({ '--dot': colour } as CSSProperties) : {};
}

/** Hovering the avatar says which status the colour means. */
export function presenceTitle(presence: Seen): string | undefined {
  if (!presence?.online) return undefined;
  return t(statusById(presence.statusId ?? 'on').title);
}
