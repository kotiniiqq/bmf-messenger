import { sql } from '../../db/client.js';
import type { DeviceKeyRow, OneTimePreKeyRow } from './types.js';

/** The only file in the keys module allowed to speak SQL (CONTRIBUTING.md layout rules). */

export async function upsertDeviceKeys(input: {
  deviceId: string;
  userId: string;
  registrationId: number;
  identityKey: string;
  signedPrekeyId: number;
  signedPrekey: string;
  signedPrekeySig: string;
  kyberPrekeyId: number;
  kyberPrekey: string;
  kyberPrekeySig: string;
}): Promise<void> {
  await sql`
    insert into device_keys (
      device_id, user_id, registration_id, identity_key,
      signed_prekey_id, signed_prekey, signed_prekey_sig,
      kyber_prekey_id, kyber_prekey, kyber_prekey_sig
    )
    values (
      ${input.deviceId}, ${input.userId}, ${input.registrationId}, ${input.identityKey},
      ${input.signedPrekeyId}, ${input.signedPrekey}, ${input.signedPrekeySig},
      ${input.kyberPrekeyId}, ${input.kyberPrekey}, ${input.kyberPrekeySig}
    )
    on conflict (device_id) do update set
      registration_id  = excluded.registration_id,
      identity_key     = excluded.identity_key,
      signed_prekey_id = excluded.signed_prekey_id,
      signed_prekey    = excluded.signed_prekey,
      signed_prekey_sig = excluded.signed_prekey_sig,
      kyber_prekey_id  = excluded.kyber_prekey_id,
      kyber_prekey     = excluded.kyber_prekey,
      kyber_prekey_sig = excluded.kyber_prekey_sig,
      updated_at       = now()`;
}

export async function findDeviceKeys(deviceId: string): Promise<DeviceKeyRow | null> {
  const rows = await sql<DeviceKeyRow[]>`
    select * from device_keys where device_id = ${deviceId} limit 1`;
  return rows[0] ?? null;
}

/** Every device of a user that has published keys, newest publication first. */
export async function devicesWithKeys(userId: string): Promise<DeviceKeyRow[]> {
  return sql<DeviceKeyRow[]>`
    select * from device_keys where user_id = ${userId} order by updated_at desc`;
}

export async function addOneTimePreKeys(
  deviceId: string,
  keys: { id: number; key: string }[],
): Promise<void> {
  for (const key of keys) {
    // An id that already exists is a repeated upload, not a new key: keeping the
    // stored one means a bundle already handed out stays valid.
    await sql`
      insert into one_time_prekeys (device_id, key_id, key)
      values (${deviceId}, ${key.id}, ${key.key})
      on conflict (device_id, key_id) do nothing`;
  }
}

/**
 * Takes one prekey out of circulation and returns it.
 *
 * Claimed in the same statement that selects it, so two people opening a session
 * with the same device at the same moment cannot both be handed the same key —
 * which would give them sessions that quietly break.
 *
 * Returns null when the device has run out. That is survivable: a bundle without
 * a one-time prekey still establishes a session.
 */
export async function claimOneTimePreKey(deviceId: string): Promise<OneTimePreKeyRow | null> {
  const rows = await sql<OneTimePreKeyRow[]>`
    update one_time_prekeys set claimed_at = now()
     where (device_id, key_id) = (
       select device_id, key_id from one_time_prekeys
        where device_id = ${deviceId} and claimed_at is null
        order by key_id
        for update skip locked
        limit 1
     )
    returning *`;
  return rows[0] ?? null;
}

/** How many are left, so a client knows when to top up. */
export async function countUnclaimed(deviceId: string): Promise<number> {
  const rows = await sql<{ count: string }[]>`
    select count(*) as count from one_time_prekeys
     where device_id = ${deviceId} and claimed_at is null`;
  return Number(rows[0]?.count ?? 0);
}

/**
 * Everything this device ever published.
 *
 * Rotating the identity means the old keys are not merely stale but wrong: a
 * bundle carrying the previous identity would build a session nothing can
 * decrypt.
 */
export async function dropDeviceKeys(deviceId: string): Promise<void> {
  await sql`delete from one_time_prekeys where device_id = ${deviceId}`;
  await sql`delete from device_keys where device_id = ${deviceId}`;
}
