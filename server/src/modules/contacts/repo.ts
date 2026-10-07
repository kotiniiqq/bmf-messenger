import { sql } from '../../db/client.js';
import type { ContactWithUserRow } from './types.js';

/**
 * Somebody's contacts, newest first.
 *
 * Columns are named one by one rather than `u.*`, for the same reason the chat
 * roster does it: this row travels to a client, and `select *` on `users` puts
 * the password hash and the email address one careless mapper away from the
 * wire. A deleted account is left out rather than shown as a blank row.
 */
export async function list(ownerId: string): Promise<ContactWithUserRow[]> {
  return sql<ContactWithUserRow[]>`
    select
      c.user_id, c.local_name, c.created_at,
      u.username, u.display_name, u.avatar_url,
      u.status_id, u.status_text, u.status_auto, u.show_last_seen, u.is_pro,
      u.created_at as user_created_at
    from contacts c
    join users u on u.id = c.user_id
    where c.owner_id = ${ownerId} and u.deleted_at is null
    order by c.created_at desc`;
}

/** Adding somebody already added is a rename, not an error. */
export async function upsert(
  ownerId: string,
  userId: string,
  localName: string | null,
): Promise<void> {
  await sql`
    insert into contacts (owner_id, user_id, local_name)
    values (${ownerId}, ${userId}, ${localName})
    on conflict (owner_id, user_id) do update set local_name = excluded.local_name`;
}

export async function remove(ownerId: string, userId: string): Promise<void> {
  await sql`delete from contacts where owner_id = ${ownerId} and user_id = ${userId}`;
}

export async function findOne(
  ownerId: string,
  userId: string,
): Promise<ContactWithUserRow | undefined> {
  const rows = await sql<ContactWithUserRow[]>`
    select
      c.user_id, c.local_name, c.created_at,
      u.username, u.display_name, u.avatar_url,
      u.status_id, u.status_text, u.status_auto, u.show_last_seen, u.is_pro,
      u.created_at as user_created_at
    from contacts c
    join users u on u.id = c.user_id
    where c.owner_id = ${ownerId} and c.user_id = ${userId} and u.deleted_at is null`;

  return rows[0];
}
