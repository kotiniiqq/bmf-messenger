import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../../src/app.js';
import { ensureBucket } from '../../src/lib/storage.js';
import { readImageSize } from '../../src/modules/media/service.js';
import {
  CONSENTS,
  DEVICE,
  clearRateLimits,
  startTestApp,
  stopTestApp,
  truncateAll,
  uniqueUser,
} from '../helpers/app.js';

let app: App;

interface Actor {
  userId: string;
  headers: { authorization: string };
}

async function makeUser(suffix: string): Promise<Actor> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { ...uniqueUser(suffix), device: DEVICE, consents: CONSENTS },
  });
  const body = res.json();
  return {
    userId: body.user.id,
    headers: { authorization: `Bearer ${body.tokens.accessToken}` },
  };
}

/** Smallest valid PNG: 1x1, so the header parser has something real to read. */
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function multipartBody(filename: string, mime: string, content: Buffer) {
  const boundary = '----bmftest' + randomUUID();
  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: ${mime}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    payload: Buffer.concat([head, content, tail]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

const uploadAs = (actor: Actor, filename = 'pic.png', mime = 'image/png', content = PNG_1x1) => {
  const { payload, headers } = multipartBody(filename, mime, content);
  return app.inject({
    method: 'POST',
    url: '/api/v1/media/upload',
    headers: { ...actor.headers, ...headers },
    payload,
  });
};

async function directChat(a: Actor, b: Actor): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/chats/direct',
    headers: a.headers,
    payload: { userId: b.userId },
  });
  return res.json().id;
}

beforeAll(async () => {
  await ensureBucket();
  app = await startTestApp();
});

beforeEach(async () => {
  await truncateAll();
  await clearRateLimits();
});

afterAll(async () => {
  await stopTestApp(app);
});

describe('image header parsing', () => {
  it('reads PNG dimensions', () => {
    expect(readImageSize(PNG_1x1, 'image/png')).toEqual({ width: 1, height: 1 });
  });

  it('returns null for a type it cannot parse', () => {
    expect(readImageSize(Buffer.from('hello'), 'text/plain')).toBeNull();
  });

  it('returns null instead of throwing on a truncated header', () => {
    expect(readImageSize(Buffer.from([0x89, 0x50]), 'image/png')).toBeNull();
  });
});

