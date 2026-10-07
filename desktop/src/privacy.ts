import type { ChatPrivacy, Envelope, Message } from '@bmf/shared';
import { api, loadSession } from './api/client.js';

/**
 * The privacy mode, from the renderer's side.
 *
 * Everything cryptographic happens in the main process; this file is the part
 * that knows *when* to ask for it. It publishes this device's bundle once,
 * builds a session with whoever the other side agreed with, and turns text into
 * envelopes and back.
 *
 * Two things it deliberately does not do. It never holds a key — the shell
 * exposes no call that would hand it one. And it does not try to recover a
 * conversation it has no session for: the spec says an E2E history is not
 * restorable, so a message this device cannot open says so instead of pretending
 * to have lost it.
 */

/** Below this the device tops up rather than running out mid-conversation. */
const LOW_WATER = 20;

/** Plaintext of what this device sent, which no envelope of ours can give back. */
const SENT_KEY = 'bmf.e2e.sent';

export interface PrivacyContext {
  /** Identifies the key file: one identity per account per device. */
  accountKey: string;
  deviceId: string;
}

export function contextOf(userId: string): PrivacyContext | null {
  const session = loadSession();
  if (!session || !window.bmf) return null;
  return { accountKey: `${userId}.${session.deviceId}`, deviceId: session.deviceId };
}

export function available(): boolean {
  // A renderer outside Electron has no main process to hold the keys, and there
  // is no honest way to offer the mode there.
  return Boolean(window.bmf);
}

/**
 * Makes sure the server has a usable bundle for this device.
 *
 * A freshly generated identity means whatever the server holds is from a
 * previous install and cannot be talked to: it is dropped rather than added to,
 * because a bundle carrying the old identity builds a session nothing can read.
 */
export async function publishKeys(context: PrivacyContext): Promise<void> {
  const shell = window.bmf;
  if (!shell) return;

  const keys = await shell.e2eKeys(context.accountKey);

  if (keys.fresh) await api.forgetKeys().catch(() => undefined);

  await api.publishKeys({
    registrationId: keys.registrationId,
    identityKey: keys.identityKey,
    signedPreKeyId: keys.signedPreKeyId,
    signedPreKey: keys.signedPreKey,
    signedPreKeySignature: keys.signedPreKeySignature,
    kyberPreKeyId: keys.kyberPreKeyId,
    kyberPreKey: keys.kyberPreKey,
    kyberPreKeySignature: keys.kyberPreKeySignature,
    oneTimePreKeys: keys.oneTimePreKeys,
  });
}

/** Publishes on first use and tops up when the server says the shelf is low. */
export async function ensureKeys(context: PrivacyContext): Promise<void> {
  const status = await api.keyStatus().catch(() => null);
  if (!status || !status.published || status.oneTimePreKeys < LOW_WATER) {
    await publishKeys(context);
  }
}

/**
 * Builds the session with the device on the other side of an agreed chat.
 *
 * Idempotent: a session that already exists is left alone, because rebuilding
 * it would throw away a ratchet that both sides are still using.
 */
export async function ensureSession(
  context: PrivacyContext,
  privacy: ChatPrivacy,
  peerId: string,
): Promise<boolean> {
  const shell = window.bmf;
  if (!shell || privacy.state !== 'on') return false;

  const peerDevice = privacy.devices.find((device) => device !== context.deviceId);
  if (!peerDevice) return false;

  if (await shell.e2eHasSession(context.accountKey, peerDevice)) return true;

  try {
    const bundle = await api.claimDeviceKeys(peerId, peerDevice);
    await shell.e2eStartSession(context.accountKey, context.deviceId, bundle);
    return true;
  } catch {
    // The other device withdrew its keys, or the server has none for it. The
    // chat stays in privacy mode and says it cannot send rather than falling
    // back to plaintext, which would be the one unforgivable failure here.
    return false;
  }
}

export function peerDeviceOf(context: PrivacyContext, privacy: ChatPrivacy): string | null {
  return privacy.devices.find((device) => device !== context.deviceId) ?? null;
}

export async function seal(
  context: PrivacyContext,
  privacy: ChatPrivacy,
  plaintext: string,
): Promise<Envelope> {
  const shell = window.bmf;
  const peerDevice = peerDeviceOf(context, privacy);
  if (!shell || !peerDevice) throw new Error('No device to encrypt for');

  const sealed = await shell.e2eEncrypt({
    accountKey: context.accountKey,
    localDeviceId: context.deviceId,
    peerDeviceId: peerDevice,
    plaintext,
  });

  return {
    type: sealed.type,
    body: sealed.body,
    fromDeviceId: context.deviceId,
    toDeviceId: peerDevice,
  };
}

/**
 * What a message says, for this device.
 *
 * Returns null when it cannot be opened at all — a message addressed to another
 * device of the same person, or one from before this identity existed. The
 * interface prints that plainly rather than showing an empty bubble.
 */
export async function open(
  context: PrivacyContext,
  message: Message,
): Promise<string | null> {
  const shell = window.bmf;
  const envelope = message.envelope;
  if (!shell || !envelope) return null;

  // Our own message: the ciphertext was addressed to the other device, so the
  // only copy we can read is the one kept when it was sent.
  if (envelope.fromDeviceId === context.deviceId) return recallSent(message.id);
  if (envelope.toDeviceId !== context.deviceId) return null;

  try {
    return await shell.e2eDecrypt({
      accountKey: context.accountKey,
      localDeviceId: context.deviceId,
      peerDeviceId: envelope.fromDeviceId,
      type: envelope.type,
      body: envelope.body,
    });
  } catch {
    return null;
  }
}

/**
 * Keeps this device's own plaintext.
 *
 * Signal's ratchet is one-way: what was encrypted for the other device cannot be
 * opened again here. Every messenger with this property keeps a local copy of
 * what it sent, and this one is stored where the spec says the history lives —
 * on the device, not on the server, and gone when the app is reinstalled.
 */
export function rememberSent(messageId: string, plaintext: string): void {
  try {
    const store = readSent();
    store[messageId] = plaintext;
    localStorage.setItem(SENT_KEY, JSON.stringify(store));
  } catch {
    // Out of quota: the message still sends, it just cannot be re-read here.
  }
}

function recallSent(messageId: string): string | null {
  return readSent()[messageId] ?? null;
}

function readSent(): Record<string, string> {
  try {
    const raw = localStorage.getItem(SENT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** Signing out leaves nothing readable behind on this machine. */
export async function forget(context: PrivacyContext): Promise<void> {
  localStorage.removeItem(SENT_KEY);
  await window.bmf?.e2eReset(context.accountKey);
}
