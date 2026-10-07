import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ERROR, LIMITS } from '@bmf/shared';
import { AppError } from '../../lib/errors.js';
import { authOf, requireAuth } from '../auth/plugin.js';
import * as service from './service.js';

const idParam = z.object({ id: z.string().uuid() });

const galleryQuery = z.object({
  before: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export async function mediaRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireAuth);

  app.post('/media/upload', async (req, reply) => {
    const file = await req.file({ limits: { fileSize: LIMITS.attachmentSizeBytes } });

    if (!file) {
      throw new AppError(ERROR.VALIDATION, 'No file in the request', 400);
    }

    const body = await file.toBuffer();
    const { userId } = authOf(req);

    const uploaded = await service.upload({
      userId,
      filename: file.filename,
      mime: file.mimetype,
      body,
    });

    return reply.code(201).send(uploaded);
  });

  /** The pictures of a chat, newest first — the gallery on a profile screen. */
  app.get('/chats/:id/media', async (req) => {
    const { id } = idParam.parse(req.params);
    const query = galleryQuery.parse(req.query);
    const { userId } = authOf(req);
    return service.imagesInChat(id, userId, query);
  });

  /**
   * Streams the file. It used to redirect to a signed storage URL, which is the
   * better shape when the client can reach storage — on the beta it cannot, so
   * every attachment pointed at an unresolvable host and nothing ever opened.
   *
   * `inline` rather than `attachment`: this is what an `<img>` reads from, and
   * a download is the same bytes with a different intent on the client side.
   */
  app.get('/media/:id', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const { userId } = authOf(req);
    const file = await service.download(id, userId);

    return reply
      .header('content-type', file.mime)
      .header('content-length', file.size)
      .header(
        'content-disposition',
        `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      )
      // Private: the URL is the same for everyone, the permission is not.
      .header('cache-control', 'private, max-age=86400')
      .send(file.body);
  });
}
