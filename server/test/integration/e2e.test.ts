import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../../src/app.js';
import {
  CONSENTS,
  DEVICE,
  clearRateLimits,
  startTestApp,
  stopTestApp,
  truncateAll,
  uniqueUser,
} from '../helpers/app.js';

/**
 * The privacy mode, from the server's side.
 *
 * The server holds keys it cannot read and ciphertext it cannot open, so what
 * is tested here is everything else: that an agreement takes two people, that a
 * one-time prekey is handed out exactly once, that a chat in the mode refuses
 * plaintext, and that a chat not in it refuses ciphertext.
 *
 * The cryptography itself is tested in desktop/test/e2e.test.ts, against real
 * libsignal. Nothing about it belongs here — the server is deliberately not a
 * party to it.
 */
let app: App;

async function register(suffix: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { ...uniqueUser(suffix), device: DEVICE, consents: CONSENTS },
  });

  const body = res.json();
  return { userId: body.user.id as string, token: body.tokens.accessToken as string };
}

async function directChat(token: string, otherUserId: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/chats/direct',
    headers: { authorization: `Bearer ${token}` },
    payload: { userId: otherUserId },
  });
  return res.json().id as string;
}

/** Bytes shaped like keys. The server stores them without looking inside. */
const keyOf = (seed: string) => Buffer.from(seed.padEnd(33, '.')).toString('base64');

/**
 * `firstId` matters: a real client never reuses a prekey id, and the server
 * treats a repeated id as the same key rather than a new one — which is what
 * keeps a bundle it already handed out valid.
 */
function upload(count = 3, firstId = 1) {
  return {
    registrationId: 4242,
    identityKey: keyOf('identity'),
    signedPreKeyId: 1,
    signedPreKey: keyOf('signed'),
    signedPreKeySignature: keyOf('signed-sig'),
    kyberPreKeyId: 1,
    kyberPreKey: keyOf('kyber'),
    kyberPreKeySignature: keyOf('kyber-sig'),
    oneTimePreKeys: Array.from({ length: count }, (_, index) => ({
      id: firstId + index,
      key: keyOf(`one-time-${firstId + index}`),
    })),
  };
}

const publish = (token: string, body = upload()) =>
  app.inject({
    method: 'PUT',
    url: '/api/v1/keys',
    headers: { authorization: `Bearer ${token}` },
    payload: body,
  });

const claim = (token: string, userId: string) =>
  app.inject({
    method: 'POST',
    url: `/api/v1/keys/claim/${userId}`,
    headers: { authorization: `Bearer ${token}` },
  });

const privacy = (token: string, chatId: string, action: string) =>
  app.inject({
    method: 'POST',
    url: `/api/v1/chats/${chatId}/privacy`,
    headers: { authorization: `Bearer ${token}` },
    payload: { action },
  });

beforeAll(async () => {
  app = await startTestApp();
});

afterAll(async () => {
  await stopTestApp(app);
});

beforeEach(async () => {
  await truncateAll();
  await clearRateLimits();
});

describe('publishing keys', () => {
  it('stores a bundle and reports how many prekeys are left', async () => {
    const alice = await register('k1');
    const res = await publish(alice.token);

    expect(res.statusCode).toBe(200);
    expect(res.json().oneTimePreKeys).toBe(3);
  });

  it('replaces the identity on a second publish and adds to the prekeys', async () => {
    const alice = await register('k2');
    await publish(alice.token);
    const res = await publish(alice.token, { ...upload(2, 4), registrationId: 777 });

    // Three from the first upload plus two new ones: prekeys accumulate, the
    // identity is replaced.
    expect(res.json().oneTimePreKeys).toBe(5);
  });

  /** A repeated id is the same key, not a new one — the stored one wins. */
  it('ignores a prekey id it has already stored', async () => {
    const alice = await register('k2b');
    await publish(alice.token, upload(3));
    const res = await publish(alice.token, upload(3));

    expect(res.json().oneTimePreKeys).toBe(3);
  });

  it('reports status before anything is published', async () => {
    const alice = await register('k3');
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/keys/status',
      headers: { authorization: `Bearer ${alice.token}` },
    });

    expect(res.json()).toMatchObject({ published: false, oneTimePreKeys: 0 });
  });

  it('refuses a body that is not base64', async () => {
    const alice = await register('k4');
    const res = await publish(alice.token, { ...upload(), identityKey: 'not base64!' });
    expect(res.statusCode).toBe(400);
  });

  it('refuses an unauthenticated publish', async () => {
    const res = await app.inject({ method: 'PUT', url: '/api/v1/keys', payload: upload() });
    expect(res.statusCode).toBe(401);
  });
});

describe('claiming a bundle', () => {
  /** A prekey handed to two people would give them sessions that break. */
  it('hands out each one-time prekey at most once', async () => {
    const alice = await register('c1');
    const bob = await register('c2');
    await publish(bob.token, upload(2));

    const first = await claim(alice.token, bob.userId);
    const second = await claim(alice.token, bob.userId);
    const third = await claim(alice.token, bob.userId);

    expect(first.json().items[0].preKeyId).toBe(1);
    expect(second.json().items[0].preKeyId).toBe(2);
    // Out of one-time keys: still usable, just without one.
    expect(third.json().items[0].preKeyId).toBeNull();
    expect(third.json().items[0].signedPreKey).toBe(keyOf('signed'));
  });

  it('refuses a user with no device ready', async () => {
    const alice = await register('c3');
    const bob = await register('c4');
    expect((await claim(alice.token, bob.userId)).statusCode).toBe(409);
  });
});

