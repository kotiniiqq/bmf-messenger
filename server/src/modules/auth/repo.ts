import { sql } from '../../db/client.js';
import type { DeviceRow, UserRow } from './types.js';

/** The only file in the auth module allowed to speak SQL (CONTRIBUTING.md layout rules). */

export async function findUserByLogin(login: string): Promise<UserRow | null> {
  const rows = await sql<UserRow[]>`
    select * from users
    where (lower(username) = lower(${login}) or lower(email) = lower(${login}))
      and deleted_at is null
    limit 1`;
  return rows[0] ?? null;
}

export async function findUserById(id: string): Promise<UserRow | null> {
  const rows = await sql<UserRow[]>`
    select * from users where id = ${id} and deleted_at is null limit 1`;
  return rows[0] ?? null;
}

export async function usernameTaken(username: string): Promise<boolean> {
  const rows = await sql`select 1 from users where lower(username) = lower(${username}) limit 1`;
  return rows.length > 0;
}

export async function emailTaken(email: string): Promise<boolean> {
  const rows = await sql`select 1 from users where lower(email) = lower(${email}) limit 1`;
  return rows.length > 0;
}

export async function insertUser(input: {
  username: string;
  email: string;
  passwordHash: string;
  displayName: string;
}): Promise<UserRow> {
  const rows = await sql<UserRow[]>`
    insert into users (username, email, password_hash, display_name)
    values (
      ${input.username}, ${input.email.toLowerCase()},
      ${input.passwordHash}, ${input.displayName}
    )
    returning *`;
  const row = rows[0];
  if (!row) throw new Error('User insert returned no row');
  return row;
}

export async function updatePassword(userId: string, passwordHash: string): Promise<void> {
  await sql`update users set password_hash = ${passwordHash} where id = ${userId}`;
}

export async function revokeOtherDevices(userId: string, keepDeviceId: string): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`
    update devices set
      revoked_at = now(), refresh_token_hash = '', prev_refresh_token_hash = null,
      last_ip = null, last_city = null
    where user_id = ${userId} and id <> ${keepDeviceId} and revoked_at is null
    returning id`;
  return rows.map((row) => row.id);
}

export async function insertConsents(
  userId: string,
  consents: readonly { document: string; version: string }[],
): Promise<void> {
  for (const consent of consents) {
    await sql`
      insert into consents (user_id, document, version)
      values (${userId}, ${consent.document}, ${consent.version})
      on conflict do nothing`;
  }
}

export async function insertDevice(input: {
  userId: string;
  name: string;
  platform: string;
  refreshTokenHash: string;
  refreshExpiresAt: Date;
  ip: string | null;
  city: string | null;
}): Promise<DeviceRow> {
  const rows = await sql<DeviceRow[]>`
    insert into devices (
      user_id, name, platform, refresh_token_hash, refresh_expires_at,
      refresh_rotated_at, last_ip, last_city
    )
    values (
      ${input.userId}, ${input.name}, ${input.platform}, ${input.refreshTokenHash},
      ${input.refreshExpiresAt}, now(), ${input.ip}, ${input.city}
    )
    returning *`;
  const row = rows[0];
  if (!row) throw new Error('Device insert returned no row');
  return row;
}

export async function findDeviceById(id: string, userId: string): Promise<DeviceRow | null> {
  const rows = await sql<DeviceRow[]>`
    select * from devices
    where id = ${id} and user_id = ${userId} and revoked_at is null
    limit 1`;
  return rows[0] ?? null;
}

export async function findDeviceByRefreshHash(hash: string): Promise<DeviceRow | null> {
  const rows = await sql<DeviceRow[]>`
    select * from devices where refresh_token_hash = ${hash} and revoked_at is null limit 1`;
  return rows[0] ?? null;
}

export async function findDeviceByPrevRefreshHash(hash: string): Promise<DeviceRow | null> {
  const rows = await sql<DeviceRow[]>`
    select * from devices where prev_refresh_token_hash = ${hash} limit 1`;
  return rows[0] ?? null;
}

/** Moves the current hash into the previous slot so reuse can be detected. */
export async function rotateDeviceRefresh(input: {
  deviceId: string;
  newHash: string;
  refreshExpiresAt: Date;
  ip: string | null;
  city: string | null;
}): Promise<DeviceRow> {
  const rows = await sql<DeviceRow[]>`
    update devices set
      prev_refresh_token_hash = refresh_token_hash,
      refresh_token_hash = ${input.newHash},
      refresh_rotated_at = now(),
      refresh_expires_at = ${input.refreshExpiresAt},
      last_seen_at = now(),
      last_ip = ${input.ip},
      last_city = ${input.city}
    where id = ${input.deviceId}
    returning *`;
  const row = rows[0];
  if (!row) throw new Error('Device rotation matched no row');
  return row;
}

export async function touchDevice(
  id: string,
  ip: string | null,
  city: string | null,
): Promise<void> {
  await sql`
    update devices set last_seen_at = now(), last_ip = ${ip}, last_city = ${city}
    where id = ${id}`;
}

/** Clears the location too: a dead session has no reason to keep personal data. */
export async function revokeDevice(id: string): Promise<void> {
  await sql`
    update devices set
      revoked_at = now(),
      refresh_token_hash = '',
      prev_refresh_token_hash = null,
      last_ip = null,
      last_city = null
    where id = ${id}`;
}

export async function listActiveDevices(userId: string): Promise<DeviceRow[]> {
  return sql<DeviceRow[]>`
    select * from devices
    where user_id = ${userId} and revoked_at is null
    order by last_seen_at desc`;
}

/** Flat by design: audit entries are read by humans, not traversed by code. */
export type AuditMeta = Record<string, string | number | boolean | null>;

export async function writeAudit(input: {
  actorId: string | null;
  action: string;
  target?: string | null;
  meta?: AuditMeta;
}): Promise<void> {
  await sql`
    insert into audit_log (actor_id, action, target, meta)
    values (
      ${input.actorId}, ${input.action}, ${input.target ?? null},
      ${sql.json(input.meta ?? {})}
    )`;
}
