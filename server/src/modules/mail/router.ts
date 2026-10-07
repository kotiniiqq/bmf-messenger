import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authOf, requireAuth } from '../auth/plugin.js';
import * as service from './service.js';

/** Routers never touch the database directly (CONTRIBUTING.md layout rules). */

const connectBody = z.object({
  address: z.string().email(),
  password: z.string().min(1).max(512),
  label: z.string().max(80).optional(),
  imapHost: z.string().min(3).max(255).optional(),
  imapPort: z.coerce.number().int().min(1).max(65535).optional(),
});

const idParam = z.object({ id: z.string().uuid() });

const listQuery = z.object({
  folder: z.string().max(120).default('INBOX'),
  limit: z.coerce.number().int().min(1).max(100).default(40),
  before: z.string().datetime().optional(),
});

const readBody = z.object({ isRead: z.boolean() });

export async function mailRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireAuth);

  app.get('/mail/accounts', async (req) => {
    return { items: await service.list(authOf(req).userId) };
  });

  /**
   * The password is verified against the mailbox before it is stored, so a
   * wrong one fails here rather than becoming an account that never syncs.
   */
  app.post('/mail/accounts', async (req, reply) => {
    const body = connectBody.parse(req.body);
    const account = await service.connect({ ...body, userId: authOf(req).userId });
    return reply.code(201).send(account);
  });

  app.delete('/mail/accounts/:id', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    await service.disconnect(id, authOf(req).userId);
    return reply.code(204).send();
  });

  app.get('/mail/accounts/:id/messages', async (req) => {
    const { id } = idParam.parse(req.params);
    const query = listQuery.parse(req.query);

    return service.messages({
      userId: authOf(req).userId,
      accountId: id,
      folder: query.folder,
      limit: query.limit,
      before: query.before,
    });
  });

  app.get('/mail/messages/:id', async (req) => {
    const { id } = idParam.parse(req.params);
    return service.read(id, authOf(req).userId);
  });

  app.patch('/mail/messages/:id', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const { isRead } = readBody.parse(req.body);
    await service.setRead(id, authOf(req).userId, isRead);
    return reply.code(204).send();
  });
}
