import { sql } from '../../db/client.js';
import type { CallHistoryRow, CallParticipantRow, CallRow } from './types.js';

/** The only file in the calls module allowed to speak SQL (CONTRIBUTING.md layout rules). */

export async function insertCall(input: {
  chatId: string;
  startedBy: string;
  kind: string;
  room: string;
}): Promise<CallRow> {
  const rows = await sql<CallRow[]>`
    insert into calls (chat_id, started_by, kind, room)
    values (${input.chatId}, ${input.startedBy}, ${input.kind}, ${input.room})
    returning *`;
  const row = rows[0];
  if (!row) throw new Error('Call insert returned no row');
  return row;
}

export async function findCallById(id: string): Promise<CallRow | null> {
  const rows = await sql<CallRow[]>`select * from calls where id = ${id} limit 1`;
  return rows[0] ?? null;
}

/** The live call in a chat, if there is one. At most one exists by index. */
export async function findActiveCallInChat(chatId: string): Promise<CallRow | null> {
  const rows = await sql<CallRow[]>`
    select * from calls where chat_id = ${chatId} and ended_at is null limit 1`;
  return rows[0] ?? null;
}

/**
 * Every live call this person is part of.
 *
 * This is what a client asks for after reconnecting: hard rule 8 says nothing
 * may be reachable only through the socket, and "you are in a call right now"
 * is exactly the state a dropped connection loses.
 */
export async function listActiveCallsFor(userId: string): Promise<CallRow[]> {
  return sql<CallRow[]>`
    select c.* from calls c
    join chat_members m on m.chat_id = c.chat_id and m.user_id = ${userId}
    where c.ended_at is null
    order by c.started_at desc`;
}

/**
 * One page of finished calls, newest first.
 *
 * Cursor-keyed on `(started_at, id)` rather than an offset (hard rule 7), and
 * the whole row is assembled in SQL: whether a call was missed is a fact about
 * who joined it, and answering that per row from JavaScript would be one query
 * per call.
 */
export async function pageHistory(input: {
  userId: string;
  before: string | null;
  limit: number;
}): Promise<CallHistoryRow[]> {
  const cursor = input.before
    ? sql`and (c.started_at, c.id) < (select started_at, id from calls where id = ${input.before})`
    : sql``;

  return sql<CallHistoryRow[]>`
    select
      c.id,
      c.chat_id,
      c.kind,
      c.started_by,
      c.started_at,
      c.ended_at,
      ch.type as chat_type,
      ch.title as chat_title,
      (select u.display_name from chat_members cm
        join users u on u.id = cm.user_id
       where cm.chat_id = ch.id and cm.user_id <> ${input.userId}
       limit 1) as peer_name,
      (select cm.user_id from chat_members cm
       where cm.chat_id = ch.id and cm.user_id <> ${input.userId}
       limit 1) as peer_id,
      -- Somebody other than the caller was in the room: that is a call that
      -- happened. Without it every unanswered ring reads as a conversation.
      exists (
        select 1 from call_participants p
         where p.call_id = c.id
           and p.joined_at is not null
           and p.user_id is distinct from c.started_by
      ) as answered,
      -- Measured from the moment somebody *else* picked up, not from the first
      -- join: the caller joins their own room the instant it is created, so
      -- starting the clock there would count the ringing as conversation. When
      -- nobody else ever joined the filtered minimum is null and so is the
      -- duration, which is what a missed call should report.
      (select extract(epoch from (
                max(coalesce(p.left_at, c.ended_at))
                - min(p.joined_at) filter (where p.user_id is distinct from c.started_by)
              ))
         from call_participants p
        where p.call_id = c.id and p.joined_at is not null) as connected_seconds
    from calls c
    join chats ch on ch.id = c.chat_id
    join chat_members m on m.chat_id = c.chat_id and m.user_id = ${input.userId}
    where c.ended_at is not null
      ${cursor}
    order by c.started_at desc, c.id desc
    limit ${input.limit}`;
}

export async function endCall(id: string, reason: string): Promise<CallRow | null> {
  // `ended_at is null` in the where clause makes this idempotent: two people
  // hanging up at once must not overwrite the first reason with the second.
  const rows = await sql<CallRow[]>`
    update calls
       set ended_at = now(), end_reason = ${reason}
     where id = ${id} and ended_at is null
    returning *`;
  return rows[0] ?? null;
}

export async function inviteParticipants(callId: string, userIds: string[]): Promise<void> {
  for (const userId of userIds) {
    await sql`
      insert into call_participants (call_id, user_id)
      values (${callId}, ${userId})
      on conflict (call_id, user_id) do nothing`;
  }
}

export async function markJoined(callId: string, userId: string): Promise<void> {
  await sql`
    insert into call_participants (call_id, user_id, joined_at)
    values (${callId}, ${userId}, now())
    on conflict (call_id, user_id)
    do update set joined_at = coalesce(call_participants.joined_at, now()), left_at = null`;
}

export async function markLeft(callId: string, userId: string): Promise<void> {
  await sql`
    update call_participants set left_at = now()
     where call_id = ${callId} and user_id = ${userId} and left_at is null`;
}

/** Who is in the room now — joined and not gone again. */
export async function presentParticipantIds(callId: string): Promise<string[]> {
  const rows = await sql<{ userId: string }[]>`
    select user_id from call_participants
     where call_id = ${callId} and joined_at is not null and left_at is null`;
  return rows.map((r) => r.userId);
}

export async function participantsOf(callId: string): Promise<CallParticipantRow[]> {
  return sql<CallParticipantRow[]>`
    select * from call_participants where call_id = ${callId}`;
}

/**
 * Calls with nobody left to talk to.
 *
 * "Nobody" means fewer than two people in the room, not zero: the caller joins
 * their own call the moment they start it, so a ring nobody answers always has
 * exactly one participant. Waiting for it to reach zero means waiting forever,
 * which is what left ignored calls running until someone hung up by hand.
 *
 * The clock runs from the last departure rather than from the start, so a call
 * that ran an hour and then lost everyone but one person gets the same grace
 * period as a fresh ring — and a long call is not killed for being long.
 *
 * They matter beyond tidiness: one live call per chat is a partial unique index,
 * so a stuck row blocks every future call in that chat.
 */
export async function claimStaleCalls(olderThanSeconds: number): Promise<CallRow[]> {
  return sql<CallRow[]>`
    update calls
       set ended_at = now(),
           -- Nobody but the caller was ever in it: that is a missed call, not a
           -- call that ended. The history screen draws them differently.
           end_reason = case
             when exists (
               select 1 from call_participants p
                where p.call_id = calls.id
                  and p.joined_at is not null
                  and p.user_id is distinct from calls.started_by
             ) then 'hangup'
             else 'missed'
           end
     where ended_at is null
       and coalesce(
             (select max(p.left_at) from call_participants p where p.call_id = calls.id),
             calls.started_at
           ) < now() - make_interval(secs => ${olderThanSeconds})
       and (
         select count(*) from call_participants p
          where p.call_id = calls.id and p.joined_at is not null and p.left_at is null
       ) < 2
    returning *`;
}
