import type { Envelope } from '@bmf/shared';
import { sql } from '../../db/client.js';
import type {
  ChatMemberRow,
  ChatRow,
  ChatWithMembership,
  MemberWithUserRow,
  MessageRow,
  ReactionMap,
} from './types.js';

/** The only file in the chats module allowed to speak SQL (CONTRIBUTING.md layout rules). */

export async function createChat(input: {
  type: string;
  title: string;
  description?: string;
  avatarUrl?: string | null;
  createdBy: string;
}): Promise<ChatRow> {
  const rows = await sql<ChatRow[]>`
    insert into chats (type, title, description, avatar_url, created_by)
    values (
      ${input.type}, ${input.title}, ${input.description ?? ''},
      ${input.avatarUrl ?? null}, ${input.createdBy}
    )
    returning *`;
  const row = rows[0];
  if (!row) throw new Error('Chat insert returned no row');
  return row;
}

export async function addMembers(
  chatId: string,
  members: { userId: string; role: string }[],
): Promise<void> {
  for (const member of members) {
    await sql`
      insert into chat_members (chat_id, user_id, role)
      values (${chatId}, ${member.userId}, ${member.role})
      on conflict (chat_id, user_id) do nothing`;
  }
}

export async function findMembership(
  chatId: string,
  userId: string,
): Promise<ChatMemberRow | null> {
  const rows = await sql<ChatMemberRow[]>`
    select * from chat_members where chat_id = ${chatId} and user_id = ${userId} limit 1`;
  return rows[0] ?? null;
}

export async function memberIds(chatId: string): Promise<string[]> {
  const rows = await sql<{ userId: string }[]>`
    select user_id from chat_members where chat_id = ${chatId}`;
  return rows.map((r) => r.userId);
}

/**
 * The roster, with each member's profile alongside their role.
 *
 * Owners and admins first, then everyone by the name they are listed under, so
 * the panel reads the same on every open — `joined_at` would reorder the list
 * whenever somebody rejoined.
 */
export async function listMembers(chatId: string): Promise<MemberWithUserRow[]> {
  // Columns are named one by one rather than `u.*`: this row travels to every
  // member of the chat, and `select *` on `users` would put the password hash
  // and the email address one careless mapper away from the wire.
  return sql<MemberWithUserRow[]>`
    select
      m.user_id, m.role, m.joined_at,
      u.username, u.display_name, u.avatar_url,
      u.status_id, u.status_text, u.status_auto, u.show_last_seen, u.is_pro, u.created_at
    from chat_members m
    join users u on u.id = m.user_id
    where m.chat_id = ${chatId} and u.deleted_at is null
    order by
      case m.role when 'owner' then 0 when 'admin' then 1 else 2 end,
      u.display_name`;
}

/** Hides everything written so far from one member, leaving the chat itself alone. */
export async function clearFor(chatId: string, userId: string): Promise<void> {
  await sql`
    update chat_members set cleared_at = now(), draft = null, is_later = false
    where chat_id = ${chatId} and user_id = ${userId}`;
}

export async function removeMember(chatId: string, userId: string): Promise<void> {
  await sql`delete from chat_members where chat_id = ${chatId} and user_id = ${userId}`;
}

export async function countMembers(chatId: string): Promise<number> {
  const rows = await sql<{ count: string }[]>`
    select count(*) from chat_members where chat_id = ${chatId}`;
  return Number(rows[0]?.count ?? 0);
}

/**
 * Hands the chat to somebody after its owner walks out: the longest-standing
 * admin, or the longest-standing member when there is no admin left.
 *
 * A group with no owner has nobody who can pin, moderate or eventually delete
 * it, and every request to do so would be refused with no way to recover. The
 * handover is silent because the alternative — refusing to let an owner leave
 * until they nominate a successor — is a dialog nobody would finish.
 */
export async function promoteSuccessor(chatId: string): Promise<string | null> {
  const rows = await sql<{ userId: string }[]>`
    update chat_members set role = 'owner'
    where chat_id = ${chatId} and user_id = (
      select user_id from chat_members
      where chat_id = ${chatId}
      order by case role when 'admin' then 0 else 1 end, joined_at
      limit 1
    )
    returning user_id`;
  return rows[0]?.userId ?? null;
}

export async function updateChat(
  chatId: string,
  patch: { title?: string; description?: string; avatarUrl?: string | null },
): Promise<ChatRow | null> {
  const rows = await sql<ChatRow[]>`
    update chats set
      title       = coalesce(${patch.title ?? null}, title),
      description = coalesce(${patch.description ?? null}, description),
      avatar_url  = ${patch.avatarUrl === undefined ? sql`avatar_url` : patch.avatarUrl},
      updated_at  = now()
    where id = ${chatId} and deleted_at is null
    returning *`;
  return rows[0] ?? null;
}

