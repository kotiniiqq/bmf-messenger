import {
  ERROR,
  LIMITS,
  REQUIRED_CONSENTS,
  type AuthResponse,
  type AuthTokens,
  type ConsentRef,
  type Device,
  type DeviceInput,
} from '@bmf/shared';
import { config } from '../../lib/config.js';
import { AppError } from '../../lib/errors.js';
import { lookupCity } from '../../lib/geoip.js';
import { hashPassword, verifyDummyPassword, verifyPassword } from '../../lib/password.js';
import { consumeAttempt, resetAttempts } from '../../lib/rate-limit.js';
import {
  generateRefreshToken,
  hashRefreshToken,
  issueAccessToken,
  refreshExpiryDate,
} from '../../lib/tokens.js';
import { revokeAccessFor } from './plugin.js';
import * as repo from './repo.js';
import { toDevice, toUser, type DeviceRow } from './types.js';

export interface RequestContext {
  ip: string | null;
}

/** Two parallel refreshes from one client land inside this window. */
const REFRESH_RACE_WINDOW_MS = 10_000;

async function issueTokens(
  userId: string,
  deviceId: string,
  refreshToken: string,
): Promise<AuthTokens> {
  return {
    accessToken: await issueAccessToken(userId, deviceId),
    refreshToken,
    expiresIn: config.ACCESS_TTL_SECONDS,
  };
}

function assertConsents(given: ConsentRef[]): void {
  const missing = REQUIRED_CONSENTS.filter(
    (required) =>
      !given.some((g) => g.document === required.document && g.version === required.version),
  );

  if (missing.length > 0) {
    throw new AppError(ERROR.VALIDATION, 'Required consents are missing', 400, {
      missing: missing.map((m) => m.document),
    });
  }
}

/** Creates a session row and returns the token the caller must hand back. */
async function createDevice(
  userId: string,
  input: DeviceInput,
  ctx: RequestContext,
): Promise<{ row: DeviceRow; refreshToken: string }> {
  const refreshToken = generateRefreshToken();
  const row = await repo.insertDevice({
    userId,
    name: input.name,
    platform: input.platform,
    refreshTokenHash: hashRefreshToken(refreshToken),
    refreshExpiresAt: refreshExpiryDate(),
    ip: ctx.ip,
    city: await lookupCity(ctx.ip ?? undefined),
  });
  return { row, refreshToken };
}

export async function register(
  input: {
    username: string;
    email: string;
    password: string;
    displayName?: string;
    device: DeviceInput;
    consents: ConsentRef[];
  },
  ctx: RequestContext,
): Promise<AuthResponse> {
  assertConsents(input.consents);

  if (await repo.usernameTaken(input.username)) {
    throw new AppError(ERROR.CONFLICT, 'Username is already taken', 409, { field: 'username' });
  }
  if (await repo.emailTaken(input.email)) {
    throw new AppError(ERROR.CONFLICT, 'Email is already registered', 409, { field: 'email' });
  }

  const user = await repo.insertUser({
    username: input.username,
    email: input.email,
    passwordHash: await hashPassword(input.password),
    displayName: input.displayName?.trim() || input.username,
  });

  await repo.insertConsents(user.id, input.consents);
  const { row, refreshToken } = await createDevice(user.id, input.device, ctx);
  await repo.writeAudit({ actorId: user.id, action: 'auth.register', target: row.id });

  return {
    user: toUser(user),
    device: toDevice(row, row.id),
    tokens: await issueTokens(user.id, row.id, refreshToken),
  };
}

export async function login(
  input: { login: string; password: string; device: DeviceInput },
  ctx: RequestContext,
): Promise<AuthResponse> {
  const attemptKey = `auth:login:${ctx.ip ?? 'unknown'}:${input.login.toLowerCase()}`;
  const rate = await consumeAttempt(attemptKey, LIMITS.loginAttemptsPer15Min, 15 * 60);

  if (!rate.allowed) {
    throw new AppError(ERROR.RATE_LIMITED, 'Too many attempts, try again later', 429, {
      retryAfter: rate.retryAfterSeconds,
    });
  }

  const user = await repo.findUserByLogin(input.login);

  if (!user) {
    // Burn comparable time so a missing account is indistinguishable from a
    // wrong password by response timing alone.
    await verifyDummyPassword(input.password);
    await repo.writeAudit({ actorId: null, action: 'auth.login_failed', target: input.login });
    throw AppError.unauthorized('Invalid credentials');
  }

  if (!(await verifyPassword(user.passwordHash, input.password))) {
    await repo.writeAudit({ actorId: user.id, action: 'auth.login_failed' });
    throw AppError.unauthorized('Invalid credentials');
  }

  await resetAttempts(attemptKey);

  const existing = input.device.id ? await repo.findDeviceById(input.device.id, user.id) : null;
  let row: DeviceRow;
  let issuedRefresh: string;

  if (existing) {
    issuedRefresh = generateRefreshToken();
    row = await repo.rotateDeviceRefresh({
      deviceId: existing.id,
      newHash: hashRefreshToken(issuedRefresh),
      refreshExpiresAt: refreshExpiryDate(),
      ip: ctx.ip,
      city: await lookupCity(ctx.ip ?? undefined),
    });
  } else {
    const created = await createDevice(user.id, input.device, ctx);
    row = created.row;
    issuedRefresh = created.refreshToken;
  }

  await repo.writeAudit({ actorId: user.id, action: 'auth.login', target: row.id });

  return {
    user: toUser(user),
    device: toDevice(row, row.id),
    tokens: await issueTokens(user.id, row.id, issuedRefresh),
  };
}

