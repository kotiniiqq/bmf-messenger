import { app, safeStorage } from 'electron';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { randomInt } from 'node:crypto';
import { dirname, join } from 'node:path';
import type * as Signal from '@signalapp/libsignal-client';
import { blankState, storesOver, type StoredState, type Stores } from './e2e-store.js';

/**
 * The privacy mode's cryptography, in the main process.
 *
 * It lives here for two reasons that both matter. libsignal is a native module,
 * and the renderer never gets `nodeIntegration` (CONTRIBUTING.md layout rules). And
 * the private keys should not be in the same address space as the HTML: a
 * renderer is where a bug turns into somebody else's messages.
 *
 * The renderer never sees a key. It asks for a public bundle to publish, asks
 * for text to be turned into an envelope, and asks for an envelope to be turned
 * back into text. Everything else stays on this side of the preload.
 *
 * Hard rule 4 is the whole design here: nothing in this file implements
 * cryptography, it only carries libsignal's own records to and from disk.
 */

/** How many one-time prekeys a fresh identity publishes. */
const PREKEY_BATCH = 100;

/**
 * libsignal is an ES module, and the main process is bundled to CommonJS
 * because electron-updater needs it to be. Electron 32 carries Node 20, which
 * cannot `require` an ES module at all — so the package is loaded through a
 * real dynamic import, once, on first use.
 *
 * The import lives inside `new Function` for one reason: esbuild rewrites a
 * literal `import()` into a `require()` when the output format is CommonJS,
 * which is exactly the call that fails. Hiding it from the bundler keeps it an
 * import in the built file.
 *
 * This is also why nothing here can be verified with the system's own Node:
 * Node 22 and later allow requiring an ES module, so the broken build passes
 * outside Electron and fails inside it.
 */
const importSignal = new Function(
  'specifier',
  'return import(specifier)',
) as (specifier: string) => Promise<typeof Signal>;

let signal: typeof Signal | null = null;

async function library(): Promise<typeof Signal> {
  if (signal) return signal;

  try {
    signal = await importSignal('@signalapp/libsignal-client');
  } catch {
    // A test runner evaluates this inside a VM with no dynamic-import callback,
    // so the hidden import cannot work there. The plain one can: that bundle is
    // already ESM. In the packaged app this line is never reached — the branch
    // above succeeds, which the Electron probe in the ADR confirms.
    signal = (await import('@signalapp/libsignal-client')) as typeof Signal;
  }

  return signal;
}

let state: StoredState | null = null;
let stores: Stores | null = null;
/** Whose keys are loaded — a different account gets a different file. */
let loadedFor: string | null = null;

function fileFor(accountKey: string): string {
  // One file per (user, device): two accounts on one machine must not share an
  // identity, and the same account on two devices must not either.
  return join(app.getPath('userData'), 'e2e', `${accountKey}.bin`);
}

/**
 * Written through the OS keychain where there is one.
 *
 * `safeStorage` is DPAPI on Windows and the login keyring on Linux. Where it is
 * unavailable the material is stored as plain JSON and the caller is told so —
 * refusing to work at all would leave the mode unavailable on machines where it
 * is merely weaker, and pretending it was encrypted would be worse than either.
 */
export function storageIsEncrypted(): boolean {
  return safeStorage.isEncryptionAvailable();
}

async function persist(accountKey: string): Promise<void> {
  if (!state) return;

  const json = JSON.stringify(state);
  const path = fileFor(accountKey);
  await mkdir(dirname(path), { recursive: true });

  const body = storageIsEncrypted()
    ? safeStorage.encryptString(json)
    : Buffer.from(json, 'utf8');

  await writeFile(path, body);
}

async function read(accountKey: string): Promise<StoredState | null> {
  try {
    const body = await readFile(fileFor(accountKey));
    const json = storageIsEncrypted()
      ? safeStorage.decryptString(body)
      : body.toString('utf8');

    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object') return null;

    const candidate = parsed as Partial<StoredState>;
    // A file that does not carry an identity is not a state we can use. Treating
    // it as one would produce an identity of "undefined" and fail later, further
    // from the cause.
    if (typeof candidate.identityKey !== 'string' || typeof candidate.registrationId !== 'number') {
      return null;
    }

    return parsed as StoredState;
  } catch {
    // No file yet, a file from a rotated key, or a keychain that will not open
    // it. All three mean the same thing: start over.
    return null;
  }
}

