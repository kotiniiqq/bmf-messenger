import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { LIMITS } from '@bmf/shared';
import { authOf, requireAuth } from '../auth/plugin.js';
import * as service from './service.js';

/** Routers never touch the database directly (CONTRIBUTING.md layout rules). */

const userParam = z.object({ userId: z.string().uuid() });

const saveBody = z.object({
  localName: z.string().max(LIMITS.displayNameLength).nullable().optional(),
});

export async function contactRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireAuth);

  app.get('/contacts', async (req) => {
    const { userId } = authOf(req);
    return { items: await service.list(userId) };
  });

  /**
   * Adding and renaming are the same request on purpose: the screen offers one
   * field, and a person who types a name for somebody they have not added yet
   * means both.
   */
  app.put('/contacts/:userId', async (req) => {
    const { userId: target } = userParam.parse(req.params);
    const { localName } = saveBody.parse(req.body ?? {});
    const { userId } = authOf(req);
    return service.save(userId, target, localName ?? null);
  });

  app.delete('/contacts/:userId', async (req, reply) => {
    const { userId: target } = userParam.parse(req.params);
    const { userId } = authOf(req);
    await service.remove(userId, target);
    return reply.code(204).send();
  });
}
