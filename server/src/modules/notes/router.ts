import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authOf, requireAuth } from '../auth/plugin.js';
import * as service from './service.js';

/** Routers never touch the database directly (CONTRIBUTING.md layout rules). */

const idParam = z.object({ id: z.string().uuid() });

const createBody = z.object({
  title: z.string().max(200).optional(),
  body: z.string().max(100_000).optional(),
  folder: z.string().min(1).max(60).nullable().optional(),
});

const patchBody = z.object({
  title: z.string().max(200).optional(),
  body: z.string().max(100_000).optional(),
  folder: z.string().min(1).max(60).nullable().optional(),
  pinned: z.boolean().optional(),
});

const listQuery = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  folder: z.string().min(1).max(60).optional(),
});

const searchQuery = z.object({
  q: z.string().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export async function noteRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireAuth);

  app.get('/notes', async (req) => {
    const { cursor, limit, folder } = listQuery.parse(req.query ?? {});
    return service.list({
      userId: authOf(req).userId,
      before: cursor ?? null,
      limit,
      folder: folder ?? null,
    });
  });

  app.get('/notes/folders', async (req) => {
    return { items: await service.folders(authOf(req).userId) };
  });

  // Registered before /notes/:id so "search" is not read as a note id.
  app.get('/notes/search', async (req) => {
    const { q, limit } = searchQuery.parse(req.query ?? {});
    return { items: await service.search(authOf(req).userId, q, limit) };
  });

  app.post('/notes', async (req, reply) => {
    const body = createBody.parse(req.body ?? {});
    return reply.code(201).send(await service.create(authOf(req).userId, body));
  });

  app.get('/notes/:id', async (req) => {
    const { id } = idParam.parse(req.params);
    return service.get(id, authOf(req).userId);
  });

  app.patch('/notes/:id', async (req) => {
    const { id } = idParam.parse(req.params);
    const patch = patchBody.parse(req.body ?? {});
    return service.update(id, authOf(req).userId, patch);
  });

  app.delete('/notes/:id', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    await service.remove(id, authOf(req).userId);
    return reply.code(204).send();
  });
}
