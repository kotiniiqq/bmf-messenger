import type { StatusId } from '@bmf/shared';
import { sql } from '../../db/client.js';
import type { UserRow } from '../auth/types.js';

/**
 * Directory lookups. Deliberately narrow: during a closed beta people find each
 * other by an exact-ish handle, not by browsing a member list.
 */
/**
 * `%` and `_` are wildcards to LIKE. Left as typed, a query of "%" matches every
 * row and turns the search box into a directory dump of the whole instance.
 */
function escapeLike(value: string): string {
  return value.replace(/([\\%_])/g, '\\$1');
}

export async function searchByHandle(query: string, excludeUserId: string, limit: number) {
  // Prefix match on the username only. Matching email would let anyone confirm
  // whether an address is registered here, which is nobody's business.
  const pattern = `${escapeLike(query.toLowerCase())}%`;

  return sql<UserRow[]>`
    select * from users
    where lower(username) like ${pattern} escape '\\'
      and id <> ${excludeUserId}
      and deleted_at is null
    order by username
    limit ${limit}`;
}

export async function updateProfile(
  userId: string,
  patch: {
    username?: string;
    displayName?: string;
    statusId?: string;
    statusText?: string | null;
    statusAuto?: boolean;
    avatarUrl?: string | null;
    showLastSeen?: boolean;
  },
): Promise<UserRow | null> {
  const rows = await sql<UserRow[]>`
    update users set
      username       = coalesce(${patch.username ?? null}, username),
      display_name   = coalesce(${patch.displayName ?? null}, display_name),
      status_id      = coalesce(${patch.statusId ?? null}, status_id),
      status_text    = ${patch.statusText === undefined ? sql`status_text` : patch.statusText},
      status_auto    = coalesce(${patch.statusAuto ?? null}, status_auto),
      show_last_seen = coalesce(${patch.showLastSeen ?? null}, show_last_seen),
      avatar_url     = ${patch.avatarUrl === undefined ? sql`avatar_url` : patch.avatarUrl}
    where id = ${userId} and deleted_at is null
    returning *`;
  return rows[0] ?? null;
}

/**
 * Whether a handle is spoken for by somebody else.
 *
 * Case-insensitively, because usernames are stored lowercase and the whole
 * point of that rule is that `maria` and `Maria` are not two people.
 */
export async function usernameTakenBySomeoneElse(
  username: string,
  userId: string,
): Promise<boolean> {
  const rows = await sql`
    select 1 from users
    where lower(username) = lower(${username}) and id <> ${userId} and deleted_at is null
    limit 1`;
  return rows.length > 0;
}

/** Of the ids given, those who asked not to have their last-seen time shown. */
export async function hideLastSeen(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();

  const rows = await sql<{ id: string }[]>`
    select id from users where id = any(${userIds}::uuid[]) and show_last_seen = false`;
  return new Set(rows.map((row) => row.id));
}

/**
 * What each of these people says about themselves, and whether they asked the
 * app to say it for them. Read in one query because presence answers about a
 * whole chat list at once.
 */
export async function statusesOf(
  userIds: string[],
): Promise<Map<string, { statusId: StatusId; statusAuto: boolean }>> {
  const result = new Map<string, { statusId: StatusId; statusAuto: boolean }>();
  if (userIds.length === 0) return result;

  const rows = await sql<{ id: string; statusId: StatusId; statusAuto: boolean }[]>`
    select id, status_id, status_auto from users where id = any(${userIds}::uuid[])`;

  for (const row of rows) {
    result.set(row.id, { statusId: row.statusId, statusAuto: row.statusAuto });
  }

  return result;
}

/** Everyone whose avatar is this attachment — how the media route knows it is public. */
export async function isAvatar(attachmentId: string): Promise<boolean> {
  const rows = await sql`select 1 from users where avatar_url = ${attachmentId} limit 1`;
  return rows.length > 0;
}