/**
 * Loads this account's keys, generating an identity the first time.
 *
 * Returns whether the identity is new, because a new one means everything the
 * server holds for this device is stale and has to be replaced rather than
 * added to.
 */
async function load(accountKey: string): Promise<{ fresh: boolean }> {
  if (loadedFor === accountKey && state) return { fresh: false };

  const lib = await library();
  const existing = await read(accountKey);
  if (existing) {
    state = existing;
    stores = storesOver(lib, state);
    loadedFor = accountKey;
    return { fresh: false };
  }

  const identity = lib.IdentityKeyPair.generate();
  // Signal's registration ids are 14 bits. `randomInt` rather than Math.random:
  // this is an identifier two devices must not collide on.
  state = blankState(
    Buffer.from(identity.privateKey.serialize()).toString('base64'),
    randomInt(1, 16_380),
  );
  stores = storesOver(lib, state);
  loadedFor = accountKey;
  await persist(accountKey);

  return { fresh: true };
}

function required(): { state: StoredState; stores: Stores } {
  if (!state || !stores) throw new Error('E2E keys are not loaded');
  return { state, stores };
}

const b64 = (input: Uint8Array): string => Buffer.from(input).toString('base64');

/**
 * `Uint8Array.from` rather than the Buffer itself: a Buffer may be backed by a
 * SharedArrayBuffer, and libsignal's signatures ask for a plain one.
 */
