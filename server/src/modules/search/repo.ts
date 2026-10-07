import { sql } from '../../db/client.js';
import type { MessageRow } from '../chats/types.js';

/**
 * Full-text search over messages the caller can actually see. Postgres GIN,
 * no external engine — spec section 5 is explicit about that.
 *
 * `websearch_to_tsquery` accepts what people actually type (quoted phrases,
 * `or`, leading `-`) and never throws on malformed input, unlike `to_tsquery`.
 */
export interface SearchHit extends MessageRow {
  chatTitle: string;
  chatType: string;
  senderUsername: string | null;
  rank: number;
}

export async function searchMessages(input: {
  userId: string;
  query: string;
  chatId?: string;
  fromUserId?: string;
  hasAttachment?: boolean;
  limit: number;
}): Promise<SearchHit[]> {
  return sql<SearchHit[]>`
    select
      m.*,
      -- A direct chat has no title of its own; name it after the other person,
      -- the same way the chat list does.
      case
        when c.type = 'dm' then coalesce((
          select u2.display_name from chat_members cm2
          join users u2 on u2.id = cm2.user_id
          where cm2.chat_id = c.id and cm2.user_id <> ${input.userId}
          limit 1
        ), c.title)
        else c.title
      end as chat_title,
      c.type as chat_type,
      u.username as sender_username,
      ts_rank(to_tsvector('russian', m.body), websearch_to_tsquery('russian', ${input.query}))
        as rank
    from messages m
    join chat_members cm on cm.chat_id = m.chat_id and cm.user_id = ${input.userId}
    join chats c on c.id = m.chat_id
    left join users u on u.id = m.sender_id
    where m.deleted_at is null
      -- A chat in privacy mode has nothing to match: its bodies are empty and
      -- the text is in an envelope this server cannot open. Excluding it
      -- explicitly is what keeps that true if a plaintext row ever slips in.
      and c.e2e_state <> 'on'
      -- History this member deleted is gone from search too, or the chat they
      -- removed would come back through the search box.
      and m.created_at > coalesce(cm.cleared_at, '-infinity'::timestamptz)
      and to_tsvector('russian', m.body) @@ websearch_to_tsquery('russian', ${input.query})
      ${input.chatId ? sql`and m.chat_id = ${input.chatId}` : sql``}
      ${input.fromUserId ? sql`and m.sender_id = ${input.fromUserId}` : sql``}
      ${
        input.hasAttachment
          ? sql`and exists (select 1 from attachments a where a.message_id = m.id)`
          : sql``
      }
    order by rank desc, m.created_at desc
    limit ${input.limit}`;
}

/** Resolves a `from:` filter written as a username into an id. */
export async function findUserIdByUsername(username: string): Promise<string | null> {
  const rows = await sql<{ id: string }[]>`
    select id from users where lower(username) = lower(${username}) and deleted_at is null limit 1`;
  return rows[0]?.id ?? null;
}
