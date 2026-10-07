import { describe, expect, it } from 'vitest';
import {
  generateRefreshToken,
  hashRefreshToken,
  issueAccessToken,
  refreshExpiryDate,
  verifyAccessToken,
} from '../../src/lib/tokens.js';

const USER = '11111111-1111-1111-1111-111111111111';
const DEVICE = '22222222-2222-2222-2222-222222222222';

describe('access tokens', () => {
  it('round-trips the user and device', async () => {
    const token = await issueAccessToken(USER, DEVICE);
    const claims = await verifyAccessToken(token);
    expect(claims.userId).toBe(USER);
    expect(claims.deviceId).toBe(DEVICE);
    expect(claims.jti).toMatch(/.+/);
  });

  it('rejects a tampered token', async () => {
    const token = await issueAccessToken(USER, DEVICE);
    const tampered = `${token.slice(0, -3)}aaa`;
    await expect(verifyAccessToken(tampered)).rejects.toThrow();
  });

  it('rejects a token signed with another secret', async () => {
    const { SignJWT } = await import('jose');
    const foreign = await new SignJWT({ did: DEVICE })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(USER)
      .setIssuer('bmf')
      .setAudience('bmf-app')
      .setExpirationTime('15m')
      .sign(new TextEncoder().encode('a-different-secret-at-least-32-chars'));
    await expect(verifyAccessToken(foreign)).rejects.toThrow();
  });

  it('carries no premium claim — the server decides that per request', async () => {
    const token = await issueAccessToken(USER, DEVICE);
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1] as string, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
    expect(payload).not.toHaveProperty('pro');
    expect(payload).not.toHaveProperty('isPro');
  });
});

describe('refresh tokens', () => {
  it('generates distinct high-entropy tokens', () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(43);
  });

  it('hashes deterministically and differently per token', () => {
    const token = generateRefreshToken();
    expect(hashRefreshToken(token)).toBe(hashRefreshToken(token));
    expect(hashRefreshToken(token)).not.toBe(hashRefreshToken(generateRefreshToken()));
  });

  it('never stores the token itself', () => {
    const token = generateRefreshToken();
    expect(hashRefreshToken(token)).not.toContain(token);
  });

  it('expires roughly 30 days out', () => {
    const days = (refreshExpiryDate().getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29);
    expect(days).toBeLessThan(31);
  });
});