export async function refresh(refreshToken: string, ctx: RequestContext): Promise<AuthTokens> {
  const hash = hashRefreshToken(refreshToken);
  const device = await repo.findDeviceByRefreshHash(hash);

  if (!device) {
    const reused = await repo.findDeviceByPrevRefreshHash(hash);

    if (reused) {
      const rotatedAt = reused.refreshRotatedAt?.getTime() ?? 0;

      // Inside the window this is one client racing itself, not an attacker.
      if (Date.now() - rotatedAt < REFRESH_RACE_WINDOW_MS) {
        throw new AppError(ERROR.CONFLICT, 'Token was just rotated, retry with the newer one', 409);
      }

      await repo.revokeDevice(reused.id);
      await revokeAccessFor(reused.id);
      await repo.writeAudit({
        actorId: reused.userId,
        action: 'auth.refresh_reuse',
        target: reused.id,
      });
      throw AppError.unauthorized('Refresh token was already used; session revoked');
    }

    throw AppError.unauthorized('Refresh token is not valid');
  }

  if (device.refreshExpiresAt && device.refreshExpiresAt.getTime() < Date.now()) {
    throw AppError.unauthorized('Refresh token has expired');
  }

  const nextToken = generateRefreshToken();
  await repo.rotateDeviceRefresh({
    deviceId: device.id,
    newHash: hashRefreshToken(nextToken),
    refreshExpiresAt: refreshExpiryDate(),
    ip: ctx.ip,
    city: await lookupCity(ctx.ip ?? undefined),
  });

  return issueTokens(device.userId, device.id, nextToken);
}

/**
 * Changing the password ends every other session. Someone who changes it because
 * they suspect a compromise expects exactly that, and leaving the intruder signed
 * in would make the whole action pointless.
 */
export async function changePassword(
  userId: string,
  deviceId: string,
  input: { currentPassword: string; newPassword: string },
): Promise<{ revokedSessions: number }> {
  const user = await repo.findUserById(userId);
  if (!user) throw AppError.notFound('Account not found');

  if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
    throw AppError.unauthorized('Current password is wrong');
  }

  if (input.newPassword === input.currentPassword) {
    throw new AppError(ERROR.VALIDATION, 'The new password repeats the old one', 400);
  }

  await repo.updatePassword(userId, await hashPassword(input.newPassword));

  const revoked = await repo.revokeOtherDevices(userId, deviceId);
  for (const id of revoked) await revokeAccessFor(id);

  await repo.writeAudit({
    actorId: userId,
    action: 'auth.password_changed',
    meta: { revokedSessions: revoked.length },
  });

  return { revokedSessions: revoked.length };
}

export async function logout(userId: string, deviceId: string): Promise<void> {
  await repo.revokeDevice(deviceId);
  await revokeAccessFor(deviceId);
  await repo.writeAudit({ actorId: userId, action: 'auth.logout', target: deviceId });
}

export async function listDevices(userId: string, currentDeviceId: string): Promise<Device[]> {
  const rows = await repo.listActiveDevices(userId);
  return rows.map((row) => toDevice(row, currentDeviceId));
}

export async function revokeDeviceById(userId: string, deviceId: string): Promise<void> {
  const device = await repo.findDeviceById(deviceId, userId);

  // 404 rather than 403: a 403 would confirm that the id exists.
  if (!device) throw AppError.notFound('Device not found');

  await repo.revokeDevice(device.id);
  await revokeAccessFor(device.id);
  await repo.writeAudit({ actorId: userId, action: 'auth.device_revoked', target: device.id });
}