describe('POST /media/upload', () => {
  it('stores a file and reports its dimensions', async () => {
    const alice = await makeUser('mua');
    const res = await uploadAs(alice);

    expect(res.statusCode).toBe(201);
    expect(res.json().mime).toBe('image/png');
    expect(res.json().width).toBe(1);
    expect(res.json().size).toBe(PNG_1x1.length);
  });

  it('keeps the original file name', async () => {
    const alice = await makeUser('mna2');
    const res = await uploadAs(alice, 'отчёт за июль.png');
    expect(res.json().name).toBe('отчёт за июль.png');
  });

  it('takes the name off a path and refuses to be talked into a directory', async () => {
    const alice = await makeUser('mpa');
    const res = await uploadAs(alice, '../../etc/passwd.png');
    expect(res.json().name).toBe('passwd.png');
  });

  /**
   * The bucket key names the uploader and the storage layout. It is still built
   * that way — see `buildKey` — but the client has no business seeing it.
   */
  it('does not hand the storage key to the client', async () => {
    const alice = await makeUser('mka');
    const res = await uploadAs(alice);
    expect(res.json().bucketKey).toBeUndefined();
    expect(res.body).not.toContain(alice.userId);
  });

  it('refuses a type outside the allowlist', async () => {
    const alice = await makeUser('mea');
    const res = await uploadAs(alice, 'run.exe', 'application/x-msdownload', Buffer.from('MZ'));
    expect(res.statusCode).toBe(400);
  });

  it('requires a token', async () => {
    const { payload, headers } = multipartBody('pic.png', 'image/png', PNG_1x1);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/media/upload',
      headers,
      payload,
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('attaching to a message', () => {
  it('carries the attachment through to both parties', async () => {
    const alice = await makeUser('maa');
    const bob = await makeUser('mab');
    const chatId = await directChat(alice, bob);

    const file = (await uploadAs(alice)).json();

    const sent = await app.inject({
      method: 'POST',
      url: `/api/v1/chats/${chatId}/messages`,
      headers: alice.headers,
      payload: { clientMsgId: randomUUID(), body: 'look at this', attachmentIds: [file.id] },
    });
    expect(sent.statusCode).toBe(201);

    const list = await app.inject({
      method: 'GET',
      url: `/api/v1/chats/${chatId}/messages`,
      headers: bob.headers,
    });
    const attachments = list.json().items[0].meta.attachments;
    expect(attachments).toHaveLength(1);
    expect(attachments[0].id).toBe(file.id);
  });

  it('allows a message with only a file and no text', async () => {
    const alice = await makeUser('mfa');
    const bob = await makeUser('mfb');
    const chatId = await directChat(alice, bob);
    const file = (await uploadAs(alice)).json();

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/chats/${chatId}/messages`,
      headers: alice.headers,
      payload: { clientMsgId: randomUUID(), body: '', attachmentIds: [file.id] },
    });
    expect(res.statusCode).toBe(201);
  });

  it('rejects a message with neither text nor a file', async () => {
    const alice = await makeUser('mna');
    const bob = await makeUser('mnb');
    const chatId = await directChat(alice, bob);

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/chats/${chatId}/messages`,
      headers: alice.headers,
      payload: { clientMsgId: randomUUID(), body: '   ' },
    });
    expect(res.statusCode).toBe(400);
  });

  it("refuses to attach somebody else's upload", async () => {
    const alice = await makeUser('mxa');
    const bob = await makeUser('mxb');
    const chatId = await directChat(alice, bob);

    const theirs = (await uploadAs(bob)).json();

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/chats/${chatId}/messages`,
      headers: alice.headers,
      payload: { clientMsgId: randomUUID(), body: 'stealing', attachmentIds: [theirs.id] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('refuses to reuse an attachment already on a message', async () => {
    const alice = await makeUser('mra');
    const bob = await makeUser('mrb');
    const chatId = await directChat(alice, bob);
    const file = (await uploadAs(alice)).json();

    await app.inject({
      method: 'POST',
      url: `/api/v1/chats/${chatId}/messages`,
      headers: alice.headers,
      payload: { clientMsgId: randomUUID(), body: 'first', attachmentIds: [file.id] },
    });

    const second = await app.inject({
      method: 'POST',
      url: `/api/v1/chats/${chatId}/messages`,
      headers: alice.headers,
      payload: { clientMsgId: randomUUID(), body: 'again', attachmentIds: [file.id] },
    });
    expect(second.statusCode).toBe(400);
  });
});

describe('GET /media/:id', () => {
  /**
   * The bytes themselves, not a redirect to storage. On the beta MinIO has no
   * published port and no route through Caddy, so a redirect pointed every
   * client at a host it could not resolve and no attachment ever opened.
   */
  it('serves the file to a chat member', async () => {
    const alice = await makeUser('mda');
    const bob = await makeUser('mdb');
    const chatId = await directChat(alice, bob);
    const file = (await uploadAs(alice)).json();

    await app.inject({
      method: 'POST',
      url: `/api/v1/chats/${chatId}/messages`,
      headers: alice.headers,
      payload: { clientMsgId: randomUUID(), body: 'file', attachmentIds: [file.id] },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/media/${file.id}`,
      headers: bob.headers,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.rawPayload.equals(PNG_1x1)).toBe(true);
  });

  it('names the file in the disposition header', async () => {
    const alice = await makeUser('mfn');
    const bob = await makeUser('mfn2');
    const chatId = await directChat(alice, bob);
    const file = (await uploadAs(alice, 'схема.png')).json();

    await app.inject({
      method: 'POST',
      url: `/api/v1/chats/${chatId}/messages`,
      headers: alice.headers,
      payload: { clientMsgId: randomUUID(), body: 'file', attachmentIds: [file.id] },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/media/${file.id}`,
      headers: alice.headers,
    });

    expect(res.headers['content-disposition']).toBe(
      `inline; filename*=UTF-8''${encodeURIComponent('схема.png')}`,
    );
  });

  /** Deleting a direct chat gives up the files in it as well as the words. */
  it('refuses a file from history the caller cleared', async () => {
    const alice = await makeUser('mca');
    const bob = await makeUser('mcb');
    const chatId = await directChat(alice, bob);
    const file = (await uploadAs(bob)).json();

    await app.inject({
      method: 'POST',
      url: `/api/v1/chats/${chatId}/messages`,
      headers: bob.headers,
      payload: { clientMsgId: randomUUID(), body: 'file', attachmentIds: [file.id] },
    });

    await app.inject({
      method: 'DELETE',
      url: `/api/v1/chats/${chatId}`,
      headers: alice.headers,
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/media/${file.id}`,
      headers: alice.headers,
    });
    expect(res.statusCode).toBe(404);
  });

  it('lists the pictures of a chat, newest first, and nothing else', async () => {
    const alice = await makeUser('mga');
    const bob = await makeUser('mgb');
    const chatId = await directChat(alice, bob);

    const first = (await uploadAs(alice, 'one.png')).json();
    const doc = (await uploadAs(alice, 'notes.txt', 'text/plain', Buffer.from('hi'))).json();
    const second = (await uploadAs(alice, 'two.png')).json();

    for (const file of [first, doc, second]) {
      await app.inject({
        method: 'POST',
        url: `/api/v1/chats/${chatId}/messages`,
        headers: alice.headers,
        payload: { clientMsgId: randomUUID(), body: 'x', attachmentIds: [file.id] },
      });
    }

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/chats/${chatId}/media`,
      headers: bob.headers,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().items.map((a: { id: string }) => a.id)).toEqual([second.id, first.id]);
  });

  it('gives no gallery to somebody outside the chat', async () => {
    const alice = await makeUser('mgc');
    const bob = await makeUser('mgd');
    const outsider = await makeUser('mge');
    const chatId = await directChat(alice, bob);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/chats/${chatId}/media`,
      headers: outsider.headers,
    });

    expect(res.statusCode).toBe(404);
  });

  it('hides an attachment from outside the chat behind a 404', async () => {
    const alice = await makeUser('mha');
    const bob = await makeUser('mhb');
    const outsider = await makeUser('mhc');
    const chatId = await directChat(alice, bob);
    const file = (await uploadAs(alice)).json();

    await app.inject({
      method: 'POST',
      url: `/api/v1/chats/${chatId}/messages`,
      headers: alice.headers,
      payload: { clientMsgId: randomUUID(), body: 'private', attachmentIds: [file.id] },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/media/${file.id}`,
      headers: outsider.headers,
    });
    expect(res.statusCode).toBe(404);
  });

  it("hides another user's unattached upload", async () => {
    const alice = await makeUser('mua2');
    const bob = await makeUser('mub2');
    const file = (await uploadAs(alice)).json();

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/media/${file.id}`,
      headers: bob.headers,
    });
    expect(res.statusCode).toBe(404);
  });
});