/** The chat whose picture this attachment is, if it is one. */
export async function chatWithAvatar(attachmentId: string): Promise<string | null> {
  const rows = await sql<{ id: string }[]>`
    select id from chats where avatar_url = ${attachmentId} and deleted_at is null limit 1`;
  return rows[0]?.id ?? null;
}

export async function softDeleteChat(chatId: string): Promise<void> {
  await sql`update chats set deleted_at = now() where id = ${chatId}`;
}

/**
 * Finds the existing direct chat between two people. A DM is defined by having
 * exactly these two members, so opening one twice never creates a second row.
 */
export async function findDirectChat(a: string, b: string): Promise<ChatRow | null> {
  const rows = await sql<ChatRow[]>`
    select c.* from chats c
    join chat_members m1 on m1.chat_id = c.id and m1.user_id = ${a}
    join chat_members m2 on m2.chat_id = c.id and m2.user_id = ${b}
    where c.type = 'dm' and c.deleted_at is null
      and (select count(*) from chat_members m where m.chat_id = c.id) = 2
    limit 1`;
  return rows[0] ?? null;
}

export async function listChatsFor(userId: string): Promise<ChatWithMembership[]> {
  return sql<ChatWithMembership[]>`
    select
      c.*,
      m.role, m.folder, m.is_later, m.draft,
      coalesce((
        select count(*) from messages msg
        where msg.chat_id = c.id
          and msg.deleted_at is null
          and msg.sender_id is distinct from ${userId}
          and msg.created_at > coalesce(m.cleared_at, '-infinity'::timestamptz)
          and (
            r.last_read_message_id is null
            or msg.created_at > (select created_at from messages where id = r.last_read_message_id)
          )
      ), 0) as unread_count,
      -- Every pin, newest first. Capped because the header bar pages through
      -- them by hand: a chat that pinned a hundred things has a scrollback
      -- problem, not a header problem.
      coalesce((select array_agg(p.message_id order by p.pinned_at desc)
        from (select message_id, pinned_at from pinned_messages
              where chat_id = c.id order by pinned_at desc limit 50) p),
        '{}') as pinned_message_ids,
      -- A direct chat has no title of its own; it is named after the other
      -- person, so the list does not read as a column of "Личный чат".
      (select u.display_name from chat_members cm
       join users u on u.id = cm.user_id
       where cm.chat_id = c.id and cm.user_id <> ${userId}
       limit 1) as peer_name,
      (select cm.user_id from chat_members cm
       where cm.chat_id = c.id and cm.user_id <> ${userId}
       limit 1) as peer_id
    from chats c
    join chat_members m on m.chat_id = c.id and m.user_id = ${userId}
    left join message_reads r on r.chat_id = c.id and r.user_id = ${userId}
    where c.deleted_at is null
      -- A direct chat this member deleted stays out of their list until the
      -- other side writes again. Membership survives so that message has
      -- somewhere to arrive; the list is what forgets.
      and (
        m.cleared_at is null
        or exists (
          select 1 from messages msg
          where msg.chat_id = c.id and msg.created_at > m.cleared_at
        )
      )
    order by c.updated_at desc`;
}

/**
 * Moves a chat between the three privacy states.
 *
 * `is_e2e` is written alongside `e2e_state` rather than derived from it: the
 * chat list has read that boolean since the first migration, and two sources of
 * truth that disagree is worse than one column written in one place.
 */
export async function setPrivacy(input: {
  chatId: string;
  state: 'off' | 'proposed' | 'on';
  proposedBy: string | null;
  devices: string[];
}): Promise<ChatRow | null> {
  const rows = await sql<ChatRow[]>`
    update chats
       set e2e_state       = ${input.state},
           is_e2e          = ${input.state === 'on'},
           e2e_proposed_by = ${input.proposedBy},
           e2e_devices     = ${sql.json(input.devices)},
           updated_at      = now()
     where id = ${input.chatId} and deleted_at is null
    returning *`;
  return rows[0] ?? null;
}

export async function findChatById(id: string): Promise<ChatRow | null> {
  const rows = await sql<ChatRow[]>`
    select * from chats where id = ${id} and deleted_at is null limit 1`;
  return rows[0] ?? null;
}

export async function touchChat(id: string): Promise<void> {
  await sql`update chats set updated_at = now() where id = ${id}`;
}

export async function setChatTitle(id: string, title: string): Promise<void> {
  await sql`update chats set title = ${title}, updated_at = now() where id = ${id}`;
}

/** Idempotent by (chat, sender, client_msg_id) — a retry returns the first row. */
export async function findByClientMsgId(
  chatId: string,
  senderId: string,
  clientMsgId: string,
): Promise<MessageRow | null> {
  const rows = await sql<MessageRow[]>`
    select * from messages
    where chat_id = ${chatId} and sender_id = ${senderId} and client_msg_id = ${clientMsgId}
    limit 1`;
  return rows[0] ?? null;
}

