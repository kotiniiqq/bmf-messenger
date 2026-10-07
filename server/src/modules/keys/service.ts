import type { DeviceKeyUpload, PreKeyBundleDto } from '@bmf/shared';
import { ERROR } from '@bmf/shared';
import { AppError } from '../../lib/errors.js';
import * as repo from './repo.js';
import type { DeviceKeyRow } from './types.js';

/**
 * Key material, kept for devices that are not online when somebody wants to
 * reach them.
 *
 * The server never learns anything from this. It cannot verify the signatures
 * either — verifying them would need the identity key to be trusted, and what
 * makes an identity key trusted is the other person checking it, not us saying
 * so. What the server does guarantee is the part it can: that a bundle is only
 * ever stored under the device that authenticated to upload it, and that a
 * one-time prekey is handed out at most once.
 */

/** Enough that a device stays reachable between two of its own sessions. */
export const PREKEY_TARGET = 100;

/** Below this the client tops up; low enough not to nag, high enough not to run dry. */
export const PREKEY_LOW_WATER = 20;

export async function publish(
  userId: string,
  deviceId: string,
  upload: DeviceKeyUpload,
): Promise<{ oneTimePreKeys: number }> {
  await repo.upsertDeviceKeys({
    deviceId,
    userId,
    registrationId: upload.registrationId,
    identityKey: upload.identityKey,
    signedPrekeyId: upload.signedPreKeyId,
    signedPrekey: upload.signedPreKey,
    signedPrekeySig: upload.signedPreKeySignature,
    kyberPrekeyId: upload.kyberPreKeyId,
    kyberPrekey: upload.kyberPreKey,
    kyberPrekeySig: upload.kyberPreKeySignature,
  });

  await repo.addOneTimePreKeys(deviceId, upload.oneTimePreKeys);
  return { oneTimePreKeys: await repo.countUnclaimed(deviceId) };
}

/** Adds prekeys to a device that already published an identity. */
export async function topUp(
  deviceId: string,
  keys: { id: number; key: string }[],
): Promise<{ oneTimePreKeys: number }> {
  const existing = await repo.findDeviceKeys(deviceId);
  if (!existing) {
    throw new AppError(ERROR.VALIDATION, 'This device has published no identity yet', 400);
  }

  await repo.addOneTimePreKeys(deviceId, keys);
  return { oneTimePreKeys: await repo.countUnclaimed(deviceId) };
}

export async function status(deviceId: string): Promise<{
  published: boolean;
  oneTimePreKeys: number;
  low: boolean;
}> {
  const existing = await repo.findDeviceKeys(deviceId);
  const remaining = existing ? await repo.countUnclaimed(deviceId) : 0;

  return {
    published: Boolean(existing),
    oneTimePreKeys: remaining,
    low: Boolean(existing) && remaining < PREKEY_LOW_WATER,
  };
}

/**
 * A bundle for every device of that user that has published one.
 *
 * Claiming happens here, so asking for somebody's keys costs them a prekey.
 * That is the design: a bundle handed out is a bundle somebody may be about to
 * open a session with, and the alternative — handing the same one to everybody
 * — is what silently breaks sessions.
 */
export async function bundlesFor(userId: string): Promise<PreKeyBundleDto[]> {
  const devices = await repo.devicesWithKeys(userId);
  if (!devices.length) {
    throw new AppError(ERROR.UNAVAILABLE, 'This user has no device ready for privacy mode', 409);
  }

  return Promise.all(devices.map(toBundle));
}

/** One named device, for a session that already knows who it is talking to. */
export async function bundleFor(userId: string, deviceId: string): Promise<PreKeyBundleDto> {
  const row = await repo.findDeviceKeys(deviceId);
  if (!row || row.userId !== userId) throw AppError.notFound('No keys for that device');
  return toBundle(row);
}

async function toBundle(row: DeviceKeyRow): Promise<PreKeyBundleDto> {
  const oneTime = await repo.claimOneTimePreKey(row.deviceId);

  return {
    userId: row.userId,
    deviceId: row.deviceId,
    registrationId: row.registrationId,
    identityKey: row.identityKey,
    signedPreKeyId: row.signedPrekeyId,
    signedPreKey: row.signedPrekey,
    signedPreKeySignature: row.signedPrekeySig,
    kyberPreKeyId: row.kyberPrekeyId,
    kyberPreKey: row.kyberPrekey,
    kyberPreKeySignature: row.kyberPrekeySig,
    // Null when the device has run out. A session still forms without one.
    preKeyId: oneTime?.keyId ?? null,
    preKey: oneTime?.key ?? null,
  };
}

/** A device that rotated its identity: everything under the old one is wrong. */
export async function forget(deviceId: string): Promise<void> {
  await repo.dropDeviceKeys(deviceId);
}
