/**
 * The privacy mode: a chat whose contents the server carries but cannot read.
 *
 * Every key here is a base64 string of what libsignal serialised. The server
 * stores and hands them back without interpreting them, because it has no way
 * to interpret them — its whole role is to be the place two devices can leave
 * a bundle for each other.
 *
 * Chosen per chat and never in the general settings: the spec is explicit that
 * this decision is made in the context of a conversation, by both sides.
 */

/** Off, offered and waiting for the other side, or on. */
export type E2EState = 'off' | 'proposed' | 'on';

/** What a device publishes so anyone can open a session with it. */
export interface DeviceKeyUpload {
  registrationId: number;
  identityKey: string;
  signedPreKeyId: number;
  signedPreKey: string;
  signedPreKeySignature: string;
  /** Post-quantum half of the handshake; libsignal requires it in a bundle. */
  kyberPreKeyId: number;
  kyberPreKey: string;
  kyberPreKeySignature: string;
  oneTimePreKeys: OneTimePreKey[];
}

export interface OneTimePreKey {
  id: number;
  key: string;
}

/**
 * One claimed bundle: everything needed to build a session with that device.
 *
 * The one-time prekey is optional because it is exactly that — one-time. A
 * device that has run out still gets a usable bundle, just a slightly weaker
 * one, which is better than being unreachable.
 */
export interface PreKeyBundleDto {
  userId: string;
  deviceId: string;
  registrationId: number;
  identityKey: string;
  signedPreKeyId: number;
  signedPreKey: string;
  signedPreKeySignature: string;
  kyberPreKeyId: number;
  kyberPreKey: string;
  kyberPreKeySignature: string;
  preKeyId: number | null;
  preKey: string | null;
}

/**
 * A message body only the addressed device can open.
 *
 * `type` is libsignal's own ciphertext type — 3 opens a session, 2 continues
 * one — and the receiving side has to know which before it can decrypt.
 */
export interface Envelope {
  type: number;
  body: string;
  fromDeviceId: string;
  toDeviceId: string;
}

/** Where a chat stands, and between which two devices if it is on. */
export interface ChatPrivacy {
  chatId: string;
  state: E2EState;
  /** Who offered it, while the offer is still open. */
  proposedBy: string | null;
  /**
   * The two devices that agreed. Messages are encrypted between exactly these:
   * a third device of either person cannot read the chat, which is what "history
   * does not sync between devices" means in practice.
   */
  devices: string[];
}
