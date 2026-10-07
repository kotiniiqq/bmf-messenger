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

const registerBody = (suffix: string) => ({
  ...uniqueUser(suffix),
  device: DEVICE,
  consents: CONSENTS,
});

const register = (suffix: string) =>
  app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: registerBody(suffix) });

const loginAs = (suffix: string, overrides: Record<string, unknown> = {}) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: {
      login: `user_${suffix}`,
      password: uniqueUser(suffix).password,
      device: DEVICE,
      ...overrides,
    },
  });

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

describe('POST /auth/register', () => {
  it('creates an account and returns tokens', async () => {
    const res = await register('alpha');
    expect(res.statusCode).toBe(201);

    const body = res.json();
    expect(body.user.username).toBe('user_alpha');
    expect(body.tokens.accessToken).toBeTruthy();
    expect(body.tokens.refreshToken).toBeTruthy();
    expect(body.device.current).toBe(true);
  });

  it('never leaks the password hash', async () => {
    const body = (await register('nohash')).json();
    expect(JSON.stringify(body)).not.toContain('$argon2');
  });

  it('rejects a duplicate username', async () => {
    await register('dup');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { ...registerBody('dup'), email: 'other@example.com' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('conflict');
  });

  it('rejects a duplicate email regardless of case', async () => {
    await register('email');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { ...registerBody('email2'), email: 'USER_EMAIL@EXAMPLE.COM' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('rejects registration without every required consent', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { ...registerBody('noconsent'), consents: [CONSENTS[0]] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('validation_failed');
  });

  it('rejects a short password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { ...registerBody('short'), password: 'abc' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects an uppercase username', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { ...registerBody('caps'), username: 'UserCaps' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /auth/login', () => {
  it('accepts the username', async () => {
    await register('login1');
    expect((await loginAs('login1')).statusCode).toBe(200);
  });

  it('accepts the email', async () => {
    await register('login2');
    const res = await loginAs('login2', { login: 'user_login2@example.com' });
    expect(res.statusCode).toBe(200);
  });

  it('answers identically for a wrong password and a missing account', async () => {
    await register('same');
    const wrong = await loginAs('same', { password: 'wrong-password-entirely' });
    const missing = await loginAs('same', {
      login: 'nobody_here',
      password: 'wrong-password-entirely',
    });

    expect(wrong.statusCode).toBe(401);
    expect(missing.statusCode).toBe(401);
    expect(wrong.json().message).toBe(missing.json().message);
  });

  it('reuses the device row when the client sends its id', async () => {
    const first = (await register('reuse')).json();
    const second = await loginAs('reuse', { device: { ...DEVICE, id: first.device.id } });
    expect(second.json().device.id).toBe(first.device.id);

    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/devices',
      headers: { authorization: `Bearer ${second.json().tokens.accessToken}` },
    });
    expect(list.json().items).toHaveLength(1);
  });

  it('creates a second session when no device id is sent', async () => {
    const first = (await register('twosess')).json();
    await loginAs('twosess');

    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/devices',
      headers: { authorization: `Bearer ${first.tokens.accessToken}` },
    });
    expect(list.json().items).toHaveLength(2);
  });

  it('blocks after too many failures', async () => {
    await register('brute');
    let last = 0;

    for (let i = 0; i < 11; i += 1) {
      const res = await loginAs('brute', { password: 'nope-nope-nope' });
      last = res.statusCode;
    }

    expect(last).toBe(429);
  });
});

describe('POST /auth/refresh', () => {
  it('rotates the pair', async () => {
    const first = (await register('rot')).json();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: first.tokens.refreshToken },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().refreshToken).not.toBe(first.tokens.refreshToken);
    expect(res.json().accessToken).toBeTruthy();
  });

  it('treats an immediate repeat as a race, not theft', async () => {
    const first = (await register('race')).json();
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: first.tokens.refreshToken },
    });
    const repeat = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: first.tokens.refreshToken },
    });

    expect(repeat.statusCode).toBe(409);
  });

  it('rejects an unknown token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: 'a'.repeat(43) },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /auth/logout', () => {
  it('kills the access token immediately', async () => {
    const body = (await register('out')).json();
    const auth = { authorization: `Bearer ${body.tokens.accessToken}` };

    expect(
      (await app.inject({ method: 'GET', url: '/api/v1/auth/devices', headers: auth })).statusCode,
    ).toBe(200);

    expect(
      (await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: auth })).statusCode,
    ).toBe(204);

    expect(
      (await app.inject({ method: 'GET', url: '/api/v1/auth/devices', headers: auth })).statusCode,
    ).toBe(401);
  });
});

describe('device management', () => {
  it('requires a token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/auth/devices' });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a garbage token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/devices',
      headers: { authorization: 'Bearer not-a-real-token' },
    });
    expect(res.statusCode).toBe(401);
  });

  it("hides another user's device behind a 404", async () => {
    const mine = (await register('mine')).json();
    const theirs = (await register('theirs')).json();

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/auth/devices/${theirs.device.id}`,
      headers: { authorization: `Bearer ${mine.tokens.accessToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('revokes a session and drops it from the list', async () => {
    const first = (await register('multi')).json();
    const second = (await loginAs('multi')).json();

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/auth/devices/${second.device.id}`,
      headers: { authorization: `Bearer ${first.tokens.accessToken}` },
    });
    expect(res.statusCode).toBe(204);

    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/devices',
      headers: { authorization: `Bearer ${first.tokens.accessToken}` },
    });
    expect(list.json().items).toHaveLength(1);
    expect(list.json().items[0].id).toBe(first.device.id);
  });

  it('kills the revoked session access token at once', async () => {
    const first = (await register('killed')).json();
    const second = (await loginAs('killed')).json();

    await app.inject({
      method: 'DELETE',
      url: `/api/v1/auth/devices/${second.device.id}`,
      headers: { authorization: `Bearer ${first.tokens.accessToken}` },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/devices',
      headers: { authorization: `Bearer ${second.tokens.accessToken}` },
    });
    expect(res.statusCode).toBe(401);
  });
});