export async function insertMessage(input: {
  chatId: string;
  senderId: string;
  clientMsgId: string;
  kind: string;
  body: string;
  replyTo: string | null;
  forwardedFrom: string | null;
  scheduledAt: Date | null;
  envelope: Envelope | null;
}): Promise<MessageRow> {
  const rows = await sql<MessageRow[]>`
    insert into messages (
      chat_id, sender_id, client_msg_id, kind, body, reply_to, forwarded_from,
      scheduled_at, envelope
    )
    values (
      ${input.chatId}, ${input.senderId}, ${input.clientMsgId}, ${input.kind},
      ${input.body}, ${input.replyTo}, ${input.forwardedFrom}, ${input.scheduledAt},
      ${input.envelope ? sql.json({ ...input.envelope }) : null}
    )
    returning *`;
  const row = rows[0];
  if (!row) throw new Error('Message insert returned no row');
  return row;
}

export async function findMessageById(id: string): Promise<MessageRow | null> {
  const rows = await sql<MessageRow[]>`select * from messages where id = ${id} limit 1`;
  return rows[0] ?? null;
}

/**
 * The half of a chat's history one member is still entitled to see.
 *
 * Deleting a direct chat clears it for the person who did it and leaves the
 * other side untouched, so "what is in this chat" has no single answer any
 * more — every read of `messages` has to be asked on someone's behalf.
 */
function afterClearing(chatId: string, viewerId: string) {
  return sql`created_at > coalesce(
    (select cleared_at from chat_members where chat_id = ${chatId} and user_id = ${viewerId}),
    '-infinity'::timestamptz
  )`;
}

/**
 * One page of history, newest first, keyed on the cursor rather than an offset.
 * The sort key is resolved inside the query so no timestamp ever round-trips
 * through JavaScript, where it would lose microseconds.
 */
export async function pageMessages(input: {
  chatId: string;
  before: string | null;
  limit: number;
  /**
   * Whose view this is. A message waiting to be sent is visible only to its
   * author — everyone else must not see it until it is actually delivered.
   */
  viewerId: string;
}): Promise<MessageRow[]> {
  const visible = sql`
    (scheduled_at is null or sender_id = ${input.viewerId})
    and ${afterClearing(input.chatId, input.viewerId)}`;

  if (input.before) {
    return sql<MessageRow[]>`
      select * from messages
      where chat_id = ${input.chatId}
        and ${visible}
        and (created_at, id) < (
          select created_at, id from messages where id = ${input.before}
        )
      order by created_at desc, id desc
      limit ${input.limit}`;
  }

  return sql<MessageRow[]>`
    select * from messages
    where chat_id = ${input.chatId}
      and ${visible}
    order by created_at desc, id desc
    limit ${input.limit}`;
}

/**
 * Messages whose moment has come.
 *
 * Delivery clears `scheduled_at` and restamps `created_at`, so the message lands
 * at the end of the timeline where the recipient is looking rather than buried
 * in history at the moment it was composed. The claim is done in the same
 * statement so two server processes cannot both deliver it.
 */
export async function claimDueMessages(limit: number): Promise<MessageRow[]> {
  return sql<MessageRow[]>`
    update messages set scheduled_at = null, created_at = now()
    where id in (
      select id from messages
      where scheduled_at is not null
        and scheduled_at <= now()
        and deleted_at is null
      order by scheduled_at
      limit ${limit}
      for update skip locked
    )
    returning *`;
}

export async function editMessage(id: string, body: string): Promise<MessageRow | null> {
  const rows = await sql<MessageRow[]>`
    update messages set body = ${body}, edited_at = now()
    where id = ${id} and deleted_at is null
    returning *`;
  return rows[0] ?? null;
}

/** Soft delete: the row stays so replies and forwards still resolve. */
export async function softDeleteMessage(id: string): Promise<void> {
  await sql`update messages set deleted_at = now(), body = '', meta = '{}'::jsonb where id = ${id}`;
}

export async function addReaction(
  messageId: string,
  userId: string,
  emoji: string,
): Promise<void> {
  await sql`
    insert into message_reactions (message_id, user_id, emoji)
    values (${messageId}, ${userId}, ${emoji})
    on conflict do nothing`;
}

export async function removeReaction(
  messageId: string,
  userId: string,
  emoji: string,
): Promise<void> {
  await sql`
    delete from message_reactions
    where message_id = ${messageId} and user_id = ${userId} and emoji = ${emoji}`;
}

