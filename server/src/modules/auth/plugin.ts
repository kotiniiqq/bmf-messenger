import type { FastifyReply, FastifyRequest } from 'fastify';
import { redis } from '../../db/redis.js';
import { config } from '../../lib/config.js';
import { AppError } from '../../lib/errors.js';
import { verifyAccessToken } from '../../lib/tokens.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth?: { userId: string; deviceId: string };
  }
}

const key = (deviceId: string) => `revoked:device:${deviceId}`;

/**
 * Access tokens are stateless, so logging out cannot invalidate one by itself.
 * The denylist closes that window: entries live exactly as long as a token
 * could, after which the token has expired anyway and the key can go.
 */
export async function revokeAccessFor(deviceId: string): Promise<void> {
  await redis.set(key(deviceId), '1', 'EX', config.ACCESS_TTL_SECONDS);
}

export async function isDeviceRevoked(deviceId: string): Promise<boolean> {
  return (await redis.exists(key(deviceId))) === 1;
}

export async function requireAuth(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw AppError.unauthorized();
  }

  let claims;
  try {
    claims = await verifyAccessToken(header.slice('Bearer '.length));
  } catch {
    throw AppError.unauthorized('Access token is invalid or expired');
  }

  if (await isDeviceRevoked(claims.deviceId)) {
    throw AppError.unauthorized('Session has been revoked');
  }

  req.auth = { userId: claims.userId, deviceId: claims.deviceId };
}

/** Narrow helper so handlers do not repeat the non-null assertion. */
export function authOf(req: FastifyRequest): { userId: string; deviceId: string } {
  if (!req.auth) throw AppError.unauthorized();
  return req.auth;
}
