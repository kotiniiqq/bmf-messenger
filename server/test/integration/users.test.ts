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

let app: App;

async function makeUser(suffix: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { ...uniqueUser(suffix), device: DEVICE, consents: CONSENTS },
  });
  const body = res.json();
  return {
    userId: body.user.id,
    username: body.user.username,
    headers: { authorization: `Bearer ${body.tokens.accessToken}` },
  };
}

beforeAll(async () => {
  app = await startTestApp();
});

beforeEach(async () => {
  await truncateAll();
  await clearRateLimits();
});

afterAll(async () => {
  await stopTestApp(app);
});

describe('GET /me', () => {
  it('returns the caller', async () => {
    const alice = await makeUser('mea');
    const res = await app.inject({ method: 'GET', url: '/api/v1/me', headers: alice.headers });
    expect(res.statusCode).toBe(200);
    expect(res.json().username).toBe(alice.username);
  });

  it('never exposes the password hash or email', async () => {
    const alice = await makeUser('mep');
    const body = (await app.inject({ method: 'GET', url: '/api/v1/me', headers: alice.headers }))
      .json();
    expect(JSON.stringify(body)).not.toContain('$argon2');
    expect(body).not.toHaveProperty('email');
  });

  it('requires a token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/me' });
    expect(res.statusCode).toBe(401);
  });
});

describe('PATCH /me', () => {
  it('updates the display name and status', async () => {
    const alice = await makeUser('pta');
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me',
      headers: alice.headers,
      payload: { displayName: 'Алиса', statusId: 'focus', statusText: 'на созвоне' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().displayName).toBe('Алиса');
    expect(res.json().statusId).toBe('focus');
    expect(res.json().statusText).toBe('на созвоне');
  });

  it('leaves untouched fields alone', async () => {
    const alice = await makeUser('ptb');
    await app.inject({
      method: 'PATCH',
      url: '/api/v1/me',
      headers: alice.headers,
      payload: { displayName: 'Первое' },
    });
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me',
      headers: alice.headers,
      payload: { statusId: 'dnd' },
    });

    expect(res.json().displayName).toBe('Первое');
    expect(res.json().statusId).toBe('dnd');
  });

  it('clears the status text when sent null', async () => {
    const alice = await makeUser('ptc');
    await app.inject({
      method: 'PATCH',
      url: '/api/v1/me',
      headers: alice.headers,
      payload: { statusText: 'временно' },
    });
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me',
      headers: alice.headers,
      payload: { statusText: null },
    });

    expect(res.json().statusText).toBeNull();
  });

  it('rejects an unknown status', async () => {
    const alice = await makeUser('ptd');
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me',
      headers: alice.headers,
      payload: { statusId: 'partying' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('changing the username', () => {
  it('renames the handle and answers with the new one', async () => {
    const alice = await makeUser('una');

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me',
      headers: alice.headers,
      payload: { username: 'newhandle' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().username).toBe('newhandle');
  });

  /** A 409 naming the field is something a form can point at; a 500 is not. */
  it('refuses a handle somebody else already has', async () => {
    const alice = await makeUser('unb');
    const bob = await makeUser('unc');

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me',
      headers: alice.headers,
      payload: { username: bob.username },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().details.field).toBe('username');
  });

  it('lets somebody re-save the handle they already hold', async () => {
    const alice = await makeUser('und');

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me',
      headers: alice.headers,
      payload: { username: alice.username },
    });

    expect(res.statusCode).toBe(200);
  });

  it('refuses capitals, which is what makes look-alike names possible', async () => {
    const alice = await makeUser('une');

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me',
      headers: alice.headers,
      payload: { username: 'AliceB' },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe('the avatar', () => {
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );

  function multipart(filename: string, mime: string, content: Buffer) {
    const boundary = '----bmfavatar';
    const head = Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
        `Content-Type: ${mime}\r\n\r\n`,
    );
    return {
      payload: Buffer.concat([head, content, Buffer.from(`\r\n--${boundary}--\r\n`)]),
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    };
  }

  const setAvatar = (
    actor: { headers: { authorization: string } },
    mime = 'image/png',
    content = PNG,
  ) => {
    const { payload, headers } = multipart('face.png', mime, content);
    return app.inject({
      method: 'PUT',
      url: '/api/v1/me/avatar',
      headers: { ...actor.headers, ...headers },
      payload,
    });
  };

  it('uploads and points at it in one request', async () => {
    const alice = await makeUser('ava');

    const res = await setAvatar(alice);

    expect(res.statusCode).toBe(200);
    expect(res.json().avatarUrl).toBeTruthy();
  });

  /**
   * An avatar is the one attachment meant to be seen by people who were not in
   * the chat it came from — otherwise everyone else sees initials forever.
   */
  it('is readable by another signed-in person', async () => {
    const alice = await makeUser('avb');
    const bob = await makeUser('avc');
    const attachmentId = (await setAvatar(alice)).json().avatarUrl;

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/media/${attachmentId}`,
      headers: bob.headers,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
  });

  it('refuses anything that is not an image', async () => {
    const alice = await makeUser('avd');

    const res = await setAvatar(alice, 'text/plain', Buffer.from('not a face'));

    expect(res.statusCode).toBe(400);
  });

  it('can be taken off again', async () => {
    const alice = await makeUser('ave');
    await setAvatar(alice);

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/me/avatar',
      headers: alice.headers,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().avatarUrl).toBeNull();
  });
});

describe('GET /users/search', () => {
  it('finds someone by a username prefix', async () => {
    const alice = await makeUser('finder');
    await makeUser('findme');

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/users/search?q=user_findme',
      headers: alice.headers,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().items).toHaveLength(1);
    expect(res.json().items[0].username).toBe('user_findme');
  });

  it('never returns the caller', async () => {
    const alice = await makeUser('selfa');
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/users/search?q=${alice.username}`,
      headers: alice.headers,
    });
    expect(res.json().items).toHaveLength(0);
  });

  it('does not match on email, so registration cannot be probed', async () => {
    const alice = await makeUser('proba');
    await makeUser('probb');

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/users/search?q=user_probb%40example.com',
      headers: alice.headers,
    });
    expect(res.json().items).toHaveLength(0);
  });

  it('refuses a query too short to be a deliberate search', async () => {
    const alice = await makeUser('shorta');
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/users/search?q=u',
      headers: alice.headers,
    });
    expect(res.statusCode).toBe(400);
  });

  it('treats LIKE wildcards as literal text', async () => {
    const alice = await makeUser('wilda');
    await makeUser('wildb');

    // A bare "%" must not enumerate the directory.
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/users/search?q=%25%25',
      headers: alice.headers,
    });
    expect(res.json().items).toHaveLength(0);
  });
});
