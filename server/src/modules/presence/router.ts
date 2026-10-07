import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../auth/plugin.js';
import * as service from './service.js';

const query = z.object({
  /** Comma-separated ids; the chat list asks about everyone it draws. */
  userIds: z
    .string()
    .min(1)
    .transform((raw) => raw.split(',').map((id) => id.trim()).filter(Boolean))
    .pipe(z.array(z.string().uuid()).min(1).max(200)),
});

export async function presenceRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireAuth);

  // Presence arrives over the socket afterwards; this is the first picture, so
  // a client that just connected does not show everyone as offline until
  // someone happens to change state (hard rule 8).
  app.get('/presence', async (req) => {
    const { userIds } = query.parse(req.query);
    return { items: await service.readMany(userIds) };
  });
}
