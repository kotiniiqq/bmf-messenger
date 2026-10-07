import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { config } from './config.js';

const ISSUER = 'bmf';
const AUDIENCE = 'bmf-app';

const accessSecret = new TextEncoder().encode(config.JWT_ACCESS_SECRET);

export interface AccessClaims {
  userId: string;
  deviceId: string;
  jti: string;
}

/**
 * Deliberately carries no premium or role claim. Hard rule 3 puts the server in
 * charge of those, and a claim would be stale for up to the token's lifetime.
 */
export async function issueAccessToken(userId: string, deviceId: string): Promise<string> {
  return new SignJWT({ did: deviceId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${config.ACCESS_TTL_SECONDS}s`)
    .sign(accessSecret);
}

export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  const { payload } = await jwtVerify(token, accessSecret, {
    issuer: ISSUER,
    audience: AUDIENCE,
  });

  const deviceId = payload.did;
  if (typeof payload.sub !== 'string' || typeof deviceId !== 'string' || !payload.jti) {
    throw new Error('Access token is missing required claims');
  }

  return { userId: payload.sub, deviceId, jti: payload.jti };
}

/** 256 bits of entropy — brute forcing the hash is not a threat worth argon2. */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * HMAC rather than a bare digest: the pepper lives in the environment, so a
 * stolen database dump alone yields no usable refresh tokens.
 */
export function hashRefreshToken(token: string): string {
  return createHmac('sha256', config.JWT_REFRESH_SECRET).update(token).digest('hex');
}

export function refreshExpiryDate(): Date {
  return new Date(Date.now() + config.REFRESH_TTL_SECONDS * 1000);
}
