import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authOf, requireAuth } from '../auth/plugin.js';
import * as service from './service.js';

/** Routers never touch the database directly (CONTRIBUTING.md layout rules). */

const startBody = z.object({
  kind: z.enum(['audio', 'video']).default('audio'),
});

const endBody = z.object({
  reason: z.enum(['hangup', 'declined', 'missed', 'failed']).default('hangup'),
});

const idParam = z.object({ id: z.string().uuid() });
const chatParam = z.object({ chatId: z.string().uuid() });

const historyQuery = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40),
});

export async function callRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireAuth);

  // Spec section 6: POST /calls/:chatId/start → LiveKit token + room.
  app.post('/calls/:chatId/start', async (req, reply) => {
    const { chatId } = chatParam.parse(req.params);
    const { kind } = startBody.parse(req.body ?? {});
    const { userId } = authOf(req);

    const credentials = await service.start({ chatId, userId, kind });
    return reply.code(201).send(credentials);
  });

  // Answering a ring, or rejoining after the app was closed mid-call.
  app.post('/calls/:id/join', async (req) => {
    const { id } = idParam.parse(req.params);
    return service.join(id, authOf(req).userId);
  });

  app.post('/calls/:id/leave', async (req) => {
    const { id } = idParam.parse(req.params);
    return { call: await service.leave(id, authOf(req).userId) };
  });

  app.post('/calls/:id/end', async (req) => {
    const { id } = idParam.parse(req.params);
    const { reason } = endBody.parse(req.body ?? {});
    return { call: await service.end(id, authOf(req).userId, reason) };
  });

  /**
   * Hard rule 8: a client that reconnects must be able to catch up without the
   * socket. Without this, someone whose network blinked during a call has no way
   * to discover they are still in one.
   */
  app.get('/calls/active', async (req) => {
    return { items: await service.listActive(authOf(req).userId) };
  });

  // The history screen. Cursor-keyed, like every other list here.
  app.get('/calls/history', async (req) => {
    const { cursor, limit } = historyQuery.parse(req.query ?? {});
    return service.history({ userId: authOf(req).userId, before: cursor ?? null, limit });
  });
}
