import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { LIMITS } from '@bmf/shared';
import { authOf, requireAuth } from '../auth/plugin.js';
import * as service from './service.js';

const searchQuery = z.object({
  q: z.string().min(1).max(256),
  chatId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(LIMITS.maxPageSize).optional(),
});

export async function searchRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireAuth);

  app.get('/search', async (req) => {
    const query = searchQuery.parse(req.query);
    const { userId } = authOf(req);
    return { items: await service.search(userId, query.q, query) };
  });
}
