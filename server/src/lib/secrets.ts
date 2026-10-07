import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { config } from './config.js';

/**
 * Symmetric encryption for credentials we have to be able to replay — an IMAP
 * password is useless as a hash, because the server has to present it to the
 * mailbox on every sync.
 *
 * AES-256-GCM from Node's own crypto: authenticated, standard, and not
 * hand-rolled (hard rule 4). The key is derived once from MAIL_SECRET; losing
 * that variable means every stored mailbox password becomes unreadable, which
 * is the intended failure — better than a mailbox that keeps working after the
 * secret leaks and is rotated.
 */
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (!config.MAIL_SECRET) {
    throw new Error('MAIL_SECRET is not configured; mailboxes cannot be connected');
  }

  // Deterministic salt: the point is a stable key from a stable secret, not a
  // password hash. Rotating the secret is what changes the key.
  cachedKey ??= scryptSync(config.MAIL_SECRET, 'bmf-mail-secret', 32);
  return cachedKey;
}

/** Layout: iv | tag | ciphertext, so one buffer is the whole stored value. */
export function seal(plain: string): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
}

export function open(sealed: Buffer | null | undefined): string | null {
  if (!sealed || sealed.length <= IV_LENGTH + TAG_LENGTH) return null;

  try {
    const iv = sealed.subarray(0, IV_LENGTH);
    const tag = sealed.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const body = sealed.subarray(IV_LENGTH + TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
  } catch {
    // Wrong key or tampered value. Never throw the ciphertext at the caller —
    // a null here surfaces as "reconnect this mailbox", which is the truth.
    return null;
  }
}

export function mailSecretConfigured(): boolean {
  return Boolean(config.MAIL_SECRET);
}
