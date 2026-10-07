import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authOf, requireAuth } from '../auth/plugin.js';
import * as service from './service.js';

/** Routers never touch the database directly (CONTRIBUTING.md layout rules). */

/**
 * Base64 of something libsignal serialised. Bounded because these arrive from a
 * client and are stored verbatim: the server cannot tell a key from a novel, so
 * the length is the only thing it can insist on.
 */
const key = z.string().min(1).max(4096).regex(/^[A-Za-z0-9+/]+={0,2}$/, 'Expected base64');

const oneTimePreKey = z.object({
  id: z.number().int().min(0).max(0xffffff),
  key,
});

const uploadBody = z.object({
  registrationId: z.number().int().min(1).max(0x3fff),
  identityKey: key,
  signedPreKeyId: z.number().int().min(0).max(0xffffff),
  signedPreKey: key,
  signedPreKeySignature: key,
  kyberPreKeyId: z.number().int().min(0).max(0xffffff),
  kyberPreKey: key,
  kyberPreKeySignature: key,
  oneTimePreKeys: z.array(oneTimePreKey).max(service.PREKEY_TARGET),
});

const topUpBody = z.object({
  oneTimePreKeys: z.array(oneTimePreKey).min(1).max(service.PREKEY_TARGET),
});

const userParam = z.object({ userId: z.string().uuid() });
const deviceParam = z.object({ userId: z.string().uuid(), deviceId: z.string().uuid() });

export async function keyRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireAuth);

  /**
   * Publishing is always for the device that authenticated. Taking the device
   * from the body would let anyone overwrite anyone's keys, which is the one
   * mistake in this module that would be silent and total.
   */
  app.put('/keys', async (req, reply) => {
    const upload = uploadBody.parse(req.body ?? {});
    const { userId, deviceId } = authOf(req);
    return reply.code(200).send(await service.publish(userId, deviceId, upload));
  });

  app.post('/keys/top-up', async (req) => {
    const { oneTimePreKeys } = topUpBody.parse(req.body ?? {});
    return service.topUp(authOf(req).deviceId, oneTimePreKeys);
  });

  app.get('/keys/status', async (req) => service.status(authOf(req).deviceId));

  // Asking for somebody's keys consumes one of their one-time prekeys, which is
  // why this is a POST: it changes state on the other side.
  app.post('/keys/claim/:userId', async (req) => {
    const { userId } = userParam.parse(req.params);
    return { items: await service.bundlesFor(userId) };
  });

  app.post('/keys/claim/:userId/:deviceId', async (req) => {
    const { userId, deviceId } = deviceParam.parse(req.params);
    return service.bundleFor(userId, deviceId);
  });

  /** A device that regenerated its identity: what is stored is now wrong. */
  app.delete('/keys', async (req, reply) => {
    await service.forget(authOf(req).deviceId);
    return reply.code(204).send();
  });
}
