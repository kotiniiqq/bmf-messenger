import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ERROR, LIMITS, type User } from '@bmf/shared';
import { AppError } from '../../lib/errors.js';
import { authOf, requireAuth } from '../auth/plugin.js';
import * as authRepo from '../auth/repo.js';
import { toUser } from '../auth/types.js';
import * as media from '../media/service.js';
import * as repo from './repo.js';

const searchQuery = z.object({
  q: z.string().min(2).max(32),
  limit: z.coerce.number().int().min(1).max(20).optional(),
});

const patchSchema = z.object({
  // Same rule as registration: lowercase only, because mixed case invites
  // impersonation by look-alike names.
  username: z
    .string()
    .min(LIMITS.usernameMinLength)
    .max(LIMITS.usernameMaxLength)
    .regex(/^[a-z0-9_]+$/, 'Use lowercase letters, digits and underscores')
    .optional(),
  displayName: z.string().min(1).max(LIMITS.displayNameLength).optional(),
  statusId: z.enum(['on', 'focus', 'call', 'away', 'dnd', 'off']).optional(),
  statusText: z.string().max(LIMITS.statusTextLength).nullable().optional(),
  statusAuto: z.boolean().optional(),
  showLastSeen: z.boolean().optional(),
});

export async function userRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireAuth);

  app.get('/me', async (req) => {
    const { userId } = authOf(req);
    const row = await authRepo.findUserById(userId);
    if (!row) throw AppError.notFound('Account not found');
    return toUser(row);
  });

  app.patch('/me', async (req) => {
    const patch = patchSchema.parse(req.body);
    const { userId } = authOf(req);

    // Checked here rather than left to the unique index: a 409 naming the
    // field is something the form can point at, a constraint violation is a 500.
    if (patch.username && (await repo.usernameTakenBySomeoneElse(patch.username, userId))) {
      throw new AppError(ERROR.CONFLICT, 'Username is already taken', 409, { field: 'username' });
    }

    const row = await repo.updateProfile(userId, patch);
    if (!row) throw AppError.notFound('Account not found');
    return toUser(row);
  });

  /**
   * The avatar. An image, uploaded and pointed at in one request, because a
   * two-step "upload then patch" leaves an orphan whenever the second step
   * fails and a picture nobody can see if it fails the other way round.
   */
  app.put('/me/avatar', async (req, reply) => {
    const file = await req.file({ limits: { fileSize: LIMITS.attachmentSizeBytes } });
    if (!file) throw new AppError(ERROR.VALIDATION, 'No file in the request', 400);

    if (!file.mimetype.startsWith('image/')) {
      throw new AppError(ERROR.VALIDATION, 'An avatar has to be an image', 400);
    }

    const { userId } = authOf(req);
    const uploaded = await media.upload({
      userId,
      filename: file.filename,
      mime: file.mimetype,
      body: await file.toBuffer(),
    });

    const row = await repo.updateProfile(userId, { avatarUrl: uploaded.id });
    if (!row) throw AppError.notFound('Account not found');

    return reply.code(200).send(toUser(row));
  });

  app.delete('/me/avatar', async (req) => {
    const { userId } = authOf(req);
    const row = await repo.updateProfile(userId, { avatarUrl: null });
    if (!row) throw AppError.notFound('Account not found');
    return toUser(row);
  });

  // Finding people by handle is what makes a fresh install usable at all —
  // without it two testers cannot start a conversation.
  app.get('/users/search', async (req) => {
    const { q, limit } = searchQuery.parse(req.query);
    const { userId } = authOf(req);
    const rows = await repo.searchByHandle(q, userId, limit ?? 10);
    const items: User[] = rows.map(toUser);
    return { items };
  });
}
