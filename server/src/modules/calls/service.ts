import { randomUUID } from 'node:crypto';
import type {
  Call,
  CallCredentials,
  CallEndReason,
  CallHistoryEntry,
  CallKind,
  Page,
} from '@bmf/shared';
import { ERROR } from '@bmf/shared';
import { AppError } from '../../lib/errors.js';
import { closeRoom, iceServers, livekitToken, mediaConfigured } from '../../lib/media.js';
import { config } from '../../lib/config.js';
import * as chats from '../chats/repo.js';
import * as auth from '../auth/repo.js';
import * as hub from '../../ws/hub.js';
import * as repo from './repo.js';
import type { CallHistoryRow, CallRow } from './types.js';

/**
 * Calls, as far as the API is concerned: who may start one, who is in it, and
 * when it ended. The media never passes through here — LiveKit carries that —
 * but every decision about who is allowed to join does, because a client that
 * decides for itself is a client that can be patched (hard rule 3).
 */

/** A ring nobody answers is not a call forever; the ringing side gives up too. */
export const RING_TIMEOUT_SECONDS = 60;

async function toCall(row: CallRow): Promise<Call> {
  return {
    id: row.id,
    chatId: row.chatId,
    startedBy: row.startedBy,
    kind: row.kind,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
    endReason: row.endReason,
    participantIds: await repo.presentParticipantIds(row.id),
  };
}

async function assertMember(chatId: string, userId: string): Promise<void> {
  const membership = await chats.findMembership(chatId, userId);
  if (!membership) throw AppError.forbidden('You are not in this chat');
}

function assertConfigured(): void {
  if (!mediaConfigured()) {
    // A development machine has no media services, and a call that fails at the
    // moment someone dials is worse than one that says so up front.
    throw new AppError(ERROR.UNAVAILABLE, 'Calls are not configured on this server', 503);
  }
}

async function credentialsFor(row: CallRow, userId: string): Promise<CallCredentials> {
  const user = await auth.findUserById(userId);

  return {
    call: await toCall(row),
    token: await livekitToken(row.room, userId, user?.displayName || user?.username || 'guest'),
    url: config.LIVEKIT_URL ?? '',
    iceServers: iceServers(userId),
  };
}

/**
 * Starts a call, or hands back the one already running.
 *
 * Joining an existing call rather than refusing is what makes the button behave
 * the way people expect: two people pressing "call" in the same chat at the same
 * second end up in one room, not in two rooms wondering where the other went.
 */
export async function start(input: {
  chatId: string;
  userId: string;
  kind: CallKind;
}): Promise<CallCredentials> {
  assertConfigured();
  await assertMember(input.chatId, input.userId);

  const existing = await repo.findActiveCallInChat(input.chatId);
  if (existing) {
    await repo.markJoined(existing.id, input.userId);
    const credentials = await credentialsFor(existing, input.userId);
    await announce('call.state', credentials.call, input.chatId);
    return credentials;
  }

  const row = await repo.insertCall({
    chatId: input.chatId,
    startedBy: input.userId,
    kind: input.kind,
    // Named after the call, not the chat: a room name reused while the previous
    // call is still shutting down puts new arrivals in the old room.
    room: `call-${randomUUID()}`,
  });

  const members = await chats.memberIds(input.chatId);
  await repo.inviteParticipants(row.id, members);
  await repo.markJoined(row.id, input.userId);

  const credentials = await credentialsFor(row, input.userId);

  // Everyone but the caller gets a ring; the caller gets the state instead.
  // The caller needs it too: their main window draws the pill from the call it
  // knows about, and without this it knows about nothing until someone answers.
  await hub.publish(
    members.filter((id) => id !== input.userId),
    { type: 'call.incoming', payload: credentials.call },
  );
  await hub.publish([input.userId], { type: 'call.state', payload: credentials.call });

  return credentials;
}

/** Joins a call that is already ringing or running. */
export async function join(callId: string, userId: string): Promise<CallCredentials> {
  assertConfigured();

  const row = await repo.findCallById(callId);
  if (!row) throw AppError.notFound('Call not found');
  if (row.endedAt) throw new AppError(ERROR.CONFLICT, 'This call has already ended', 409);

  await assertMember(row.chatId, userId);
  await repo.markJoined(callId, userId);

  const credentials = await credentialsFor(row, userId);
  await announce('call.state', credentials.call, row.chatId);
  return credentials;
}

