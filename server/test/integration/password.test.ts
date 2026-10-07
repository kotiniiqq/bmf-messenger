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
    username: body.user.username,
    password: uniqueUser(suffix).password,
    headers: { authorization: `Bearer ${body.tokens.accessToken}` },
  };
}

const change = (headers: Record<string, string>, currentPassword: string, newPassword: string) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/auth/password',
    headers,
    payload: { currentPassword, newPassword },
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

describe('POST /auth/password', () => {
  it('changes the password and lets the new one sign in', async () => {
    const alice = await makeUser('pwa');
    const res = await change(alice.headers, alice.password, 'brand-new-password-1');
    expect(res.statusCode).toBe(200);

    const ok = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { login: alice.username, password: 'brand-new-password-1', device: DEVICE },
    });
    expect(ok.statusCode).toBe(200);
  });

  it('stops the old password working', async () => {
    const alice = await makeUser('pwb');
    await change(alice.headers, alice.password, 'brand-new-password-2');

    const stale = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { login: alice.username, password: alice.password, device: DEVICE },
    });
    expect(stale.statusCode).toBe(401);
  });

  it('refuses a wrong current password', async () => {
    const alice = await makeUser('pwc');
    const res = await change(alice.headers, 'not-the-password', 'brand-new-password-3');
    expect(res.statusCode).toBe(401);
  });

  it('refuses reusing the same password', async () => {
    const alice = await makeUser('pwd');
    const res = await change(alice.headers, alice.password, alice.password);
    expect(res.statusCode).toBe(400);
  });

  it('refuses a new password that is too short', async () => {
    const alice = await makeUser('pwe');
    const res = await change(alice.headers, alice.password, 'short');
    expect(res.statusCode).toBe(400);
  });

  it('ends other sessions but keeps the caller signed in', async () => {
    const alice = await makeUser('pwf');

    const other = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { login: alice.username, password: alice.password, device: DEVICE },
    });
    const otherHeaders = { authorization: `Bearer ${other.json().tokens.accessToken}` };

    const res = await change(alice.headers, alice.password, 'brand-new-password-4');
    expect(res.json().revokedSessions).toBe(1);

    // The other device is out immediately, not when its token expires.
    const kicked = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/devices',
      headers: otherHeaders,
    });
    expect(kicked.statusCode).toBe(401);

    const mine = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/devices',
      headers: alice.headers,
    });
    expect(mine.statusCode).toBe(200);
  });
});