export async function hasReaction(
  messageId: string,
  userId: string,
  emoji: string,
): Promise<boolean> {
  const rows = await sql`
    select 1 from message_reactions
    where message_id = ${messageId} and user_id = ${userId} and emoji = ${emoji} limit 1`;
  return rows.length > 0;
}

/** Tallies for a page of messages in one query, rather than one query per message. */
export async function reactionsFor(
  messageIds: string[],
  viewerId: string,
): Promise<Map<string, ReactionMap>> {
  const result = new Map<string, ReactionMap>();
  if (messageIds.length === 0) return result;

  const rows = await sql<{ messageId: string; emoji: string; count: string; mine: boolean }[]>`
    select
      message_id, emoji, count(*) as count,
      bool_or(user_id = ${viewerId}) as mine
    from message_reactions
    where message_id = any(${messageIds}::uuid[])
    group by message_id, emoji`;

  for (const row of rows) {
    const map = result.get(row.messageId) ?? {};
    map[row.emoji] = { count: Number(row.count), mine: row.mine };
    result.set(row.messageId, map);
  }

  return result;
}

/**
 * Pinning is additive: a chat keeps several pins and the header pages through
 * them. Repinning the same message is not an error and not a second row — it
 * moves the pin to the front, which is what someone who pinned it again meant.
 */
export async function addPin(
  chatId: string,
  messageId: string,
  pinnedBy: string,
): Promise<void> {
  await sql`
    insert into pinned_messages (chat_id, message_id, pinned_by)
    values (${chatId}, ${messageId}, ${pinnedBy})
    on conflict (chat_id, message_id) do update
      set pinned_by = excluded.pinned_by, pinned_at = now()`;
}

export async function removePin(chatId: string, messageId: string): Promise<void> {
  await sql`delete from pinned_messages where chat_id = ${chatId} and message_id = ${messageId}`;
}

export async function clearPins(chatId: string): Promise<void> {
  await sql`delete from pinned_messages where chat_id = ${chatId}`;
}

export async function isPinned(chatId: string, messageId: string): Promise<boolean> {
  const [row] = await sql<{ exists: boolean }[]>`
    select exists(
      select 1 from pinned_messages where chat_id = ${chatId} and message_id = ${messageId}
    ) as exists`;

  return row?.exists ?? false;
}

export async function markRead(
  chatId: string,
  userId: string,
  messageId: string,
): Promise<void> {
  await sql`
    insert into message_reads (chat_id, user_id, last_read_message_id, updated_at)
    values (${chatId}, ${userId}, ${messageId}, now())
    on conflict (chat_id, user_id) do update
      set last_read_message_id = excluded.last_read_message_id, updated_at = now()`;
}

export async function setDraft(
  chatId: string,
  userId: string,
  draft: string | null,
): Promise<void> {
  await sql`
    update chat_members set draft = ${draft}
    where chat_id = ${chatId} and user_id = ${userId}`;
}

/**
 * Where this chat sits for this member. Both columns are per-member, not
 * per-chat: filing a conversation away is your own decision, not everyone's.
 */
export async function setPlacement(
  chatId: string,
  userId: string,
  patch: { folder?: string | null; isLater?: boolean },
): Promise<void> {
  await sql`
    update chat_members set
      folder   = ${patch.folder === undefined ? sql`folder` : patch.folder},
      is_later = coalesce(${patch.isLater ?? null}, is_later)
    where chat_id = ${chatId} and user_id = ${userId}`;
}

/** Messages created after the cursor across every chat the user belongs to. */
export async function messagesSince(
  userId: string,
  since: string | null,
  limit: number,
): Promise<MessageRow[]> {
  // The clearing filter belongs here too, or a client that reconnects with an
  // old cursor would be handed back the history it just deleted.
  if (since) {
    return sql<MessageRow[]>`
      select m.* from messages m
      join chat_members cm on cm.chat_id = m.chat_id and cm.user_id = ${userId}
      where (m.created_at, m.id) > (select created_at, id from messages where id = ${since})
        and m.created_at > coalesce(cm.cleared_at, '-infinity'::timestamptz)
      order by m.created_at asc, m.id asc
      limit ${limit}`;
  }

  return sql<MessageRow[]>`
    select m.* from messages m
    join chat_members cm on cm.chat_id = m.chat_id and cm.user_id = ${userId}
    where m.created_at > coalesce(cm.cleared_at, '-infinity'::timestamptz)
    order by m.created_at asc, m.id asc
    limit ${limit}`;
}

export async function readsFor(
  userId: string,
): Promise<{ chatId: string; userId: string; lastReadMessageId: string | null }[]> {
  return sql<{ chatId: string; userId: string; lastReadMessageId: string | null }[]>`
    select r.chat_id, r.user_id, r.last_read_message_id
    from message_reads r
    join chat_members cm on cm.chat_id = r.chat_id and cm.user_id = ${userId}`;
}