/**
 * Leaves without ending it for everyone — unless nobody is left, in which case
 * the call is over and saying so beats leaving an empty room open.
 */
export async function leave(callId: string, userId: string): Promise<Call> {
  const row = await repo.findCallById(callId);
  if (!row) throw AppError.notFound('Call not found');
  await assertMember(row.chatId, userId);

  await repo.markLeft(callId, userId);

  const remaining = await repo.presentParticipantIds(callId);
  if (remaining.length === 0 && !row.endedAt) {
    return end(callId, userId, 'hangup');
  }

  const call = await toCall(row);
  await announce('call.state', call, row.chatId);
  return call;
}

export async function end(
  callId: string,
  userId: string,
  reason: CallEndReason = 'hangup',
): Promise<Call> {
  const row = await repo.findCallById(callId);
  if (!row) throw AppError.notFound('Call not found');
  await assertMember(row.chatId, userId);

  // Already ended by whoever hung up first; report that rather than a second
  // ending with a different reason.
  const ended = (await repo.endCall(callId, reason)) ?? row;

  // Ending it here does not stop LiveKit. Without this the room stays open and
  // anyone still in it keeps listening to an empty call.
  await closeRoom(row.room);

  const call = await toCall(ended);
  await announce('call.state', call, row.chatId);
  return call;
}

/** What a reconnecting client has to catch up on (hard rule 8). */
export async function listActive(userId: string): Promise<Call[]> {
  const rows = await repo.listActiveCallsFor(userId);
  return Promise.all(rows.map(toCall));
}

/** The history screen, one cursor-keyed page at a time (hard rule 7). */
export async function history(input: {
  userId: string;
  before: string | null;
  limit: number;
}): Promise<Page<CallHistoryEntry>> {
  // One row more than asked for: whether another page exists is not something
  // the count of this one can answer.
  const rows = await repo.pageHistory({ ...input, limit: input.limit + 1 });
  const page = rows.slice(0, input.limit);
  const last = page.at(-1);

  return {
    items: page.map((row) => toHistoryEntry(row, input.userId)),
    nextCursor: rows.length > input.limit && last ? last.id : null,
  };
}

function toHistoryEntry(row: CallHistoryRow, userId: string): CallHistoryEntry {
  const seconds = row.connectedSeconds === null ? null : Number(row.connectedSeconds);

  return {
    id: row.id,
    chatId: row.chatId,
    // A direct chat carries no title of its own — it is named after the person
    // on the other side, the same way the chat list names it.
    title: (row.chatType === 'dm' ? row.peerName : row.chatTitle) || 'Без названия',
    peerId: row.peerId,
    kind: row.kind,
    direction: row.startedBy === userId ? 'out' : 'in',
    missed: !row.answered,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
    // A ring nobody picked up has no duration, and zero would read as one.
    durationSeconds: seconds === null || Number.isNaN(seconds) ? null : Math.max(0, Math.round(seconds)),
  };
}

async function announce(
  type: 'call.state' | 'call.incoming',
  call: Call,
  chatId: string,
): Promise<void> {
  const members = await chats.memberIds(chatId);
  await hub.publish(members, { type, payload: call });
}

/**
 * Ends calls with nobody left to talk to: a ring nobody answered, or a room
 * everyone but one person has left.
 *
 * Run from the job registry rather than on a timer per call, because the process
 * that started the ring may not be the one still running when it expires.
 *
 * Two reasons it has to exist. One live call per chat is a database constraint,
 * so a stuck row blocks every future call there. And the caller sits in their
 * own room until something ends it — without this, an unanswered call runs until
 * they notice, which is exactly the bug this was written for.
 */
export async function sweepStale(): Promise<number> {
  const stale = await repo.claimStaleCalls(RING_TIMEOUT_SECONDS);

  for (const row of stale) {
    // Closing the room is what actually removes the caller from it; the row is
    // only what the rest of the system reads.
    await closeRoom(row.room);
    const call = await toCall(row);
    await announce('call.state', call, row.chatId);
  }

  return stale.length;
}