const bytes = (value: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(Buffer.from(value, 'base64'));

const utf8 = (value: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(Buffer.from(value, 'utf8'));

export interface PublishableKeys {
  registrationId: number;
  identityKey: string;
  signedPreKeyId: number;
  signedPreKey: string;
  signedPreKeySignature: string;
  kyberPreKeyId: number;
  kyberPreKey: string;
  kyberPreKeySignature: string;
  oneTimePreKeys: { id: number; key: string }[];
  /** True when the identity was just generated: the server's copy is stale. */
  fresh: boolean;
}

/**
 * Everything this device publishes so others can reach it.
 *
 * Generating a batch is cheap and idempotent from the server's point of view —
 * ids never repeat, so a second call adds keys rather than replacing them.
 */
export async function publishableKeys(accountKey: string): Promise<PublishableKeys> {
  const lib = await library();
  const { fresh } = await load(accountKey);
  const { state: current, stores: current_stores } = required();

  // Only the private half is stored; the public one is derived from it rather
  // than kept beside it, so the two can never drift apart.
  const identityPrivate = lib.PrivateKey.deserialize(bytes(current.identityKey));
  const identityPublic = identityPrivate.getPublicKey();

  const signedId = current.nextSignedPreKeyId++;
  const signedPrivate = lib.PrivateKey.generate();
  const signedSignature = identityPrivate.sign(signedPrivate.getPublicKey().serialize());
  await current_stores.signedPreKeys.saveSignedPreKey(
    signedId,
    lib.SignedPreKeyRecord.new(
      signedId,
      Date.now(),
      signedPrivate.getPublicKey(),
      signedPrivate,
      signedSignature,
    ),
  );

  const kyberId = current.nextKyberPreKeyId++;
  const kyberPair = lib.KEMKeyPair.generate();
  const kyberSignature = identityPrivate.sign(kyberPair.getPublicKey().serialize());
  await current_stores.kyberPreKeys.saveKyberPreKey(
    kyberId,
    lib.KyberPreKeyRecord.new(kyberId, Date.now(), kyberPair, kyberSignature),
  );

  const oneTimePreKeys: { id: number; key: string }[] = [];
  for (let index = 0; index < PREKEY_BATCH; index += 1) {
    const id = current.nextPreKeyId++;
    const preKeyPrivate = lib.PrivateKey.generate();
    await current_stores.preKeys.savePreKey(
      id,
      lib.PreKeyRecord.new(id, preKeyPrivate.getPublicKey(), preKeyPrivate),
    );
    oneTimePreKeys.push({ id, key: b64(preKeyPrivate.getPublicKey().serialize()) });
  }

  await persist(accountKey);

  return {
    registrationId: current.registrationId,
    identityKey: b64(identityPublic.serialize()),
    signedPreKeyId: signedId,
    signedPreKey: b64(signedPrivate.getPublicKey().serialize()),
    signedPreKeySignature: b64(signedSignature),
    kyberPreKeyId: kyberId,
    kyberPreKey: b64(kyberPair.getPublicKey().serialize()),
    kyberPreKeySignature: b64(kyberSignature),
    oneTimePreKeys,
    fresh,
  };
}

export interface RemoteBundle {
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
 * The address a device is known by inside libsignal.
 *
 * The device id is the name and the numeric slot stays 1, because our device ids
 * are uuids rather than the small integers Signal's own service hands out. Two
 * devices are different addresses because their names differ.
 */
function addressOf(lib: typeof Signal, deviceId: string): Signal.ProtocolAddress {
  return lib.ProtocolAddress.new(deviceId, 1);
}

/** Builds the session described by a bundle somebody else published. */
export async function startSession(
  accountKey: string,
  localDeviceId: string,
  bundle: RemoteBundle,
): Promise<void> {
  await load(accountKey);
  const lib = await library();
  const { stores: current } = required();

  const preKeyBundle = lib.PreKeyBundle.new(
    bundle.registrationId,
    1,
    bundle.preKeyId,
    bundle.preKey ? lib.PublicKey.deserialize(bytes(bundle.preKey)) : null,
    bundle.signedPreKeyId,
    lib.PublicKey.deserialize(bytes(bundle.signedPreKey)),
    bytes(bundle.signedPreKeySignature),
    lib.PublicKey.deserialize(bytes(bundle.identityKey)),
    bundle.kyberPreKeyId,
    lib.KEMPublicKey.deserialize(bytes(bundle.kyberPreKey)),
    bytes(bundle.kyberPreKeySignature),
  );

  await lib.processPreKeyBundle(
    preKeyBundle,
    addressOf(lib, bundle.deviceId),
    addressOf(lib, localDeviceId),
    current.sessions,
    current.identities,
  );

  await persist(accountKey);
}

export async function hasSession(accountKey: string, peerDeviceId: string): Promise<boolean> {
  await load(accountKey);
  const lib = await library();
  const { stores: current } = required();
  return (await current.sessions.getSession(addressOf(lib, peerDeviceId))) !== null;
}

export interface SealedEnvelope {
  type: number;
  body: string;
}

export async function encrypt(input: {
  accountKey: string;
  localDeviceId: string;
  peerDeviceId: string;
  plaintext: string;
}): Promise<SealedEnvelope> {
  const lib = await library();
  await load(input.accountKey);
  const { stores: current } = required();

  const sealed = await lib.signalEncrypt(
    utf8(input.plaintext),
    addressOf(lib, input.peerDeviceId),
    addressOf(lib, input.localDeviceId),
    current.sessions,
    current.identities,
  );

  // The ratchet advanced; losing that write would make the next message
  // undecryptable on the other side.
  await persist(input.accountKey);

  return { type: sealed.type(), body: b64(sealed.serialize()) };
}

export async function decrypt(input: {
  accountKey: string;
  localDeviceId: string;
  peerDeviceId: string;
  type: number;
  body: string;
}): Promise<string> {
  const lib = await library();
  await load(input.accountKey);
  const { stores: current } = required();

  const address = addressOf(lib, input.peerDeviceId);
  const local = addressOf(lib, input.localDeviceId);
  const ciphertext = bytes(input.body);

  const plaintext =
    input.type === lib.CiphertextMessageType.PreKey
      ? // The first message carries the material that establishes the session,
        // which is why it needs every store rather than just the session one.
        await lib.signalDecryptPreKey(
          lib.PreKeySignalMessage.deserialize(ciphertext),
          address,
          local,
          current.sessions,
          current.identities,
          current.preKeys,
          current.signedPreKeys,
          current.kyberPreKeys,
        )
      : await lib.signalDecrypt(
          lib.SignalMessage.deserialize(ciphertext),
          address,
          local,
          current.sessions,
          current.identities,
        );

  await persist(input.accountKey);
  return Buffer.from(plaintext).toString('utf8');
}

/**
 * Throws this device's keys away.
 *
 * Used when the server says it has never heard of them — a reinstall, or a
 * device whose row was revoked. Everything encrypted to the old identity stays
 * unreadable, which is the point rather than a shortcoming: the spec says an
 * E2E history is not recoverable.
 */
export async function reset(accountKey: string): Promise<void> {
  state = null;
  stores = null;
  loadedFor = null;
  // The file has to go, not just the copy in memory: leaving it would have the
  // next load pick the discarded identity straight back up.
  await rm(fileFor(accountKey), { force: true });
}
