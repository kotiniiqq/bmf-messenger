import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { LIMITS } from '@bmf/shared';
import { authOf, requireAuth } from '../auth/plugin.js';
import * as service from './service.js';

const idParam = z.object({ id: z.string().uuid() });

const createChatSchema = z.object({
  type: z.enum(['group', 'channel']),
  title: z.string().min(1).max(LIMITS.chatTitleLength),
  description: z.string().max(600).default(''),
  /** Picked in the wizard's first step; the button used to do nothing (#21). */
  avatarId: z.string().uuid().optional(),
  memberIds: z.array(z.string().uuid()).max(500).default([]),
  // Roles are part of the create contract (spec section 6); anyone not named
  // here joins as a plain member.
  roles: z.record(z.string().uuid(), z.enum(['admin', 'member'])).default({}),
});

const directChatSchema = z.object({ userId: z.string().uuid() });

const updateChatSchema = z
  .object({
    title: z.string().min(1).max(LIMITS.chatTitleLength).optional(),
    description: z.string().max(600).optional(),
    /** An uploaded image; null takes the picture off. */
    avatarId: z.string().uuid().nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to change' });

const sendMessageSchema = z.object({
  clientMsgId: z.string().uuid(),
  kind: z
    .enum(['text', 'image', 'file', 'voice', 'sticker', 'gif', 'track', 'mail_card', 'system'])
    .default('text'),
  body: z.string().max(LIMITS.messageLength).default(''),
  replyTo: z.string().uuid().optional(),
  scheduledAt: z.string().datetime().optional(),
  attachmentIds: z.array(z.string().uuid()).max(LIMITS.attachmentsPerMessage).optional(),
  forwardFrom: z.string().uuid().optional(),
  /**
   * Ciphertext, in a chat under the privacy mode. The bound is generous because
   * a Signal envelope carries headers and padding on top of the text, and a
   * message refused for being three bytes over would be a silent failure to
   * send.
   */
  envelope: z
    .object({
      type: z.number().int().min(0).max(255),
      body: z.string().min(1).max(LIMITS.messageLength * 4),
      fromDeviceId: z.string().uuid(),
      toDeviceId: z.string().uuid(),
    })
    .optional(),
});

const privacySchema = z.object({
  action: z.enum(['propose', 'accept', 'cancel']),
});

const pageQuery = z.object({
  before: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(LIMITS.maxPageSize).optional(),
});

const editSchema = z.object({ body: z.string().max(LIMITS.messageLength) });
const reactionSchema = z.object({ emoji: z.string().min(1).max(16) });
// A null message id still means "unpin everything" — that is what the button on
// the header bar did before a chat could hold more than one pin, and a client
// that has not been updated must not start pinning things by accident.
const pinSchema = z.object({
  messageId: z.string().uuid().nullable(),
  pinned: z.boolean().optional(),
});
const readSchema = z.object({ messageId: z.string().uuid() });
const draftSchema = z.object({ draft: z.string().max(LIMITS.messageLength).nullable() });
const placementSchema = z
  .object({
    folder: z.string().min(1).max(40).nullable().optional(),
    isLater: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to change' });
const syncQuery = z.object({ since: z.string().optional() });

export async function chatRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireAuth);

  app.get('/chats', async (req) => {
    const { userId } = authOf(req);
    return { items: await service.listChats(userId) };
  });

  app.post('/chats', async (req, reply) => {
    const body = createChatSchema.parse(req.body);
    const { userId } = authOf(req);
    return reply.code(201).send(await service.createGroup(userId, body));
  });

  app.post('/chats/direct', async (req, reply) => {
    const body = directChatSchema.parse(req.body);
    const { userId } = authOf(req);
    return reply.code(200).send(await service.openDirectChat(userId, body.userId));
  });

  /**
   * Deleting a chat is per member: leaving, for a room; clearing, for a direct
   * chat. Either way it is 204 — there is nothing left to hand back.
   */
  app.delete('/chats/:id', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const { userId } = authOf(req);
    await service.deleteChat(id, userId);
    return reply.code(204).send();
  });

  app.patch('/chats/:id', async (req) => {
    const { id } = idParam.parse(req.params);
    const body = updateChatSchema.parse(req.body);
    const { userId } = authOf(req);
    return service.updateChat(id, userId, body);
  });

  app.get('/chats/:id/members', async (req) => {
    const { id } = idParam.parse(req.params);
    const { userId } = authOf(req);
    return { items: await service.listMembers(id, userId) };
  });

  app.get('/chats/:id/messages', async (req) => {
    const { id } = idParam.parse(req.params);
    const query = pageQuery.parse(req.query);
    const { userId } = authOf(req);
    return service.listMessages(id, userId, query);
  });

  app.post('/chats/:id/messages', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = sendMessageSchema.parse(req.body);
    const { userId } = authOf(req);

    const { message, created } = await service.sendMessage(id, userId, body);
    // A repeat of an already-accepted send is a 200, not a second creation.
    return reply.code(created ? 201 : 200).send(message);
  });

  /**
   * The privacy mode. Offered in the chat, answered in the chat — there is no
   * switch in the general settings on purpose (spec §5).
   */
  app.get('/chats/:id/privacy', async (req) => {
    const { id } = idParam.parse(req.params);
    return service.privacyOf(id, authOf(req).userId);
  });

  app.post('/chats/:id/privacy', async (req) => {
    const { id } = idParam.parse(req.params);
    const { action } = privacySchema.parse(req.body ?? {});
    const { userId, deviceId } = authOf(req);

    if (action === 'propose') return service.proposePrivacy(id, userId, deviceId);
    if (action === 'accept') return service.acceptPrivacy(id, userId, deviceId);
    return service.cancelPrivacy(id, userId);
  });

  app.patch('/messages/:id', async (req) => {
    const { id } = idParam.parse(req.params);
    const { body } = editSchema.parse(req.body);
    const { userId } = authOf(req);
    return service.editMessage(id, userId, body);
  });

  app.delete('/messages/:id', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const { userId } = authOf(req);
    await service.deleteMessage(id, userId);
    return reply.code(204).send();
  });

  app.post('/messages/:id/reactions', async (req) => {
    const { id } = idParam.parse(req.params);
    const { emoji } = reactionSchema.parse(req.body);
    const { userId } = authOf(req);
    return service.toggleReaction(id, userId, emoji);
  });

  app.post('/chats/:id/pin', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const { messageId, pinned } = pinSchema.parse(req.body);
    const { userId } = authOf(req);
    await service.pinMessage(id, userId, messageId, pinned ?? true);
    return reply.code(204).send();
  });

  app.post('/chats/:id/read', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const { messageId } = readSchema.parse(req.body);
    const { userId } = authOf(req);
    await service.markRead(id, userId, messageId);
    return reply.code(204).send();
  });

  app.put('/chats/:id/draft', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const { draft } = draftSchema.parse(req.body);
    const { userId } = authOf(req);
    await service.saveDraft(id, userId, draft);
    return reply.code(204).send();
  });

  // Which folder a chat is filed under, and whether it is put off until later.
  // Both live on the membership, so this is the caller's own view of the chat.
  app.patch('/chats/:id/placement', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const patch = placementSchema.parse(req.body);
    const { userId } = authOf(req);
    await service.setPlacement(id, userId, patch);
    return reply.code(204).send();
  });

  app.get('/sync', async (req) => {
    const { since } = syncQuery.parse(req.query);
    const { userId } = authOf(req);
    return service.sync(userId, since);
  });
}
