import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * The privacy mode, exercised the way two people actually use it: one device
 * publishes a bundle, the other builds a session from it, and they talk.
 *
 * Electron is mocked down to the two things this module touches — where to put
 * the file, and whether the OS will encrypt it. Everything else is libsignal
 * doing real cryptography over a real file on disk, which is the part worth
 * testing: a store that serialises wrongly produces a session that works once
 * and then silently stops.
 */

const root = mkdtempSync(join(tmpdir(), 'bmf-e2e-'));

vi.mock('electron', () => ({
  app: { getPath: () => root },
  // Not available in a bare Node process, which is also the honest answer on a
  // Linux box with no keyring — the path the module has to keep working on.
  safeStorage: { isEncryptionAvailable: () => false },
}));

const ALICE = 'alice-device';
const BOB = 'bob-device';

// Device ids are uuids in the real thing; libsignal only needs them to differ.
const ALICE_DEVICE = '11111111-1111-4111-8111-111111111111';
const BOB_DEVICE = '22222222-2222-4222-8222-222222222222';

let e2e: typeof import('../electron/e2e.js');

beforeAll(async () => {
  e2e = await import('../electron/e2e.js');
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('publishing keys', () => {
  it('reports the first identity as fresh and keeps it afterwards', async () => {
    const first = await e2e.publishableKeys(ALICE);
    expect(first.fresh).toBe(true);
    expect(first.oneTimePreKeys).toHaveLength(100);
    expect(first.registrationId).toBeGreaterThan(0);

    const second = await e2e.publishableKeys(ALICE);
    expect(second.fresh).toBe(false);
    expect(second.identityKey).toBe(first.identityKey);
  });

  /** Reusing a prekey id would hand two people the same key. */
  it('never repeats a prekey id across batches', async () => {
    const first = await e2e.publishableKeys(BOB);
    const second = await e2e.publishableKeys(BOB);

    const ids = new Set([
      ...first.oneTimePreKeys.map((key) => key.id),
      ...second.oneTimePreKeys.map((key) => key.id),
    ]);
    expect(ids.size).toBe(200);
    expect(second.signedPreKeyId).not.toBe(first.signedPreKeyId);
  });

  it('gives two accounts on one machine different identities', async () => {
    const alice = await e2e.publishableKeys(ALICE);
    const bob = await e2e.publishableKeys(BOB);
    expect(alice.identityKey).not.toBe(bob.identityKey);
  });
});

describe('a conversation', () => {
  /** What the server would hand back after claiming one of Bob's prekeys. */
  async function bundleFromBob(): Promise<import('../electron/e2e.js').RemoteBundle> {
    const keys = await e2e.publishableKeys(BOB);
    const oneTime = keys.oneTimePreKeys[0]!;

    return {
      userId: 'bob',
      deviceId: BOB_DEVICE,
      registrationId: keys.registrationId,
      identityKey: keys.identityKey,
      signedPreKeyId: keys.signedPreKeyId,
      signedPreKey: keys.signedPreKey,
      signedPreKeySignature: keys.signedPreKeySignature,
      kyberPreKeyId: keys.kyberPreKeyId,
      kyberPreKey: keys.kyberPreKey,
      kyberPreKeySignature: keys.kyberPreKeySignature,
      preKeyId: oneTime.id,
      preKey: oneTime.key,
    };
  }

  it('carries a message from one device to the other and back', async () => {
    const bundle = await bundleFromBob();

    expect(await e2e.hasSession(ALICE, BOB_DEVICE)).toBe(false);
    await e2e.startSession(ALICE, ALICE_DEVICE, bundle);
    expect(await e2e.hasSession(ALICE, BOB_DEVICE)).toBe(true);

    const sealed = await e2e.encrypt({
      accountKey: ALICE,
      localDeviceId: ALICE_DEVICE,
      peerDeviceId: BOB_DEVICE,
      plaintext: 'привет, это приватный режим',
    });

    // 3 is libsignal's prekey message: the one that establishes the session.
    expect(sealed.type).toBe(3);
    expect(sealed.body).not.toContain('приватный');

    const read = await e2e.decrypt({
      accountKey: BOB,
      localDeviceId: BOB_DEVICE,
      peerDeviceId: ALICE_DEVICE,
      type: sealed.type,
      body: sealed.body,
    });
    expect(read).toBe('привет, это приватный режим');

    const reply = await e2e.encrypt({
      accountKey: BOB,
      localDeviceId: BOB_DEVICE,
      peerDeviceId: ALICE_DEVICE,
      plaintext: 'и ответ',
    });
    // The session exists now, so this is an ordinary ratchet message.
    expect(reply.type).toBe(2);

    expect(
      await e2e.decrypt({
        accountKey: ALICE,
        localDeviceId: ALICE_DEVICE,
        peerDeviceId: BOB_DEVICE,
        type: reply.type,
        body: reply.body,
      }),
    ).toBe('и ответ');
  });

  /**
   * The ratchet has to survive the state going to disk and back, which is what
   * every message after the first actually depends on.
   */
  it('keeps the ratchet across several messages', async () => {
    for (const text of ['первое', 'второе', 'третье']) {
      const sealed = await e2e.encrypt({
        accountKey: ALICE,
        localDeviceId: ALICE_DEVICE,
        peerDeviceId: BOB_DEVICE,
        plaintext: text,
      });

      expect(
        await e2e.decrypt({
          accountKey: BOB,
          localDeviceId: BOB_DEVICE,
          peerDeviceId: ALICE_DEVICE,
          type: sealed.type,
          body: sealed.body,
        }),
      ).toBe(text);
    }
  });

  it('refuses ciphertext meant for a session it does not have', async () => {
    const sealed = await e2e.encrypt({
      accountKey: ALICE,
      localDeviceId: ALICE_DEVICE,
      peerDeviceId: BOB_DEVICE,
      plaintext: 'не для них',
    });

    // A third device holds no session with Alice, and nothing about the message
    // lets it build one.
    await expect(
      e2e.decrypt({
        accountKey: 'carol-device',
        localDeviceId: '33333333-3333-4333-8333-333333333333',
        peerDeviceId: ALICE_DEVICE,
        type: sealed.type,
        body: sealed.body,
      }),
    ).rejects.toThrow();
  });
});

describe('starting over', () => {
  it('drops the identity so the next load generates a new one', async () => {
    const before = await e2e.publishableKeys('throwaway');
    await e2e.reset('throwaway');

    const after = await e2e.publishableKeys('throwaway');
    expect(after.fresh).toBe(true);
    expect(after.identityKey).not.toBe(before.identityKey);
  });
});
