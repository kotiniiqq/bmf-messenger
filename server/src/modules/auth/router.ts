import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ERROR, LIMITS, type AuthResponse, type DeviceListResponse } from '@bmf/shared';
import { AppError } from '../../lib/errors.js';
import { consumeAttempt } from '../../lib/rate-limit.js';
import { authOf, requireAuth } from './plugin.js';
import * as service from './service.js';

const deviceSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(64),
  platform: z.enum(['windows', 'linux', 'macos', 'android', 'ios']),
});

const consentSchema = z.object({
  document: z.string().min(1).max(64),
  version: z.string().min(1).max(32),
});

const registerSchema = z.object({
  username: z
    .string()
    .min(LIMITS.usernameMinLength)
    .max(LIMITS.usernameMaxLength)
    // Lowercase only: mixed case invites impersonation by look-alike names.
    .regex(/^[a-z0-9_]+$/, 'Use lowercase letters, digits and underscores'),
  email: z.string().email().max(254),
  password: z.string().min(LIMITS.passwordMinLength).max(LIMITS.passwordMaxLength),
  displayName: z.string().max(LIMITS.displayNameLength).optional(),
  device: deviceSchema,
  consents: z.array(consentSchema).min(1),
});

const loginSchema = z.object({
  login: z.string().min(1).max(254),
  password: z.string().min(1).max(LIMITS.passwordMaxLength),
  device: deviceSchema,
});

const refreshSchema = z.object({ refreshToken: z.string().min(20) });

const passwordSchema = z.object({
  currentPassword: z.string().min(1).max(LIMITS.passwordMaxLength),
  newPassword: z.string().min(LIMITS.passwordMinLength).max(LIMITS.passwordMaxLength),
});

const deviceIdSchema = z.object({ id: z.string().uuid() });

const contextOf = (req: FastifyRequest) => ({ ip: req.ip || null });

/** A blanket brake on every /auth route, independent of per-account limits. */
async function guardBurst(req: FastifyRequest): Promise<void> {
  const result = await consumeAttempt(
    `auth:burst:${req.ip || 'unknown'}`,
    LIMITS.authRequestsPerMinute,
    60,
  );

  if (!result.allowed) {
    throw new AppError(ERROR.RATE_LIMITED, 'Too many requests', 429, {
      retryAfter: result.retryAfterSeconds,
    });
  }
}

export async function authRoutes(app: FastifyInstance) {
  app.addHook('onRequest', guardBurst);

  app.post('/auth/register', async (req, reply) => {
    const body = registerSchema.parse(req.body);
    const result: AuthResponse = await service.register(body, contextOf(req));
    return reply.code(201).send(result);
  });

  app.post('/auth/login', async (req, reply) => {
    const body = loginSchema.parse(req.body);
    const result: AuthResponse = await service.login(body, contextOf(req));
    return reply.code(200).send(result);
  });

  app.post('/auth/refresh', async (req, reply) => {
    const body = refreshSchema.parse(req.body);
    const tokens = await service.refresh(body.refreshToken, contextOf(req));
    return reply.code(200).send(tokens);
  });

  app.post('/auth/logout', { preHandler: requireAuth }, async (req, reply) => {
    const { userId, deviceId } = authOf(req);
    await service.logout(userId, deviceId);
    return reply.code(204).send();
  });

  app.post('/auth/password', { preHandler: requireAuth }, async (req) => {
    const body = passwordSchema.parse(req.body);
    const { userId, deviceId } = authOf(req);
    return service.changePassword(userId, deviceId, body);
  });

  app.get('/auth/devices', { preHandler: requireAuth }, async (req, reply) => {
    const { userId, deviceId } = authOf(req);
    const body: DeviceListResponse = { items: await service.listDevices(userId, deviceId) };
    return reply.code(200).send(body);
  });

  app.delete('/auth/devices/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = deviceIdSchema.parse(req.params);
    const { userId } = authOf(req);
    await service.revokeDeviceById(userId, id);
    return reply.code(204).send();
  });
}
