import type { Presence, StatusId } from '@bmf/shared';
import * as hub from '../../ws/hub.js';
import * as userRepo from '../users/repo.js';
import * as repo from './repo.js';

/**
 * How long a machine has to sit untouched before an automatic status says so.
 *
 * Five minutes is the number every desktop messenger settled on, and the reason
 * is the same everywhere: shorter marks people away for reading, longer says
 * "here" about somebody who left for coffee twenty minutes ago.
 */
export const AWAY_AFTER_MS = 5 * 60 * 1000;

/**
 * What to show about somebody, given what they chose and what the machine saw.
 *
 * Kept pure and exported so the rule is provable without a Redis: this is the
 * whole of defect #11 — a status that changed nothing because nothing ever
 * asked what it was.
 */
export function effectiveStatus(
  chosen: StatusId,
  auto: boolean,
  online: boolean,
  idleMs: number | null,
): StatusId | null {
  // Offline is its own answer. Reporting "в фокусе" about a closed laptop would
  // be the same lie the old green dot told, in a different colour.
  if (!online) return null;
  if (!auto) return chosen;

  // An automatic status the person set to "не беспокоить" stays that way — the
  // point of following activity is to notice absence, not to overrule a choice
  // that is about attention rather than presence.
  if (chosen === 'dnd' || chosen === 'off') return chosen;

  return idleMs !== null && idleMs >= AWAY_AFTER_MS ? 'away' : 'on';
}

/** Shapes a Redis reading into the wire model. */
function toPresence(
  userId: string,
  state: { online: boolean; lastSeen: number | null; activeAt: number | null } | undefined,
  status: { statusId: StatusId; statusAuto: boolean } | undefined,
): Presence {
  const online = state?.online ?? false;
  const idleMs = state?.activeAt ? Math.max(0, Date.now() - state.activeAt) : null;

  return {
    userId,
    online,
    lastSeenAt: state?.lastSeen ? new Date(state.lastSeen).toISOString() : null,
    statusId: effectiveStatus(status?.statusId ?? 'on', status?.statusAuto ?? false, online, idleMs),
  };
}

/**
 * Presence for a set of people, with `lastSeenAt` withheld from anyone who
 * asked for it to be.
 *
 * The setting hides the *time*, not the fact: others still see whether the
 * person is reachable, they just do not learn when they last were. Hiding the
 * online flag too would mean reporting somebody as offline while they read your
 * message, and a messenger that lies about that is worse than one that tells
 * you less.
 */
export async function readMany(userIds: string[]): Promise<Presence[]> {
  const unique = [...new Set(userIds)];
  const [states, hidden, statuses] = await Promise.all([
    repo.read(unique),
    userRepo.hideLastSeen(unique),
    userRepo.statusesOf(unique),
  ]);

  return unique.map((userId) => {
    const presence = toPresence(userId, states.get(userId), statuses.get(userId));
    return hidden.has(userId) ? { ...presence, lastSeenAt: null } : presence;
  });
}

async function announce(userId: string, known?: Presence): Promise<void> {
  const presence = known ?? (await readMany([userId]))[0];
  if (!presence) return;

  const observers = await repo.observersOf(userId);
  await hub.publish(observers, { type: 'presence.update', payload: presence });
}

/**
 * A device connected or sent a heartbeat.
 *
 * Only the transition to online is announced. A heartbeat from an already-online
 * user changes nothing anyone can see, and broadcasting it every twenty seconds
 * to everyone who shares a chat would be the loudest traffic in the system.
 */
export async function heartbeat(
  userId: string,
  deviceId: string,
  idleSeconds?: number,
): Promise<void> {
  const [before] = await readMany([userId]);
  // The number arrives over a socket from a client, so it is a claim rather than
  // a reading. A day is the ceiling: anything longer says the same thing.
  const idle =
    typeof idleSeconds === 'number' && Number.isFinite(idleSeconds)
      ? Math.min(Math.max(0, idleSeconds), 86_400)
      : undefined;

  await repo.touch(userId, deviceId, idle);

  // Coming online is worth announcing, and so is crossing the line between "at
  // the keyboard" and "away" — that transition is the whole of an automatic
  // status, and it happens without anyone connecting or disconnecting. Nothing
  // else is: there is a heartbeat every twenty seconds per device, and one that
  // changes nothing must stay silent.
  const [after] = await readMany([userId]);
  if (!after) return;
  if (before?.online === after.online && before?.statusId === after.statusId) return;

  await announce(userId, after);
}

/**
 * A device went away. The user stays online while any other device holds a
 * socket — a phone locking its screen must not black out the desktop.
 */
export async function disconnected(userId: string, deviceId: string): Promise<void> {
  await repo.drop(userId, deviceId);
  await announce(userId);
}