describe('agreeing on the privacy mode', () => {
  it('takes an offer from one side and an acceptance from the other', async () => {
    const alice = await register('p1');
    const bob = await register('p2');
    const chatId = await directChat(alice.token, bob.userId);

    const offered = await privacy(alice.token, chatId, 'propose');
    expect(offered.statusCode).toBe(200);
    expect(offered.json().state).toBe('proposed');
    expect(offered.json().devices).toHaveLength(1);

    const accepted = await privacy(bob.token, chatId, 'accept');
    expect(accepted.json().state).toBe('on');
    // Both devices, so each side knows which one to build a session with.
    expect(accepted.json().devices).toHaveLength(2);
  });

  /** Otherwise the "agreement" would be one person flipping a switch. */
  it('refuses to let the proposer accept their own offer', async () => {
    const alice = await register('p3');
    const bob = await register('p4');
    const chatId = await directChat(alice.token, bob.userId);

    await privacy(alice.token, chatId, 'propose');
    expect((await privacy(alice.token, chatId, 'accept')).statusCode).toBe(403);
  });

  it('refuses an acceptance with no offer open', async () => {
    const alice = await register('p5');
    const bob = await register('p6');
    const chatId = await directChat(alice.token, bob.userId);

    expect((await privacy(bob.token, chatId, 'accept')).statusCode).toBe(409);
  });

  it('lets either side turn it off without the other agreeing', async () => {
    const alice = await register('p7');
    const bob = await register('p8');
    const chatId = await directChat(alice.token, bob.userId);

    await privacy(alice.token, chatId, 'propose');
    await privacy(bob.token, chatId, 'accept');

    const off = await privacy(bob.token, chatId, 'cancel');
    expect(off.json().state).toBe('off');
    expect(off.json().devices).toEqual([]);
  });

  /** 404 rather than 403 throughout this module: a non-member is not told the chat exists. */
  it('refuses somebody who is not in the chat', async () => {
    const alice = await register('p9');
    const bob = await register('p10');
    const stranger = await register('p11');
    const chatId = await directChat(alice.token, bob.userId);

    expect((await privacy(stranger.token, chatId, 'propose')).statusCode).toBe(404);
  });

  /**
   * A group needs sender keys and a way to re-key when the membership changes.
   * Offering half of that would be worse than saying it is not available.
   */
  it('is not offered in a group', async () => {
    const alice = await register('p12');
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/chats',
      headers: { authorization: `Bearer ${alice.token}` },
      payload: { type: 'group', title: 'Команда' },
    });

    const res = await privacy(alice.token, created.json().id, 'propose');
    expect(res.statusCode).toBe(400);
  });
});

describe('messages in a chat under the privacy mode', () => {
  async function agreedChat(suffix: string) {
    const alice = await register(`m${suffix}a`);
    const bob = await register(`m${suffix}b`);
    const chatId = await directChat(alice.token, bob.userId);

    await privacy(alice.token, chatId, 'propose');
    const accepted = await privacy(bob.token, chatId, 'accept');

    return { alice, bob, chatId, devices: accepted.json().devices as string[] };
  }

  const send = (token: string, chatId: string, payload: Record<string, unknown>) =>
    app.inject({
      method: 'POST',
      url: `/api/v1/chats/${chatId}/messages`,
      headers: { authorization: `Bearer ${token}` },
      payload: { clientMsgId: crypto.randomUUID(), ...payload },
    });

  it('carries an envelope and stores no body', async () => {
    const { alice, chatId, devices } = await agreedChat('1');
    const [first, second] = devices;

    const res = await send(alice.token, chatId, {
      body: '',
      envelope: { type: 3, body: 'Y2lwaGVy', fromDeviceId: first, toDeviceId: second },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().body).toBe('');
    expect(res.json().envelope).toMatchObject({ type: 3, body: 'Y2lwaGVy' });
  });

  /** The mode has to be a property, not a label. */
  it('refuses plaintext', async () => {
    const { alice, chatId } = await agreedChat('2');
    const res = await send(alice.token, chatId, { body: 'открытым текстом' });

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain('privacy mode');
  });

  it('refuses an envelope from a device that is not in the session', async () => {
    const { alice, chatId, devices } = await agreedChat('3');
    const res = await send(alice.token, chatId, {
      body: '',
      envelope: {
        type: 3,
        body: 'Y2lwaGVy',
        fromDeviceId: '00000000-0000-4000-8000-000000000000',
        toDeviceId: devices[1],
      },
    });

    expect(res.statusCode).toBe(403);
  });

  it('refuses an envelope in a chat that is not in the mode', async () => {
    const alice = await register('m4a');
    const bob = await register('m4b');
    const chatId = await directChat(alice.token, bob.userId);

    const res = await send(alice.token, chatId, {
      body: '',
      envelope: {
        type: 3,
        body: 'Y2lwaGVy',
        fromDeviceId: '00000000-0000-4000-8000-000000000000',
        toDeviceId: '00000000-0000-4000-8000-000000000001',
      },
    });

    expect(res.statusCode).toBe(400);
  });

  /** Nothing to index, and the search must not pretend otherwise. */
  it('keeps encrypted chats out of search', async () => {
    const { alice, chatId, devices } = await agreedChat('5');

    await send(alice.token, chatId, {
      body: '',
      envelope: { type: 3, body: 'Y2lwaGVy', fromDeviceId: devices[0], toDeviceId: devices[1] },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/search?q=cipher',
      headers: { authorization: `Bearer ${alice.token}` },
    });

    expect(res.json().items).toEqual([]);
  });
});
