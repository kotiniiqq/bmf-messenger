import {
  ERROR,
  LIMITS,
  type Chat,
  type ChatListItem,
  type ChatMemberView,
  type ChatPrivacy,
  type Envelope,
  type Message,
  type Page,
  type SyncResponse,
} from '@bmf/shared';
import { AppError } from '../../lib/errors.js';
import * as hub from '../../ws/hub.js';
import * as media from '../media/service.js';
import * as repo from './repo.js';
import {
  decodeCursor,
  encodeCursor,
  toChat,
  toMemberView,
  toMessage,
  type ChatRow,
  type MessageRow,
} from './types.js';

/** Only these roles may change a chat or moderate other people's messages. */
const MANAGER_ROLES = new Set(['owner', 'admin']);

async function requireMembership(chatId: string, userId: string) {
  const membership = await repo.findMembership(chatId, userId);
  // 404 rather than 403: a non-member has no business learning the chat exists.
  if (!membership) throw AppError.notFound('Chat not found');
  return membership;
}

/** Ids of everyone in the chat, after confirming the caller belongs to it. */
export async function membersOf(chatId: string, userId: string): Promise<string[]> {
  await requireMembership(chatId, userId);
  return repo.memberIds(chatId);
}

/**
 * The roster the client needs to put a name over an incoming bubble, and to
 * draw the chat-info panel.
 *
 * Membership is checked first for the usual reason and one extra one: a group's
 * member list says who knows whom, which is exactly the sort of thing a stranger
 * should not be able to enumerate by guessing chat ids.
 */
export async function listMembers(chatId: string, userId: string): Promise<ChatMemberView[]> {
  await requireMembership(chatId, userId);
  return (await repo.listMembers(chatId)).map(toMemberView);
}

/**
 * Removes a chat for the person asking, and only for them.
 *
 * The two halves of "delete" are different by chat type, and deliberately sit
 * behind one action because from the outside they are the same wish:
 *
 * - a group or a channel: the membership row goes, which is leaving. Messages
 *   already sent stay for everyone else — they were addressed to the room, not
 *   held on this member's behalf.
 * - a direct chat or the saved-messages one: the membership stays and the
 *   history is marked as no longer visible to this member. Removing the row
 *   would leave the other side writing into a chat with one participant, and
 *   their next message would have nowhere to arrive.
 *
 * Nothing here touches the other person's copy. There is no path in this
 * product that deletes somebody else's history, and adding one later would be
 * a different decision than this function.
 */
export async function deleteChat(chatId: string, userId: string): Promise<void> {
  const membership = await requireMembership(chatId, userId);
  const chat = await repo.findChatById(chatId);
  if (!chat) throw AppError.notFound('Chat not found');

  if (chat.type !== 'group' && chat.type !== 'channel') {
    await repo.clearFor(chatId, userId);
    return;
  }

  await repo.removeMember(chatId, userId);

  const remaining = await repo.memberIds(chatId);
  if (remaining.length === 0) {
    // Nobody is left to read it, and an empty group is only a row that grows a
    // backup. The messages go with it through the cascade.
    await repo.softDeleteChat(chatId);
    return;
  }

  if (membership.role === 'owner') {
    const successor = await repo.promoteSuccessor(chatId);
    if (successor) {
      await hub.publish(remaining, {
        type: 'chat.member',
        payload: { chatId, userId: successor, left: false },
      });
    }
  }

  await hub.publish(remaining, {
    type: 'chat.member',
    payload: { chatId, userId, left: true },
  });
}

/**
 * Renames a room, rewrites what it is about, or changes its picture.
 *
 * Only an owner or an admin, decided here rather than by hiding the button:
 * a client that hid it is a client somebody can patch (hard rule 3).
 */
export async function updateChat(
  chatId: string,
  userId: string,
  patch: { title?: string; description?: string; avatarId?: string | null },
): Promise<Chat> {
  const membership = await requireMembership(chatId, userId);
  const chat = await repo.findChatById(chatId);
  if (!chat) throw AppError.notFound('Chat not found');

  if (chat.type !== 'group' && chat.type !== 'channel') {
    throw new AppError(ERROR.VALIDATION, 'Only a group or a channel has these', 400);
  }
  if (!MANAGER_ROLES.has(membership.role)) {
    throw new AppError(ERROR.FORBIDDEN, 'Only an owner or an admin may change this', 403);
  }

  const updated = await repo.updateChat(chatId, {
    title: patch.title,
    description: patch.description,
    avatarUrl: patch.avatarId,
  });
  if (!updated) throw AppError.notFound('Chat not found');

  const members = await repo.memberIds(chatId);
  const [forCaller] = (await repo.listChatsFor(userId)).filter((row) => row.id === chatId);
  const shaped = forCaller ? toChat(forCaller) : null;
  if (shaped) await hub.publish(members, { type: 'chat.update', payload: shaped });

  return (
    shaped ?? {
      id: updated.id,
      type: updated.type,
      title: updated.title,
      description: updated.description,
      peerId: null,
      avatarUrl: updated.avatarUrl,
      accent: updated.accent,
      isE2E: updated.isE2e,
      unreadCount: 0,
      pinnedMessageIds: [],
      folder: null,
      isLater: false,
      draft: null,
      updatedAt: updated.updatedAt.toISOString(),
    }
  );
}

export async function listChats(userId: string): Promise<ChatListItem[]> {
  const rows = await repo.listChatsFor(userId);

  return Promise.all(
    rows.map(async (row) => {
      const [last] = await repo.pageMessages({
        chatId: row.id,
        before: null,
        limit: 1,
        viewerId: userId,
      });
      return {
        ...toChat(row),
        lastMessage: last ? toMessage(last) : null,
      };
    }),
  );
}

export async function createGroup(
  creatorId: string,
  input: {
    type: 'group' | 'channel';
    title: string;
    description?: string;
    avatarId?: string;
    memberIds: string[];
    roles?: Record<string, 'admin' | 'member'>;
  },
): Promise<Chat> {
  const title = input.title.trim();
  if (!title) {
    throw new AppError(ERROR.VALIDATION, 'Title is required', 400);
  }

  const chat = await repo.createChat({
    type: input.type,
    title,
    description: input.description?.trim() ?? '',
    avatarUrl: input.avatarId ?? null,
    createdBy: creatorId,
  });

  const unique = [...new Set(input.memberIds.filter((id) => id !== creatorId))];
  await repo.addMembers(chat.id, [
    // The creator's own role is not negotiable from the request body.
    { userId: creatorId, role: 'owner' },
    ...unique.map((userId) => ({ userId, role: input.roles?.[userId] ?? 'member' })),
  ]);

  const [withMembership] = await repo.listChatsFor(creatorId);
  return withMembership && withMembership.id === chat.id
    ? toChat(withMembership)
    : toChat({
        ...chat,
        role: 'owner',
        folder: null,
        isLater: false,
        draft: null,
        unreadCount: 0,
        pinnedMessageIds: [],
      });
}

/** Opening a conversation twice must land in the same chat, not create a second. */
export async function openDirectChat(userId: string, otherUserId: string): Promise<Chat> {
  if (userId === otherUserId) {
    throw new AppError(ERROR.VALIDATION, 'Cannot open a direct chat with yourself', 400);
  }

  const existing = await repo.findDirectChat(userId, otherUserId);
  const chat = existing ?? (await repo.createChat({ type: 'dm', title: '', createdBy: userId }));

  if (!existing) {
    await repo.addMembers(chat.id, [
      { userId, role: 'owner' },
      { userId: otherUserId, role: 'owner' },
    ]);
  }

  return toChat({
    ...chat,
    role: 'owner',
    folder: null,
    isLater: false,
    draft: null,
    unreadCount: 0,
    pinnedMessageIds: [],
  });
}

async function decorate(rows: MessageRow[], viewerId: string): Promise<Message[]> {
  const reactions = await repo.reactionsFor(
    rows.map((r) => r.id),
    viewerId,
  );

  return Promise.all(
    rows.map(async (row) => {
      const message = toMessage(row, reactions.get(row.id) ?? {});
      if (!row.deletedAt) {
        const files = await media.attachmentsOf(row.id);
        if (files.length > 0) message.meta = { ...message.meta, attachments: files };
      }
      return message;
    }),
  );
}

export async function listMessages(
  chatId: string,
  userId: string,
  options: { before?: string; limit?: number },
): Promise<Page<Message>> {
  await requireMembership(chatId, userId);

  const limit = Math.min(options.limit ?? LIMITS.pageSize, LIMITS.maxPageSize);
  const before = options.before ? decodeCursor(options.before) : null;

  if (options.before && !before) {
    throw new AppError(ERROR.VALIDATION, 'Malformed cursor', 400);
  }

  // One extra row tells us whether another page exists without a second query.
  const rows = await repo.pageMessages({ chatId, before, limit: limit + 1, viewerId: userId });
  const page = rows.slice(0, limit);
  const last = page.at(-1);

  return {
    items: await decorate(page, userId),
    nextCursor: rows.length > limit && last ? encodeCursor(last.id) : null,
  };
}

/**
 * The privacy mode, offered and answered inside a chat.
 *
 * Two people have to agree, and the server is what makes that binding: a client
 * that flipped the flag by itself would be encrypting to a device the other
 * side never accepted. The pair of devices is recorded at the moment of the
 * acceptance, because that is the pair with a session — nobody else has one,
 * including other devices of the same two people.
 *
 * Only direct chats. A group under libsignal needs sender keys and a way to
 * re-key when the membership changes, and offering a half-built version of that
 * would be worse than saying it is not available yet.
 */
export async function proposePrivacy(
  chatId: string,
  userId: string,
  deviceId: string,
): Promise<ChatPrivacy> {
  const chat = await requireChat(chatId, userId);

  if (chat.type !== 'dm') {
    throw new AppError(ERROR.VALIDATION, 'Privacy mode is available in direct chats only', 400);
  }
  if (chat.e2eState === 'on') {
    throw new AppError(ERROR.CONFLICT, 'This chat is already in privacy mode', 409);
  }

  const updated = await repo.setPrivacy({
    chatId,
    state: 'proposed',
    proposedBy: userId,
    // The proposer's device is remembered now so the accepting side knows which
    // one to build a session with, rather than guessing among their devices.
    devices: [deviceId],
  });

  return announcePrivacy(updated ?? chat);
}

export async function acceptPrivacy(
  chatId: string,
  userId: string,
  deviceId: string,
): Promise<ChatPrivacy> {
  const chat = await requireChat(chatId, userId);

  if (chat.e2eState !== 'proposed') {
    throw new AppError(ERROR.CONFLICT, 'There is no open offer in this chat', 409);
  }
  // Accepting your own offer would turn a two-party agreement into a switch.
  if (chat.e2eProposedBy === userId) {
    throw new AppError(ERROR.FORBIDDEN, 'The other side has to accept', 403);
  }

  const proposer = chat.e2eDevices[0];
  if (!proposer) {
    throw new AppError(ERROR.CONFLICT, 'The offer lost its device; propose again', 409);
  }

  const updated = await repo.setPrivacy({
    chatId,
    state: 'on',
    proposedBy: chat.e2eProposedBy,
    devices: [proposer, deviceId],
  });

  return announcePrivacy(updated ?? chat);
}

/**
 * Called off, by either side and in either state.
 *
 * Leaving is always allowed and never needs the other side's agreement — the
 * opposite would be a mode you can be held in. Messages already sent stay
 * unreadable to the server; they were encrypted with a session that this does
 * not hand over.
 */
export async function cancelPrivacy(chatId: string, userId: string): Promise<ChatPrivacy> {
  const chat = await requireChat(chatId, userId);
  const updated = await repo.setPrivacy({
    chatId,
    state: 'off',
    proposedBy: null,
    devices: [],
  });

  return announcePrivacy(updated ?? chat);
}

export async function privacyOf(chatId: string, userId: string): Promise<ChatPrivacy> {
  const chat = await requireChat(chatId, userId);
  return {
    chatId: chat.id,
    state: chat.e2eState,
    proposedBy: chat.e2eProposedBy,
    devices: chat.e2eDevices,
  };
}

async function requireChat(chatId: string, userId: string): Promise<ChatRow> {
  await requireMembership(chatId, userId);
  const chat = await repo.findChatById(chatId);
  if (!chat) throw AppError.notFound('Chat not found');
  return chat;
}

async function announcePrivacy(chat: ChatRow): Promise<ChatPrivacy> {
  const privacy: ChatPrivacy = {
    chatId: chat.id,
    state: chat.e2eState,
    proposedBy: chat.e2eProposedBy,
    devices: chat.e2eDevices,
  };

  const members = await repo.memberIds(chat.id);
  await hub.publish(members, { type: 'chat.privacy', payload: privacy });
  return privacy;
}

export async function sendMessage(
  chatId: string,
  senderId: string,
  input: {
    clientMsgId: string;
    kind: string;
    body: string;
    replyTo?: string;
    scheduledAt?: string;
    attachmentIds?: string[];
    forwardFrom?: string;
    envelope?: Envelope;
  },
): Promise<{ message: Message; created: boolean }> {
  await requireMembership(chatId, senderId);

  // Hard rule 6: a retried send returns the row it already created.
  const existing = await repo.findByClientMsgId(chatId, senderId, input.clientMsgId);
  if (existing) {
    return { message: (await decorate([existing], senderId))[0]!, created: false };
  }

  const attachmentIds = input.attachmentIds ?? [];
  let body = input.body;
  let forwardedFrom: string | null = null;

  // Forwarding copies the text rather than referencing it, so the message stays
  // readable after the original is deleted or its chat becomes unreachable.
  if (input.forwardFrom) {
    const source = await repo.findMessageById(input.forwardFrom);
    if (!source || source.deletedAt) {
      throw new AppError(ERROR.VALIDATION, 'The forwarded message no longer exists', 400);
    }

    // Only from a chat the sender belongs to — otherwise forwarding would be a
    // way to read messages you were never shown.
    if (!(await repo.findMembership(source.chatId, senderId))) {
      throw new AppError(ERROR.VALIDATION, 'The forwarded message is not available', 400);
    }

    body = source.body;
    forwardedFrom = source.id;
  }

  /**
   * A chat under the privacy mode carries ciphertext and nothing else.
   *
   * Both directions of this are enforced, and both matter. Plaintext accepted
   * into an E2E chat would be stored and indexed exactly like any other message
   * — the mode would be a label rather than a property. An envelope accepted
   * into an ordinary chat would be a message nobody in that chat can read.
   */
  const chat = await repo.findChatById(chatId);
  if (!chat) throw AppError.notFound('Chat not found');

  const envelope = input.envelope ?? null;

  if (chat.e2eState === 'on') {
    if (!envelope) {
      throw new AppError(ERROR.VALIDATION, 'This chat is in privacy mode: send an envelope', 400);
    }
    if (body.trim() || attachmentIds.length > 0 || forwardedFrom) {
      throw new AppError(
        ERROR.VALIDATION,
        'A message in privacy mode carries the envelope alone',
        400,
      );
    }
    if (!chat.e2eDevices.includes(envelope.fromDeviceId)) {
      throw new AppError(ERROR.FORBIDDEN, 'This device is not part of the privacy session', 403);
    }
    // The text lives in the envelope; the column stays empty so nothing indexes
    // it and nothing shows it to a client that cannot open it.
    body = '';
  } else if (envelope) {
    throw new AppError(ERROR.VALIDATION, 'This chat is not in privacy mode', 400);
  } else if (!body.trim() && attachmentIds.length === 0 && !forwardedFrom) {
    // A message with neither text nor a file is not worth a row.
    throw new AppError(ERROR.VALIDATION, 'Message needs a body or an attachment', 400);
  }

  if (body.length > LIMITS.messageLength) {
    throw new AppError(ERROR.VALIDATION, 'Message is too long', 400, {
      max: LIMITS.messageLength,
    });
  }

  if (input.replyTo) {
    const target = await repo.findMessageById(input.replyTo);
    if (!target || target.chatId !== chatId) {
      throw new AppError(ERROR.VALIDATION, 'Reply target is not in this chat', 400);
    }
  }

  const row = await repo.insertMessage({
    chatId,
    senderId,
    clientMsgId: input.clientMsgId,
    kind: input.kind,
    body,
    replyTo: input.replyTo ?? null,
    forwardedFrom,
    scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
    envelope,
  });

  // Claiming after the insert keeps the ownership check in one place; a
  // rejected claim leaves the message without files rather than half-created.
  await media.claimForMessage(attachmentIds, senderId, row.id);
  await repo.touchChat(chatId);

  const message = toMessage(row);
  if (attachmentIds.length > 0) {
    message.meta = { ...message.meta, attachments: await media.attachmentsOf(row.id) };
  }

  // A message with a future time is not sent yet — announcing it now would
  // deliver it immediately and make scheduling a decoration. The job picks it
  // up when its moment arrives; until then only the author can see it.
  if (row.scheduledAt && row.scheduledAt.getTime() > Date.now()) {
    return { message, created: true };
  }

  // The sender already has the message from the HTTP response; everyone else
  // learns about it here. A client that was offline catches up via GET /sync.
  await hub.publish(await repo.memberIds(chatId), { type: 'message.new', payload: message });

  return { message, created: true };
}

export async function editMessage(
  messageId: string,
  userId: string,
  body: string,
): Promise<Message> {
  const row = await repo.findMessageById(messageId);
  if (!row || row.deletedAt) throw AppError.notFound('Message not found');

  await requireMembership(row.chatId, userId);

  // Editing is the author's alone — moderators may delete, never rewrite.
  if (row.senderId !== userId) throw AppError.forbidden('Only the author can edit a message');

  if (body.length > LIMITS.messageLength) {
    throw new AppError(ERROR.VALIDATION, 'Message is too long', 400, {
      max: LIMITS.messageLength,
    });
  }

  const updated = await repo.editMessage(messageId, body);
  if (!updated) throw AppError.notFound('Message not found');

  const message = (await decorate([updated], userId))[0]!;
  await hub.publish(await repo.memberIds(row.chatId), { type: 'message.edit', payload: message });

  return message;
}

export async function deleteMessage(messageId: string, userId: string): Promise<string> {
  const row = await repo.findMessageById(messageId);
  if (!row || row.deletedAt) throw AppError.notFound('Message not found');

  const membership = await requireMembership(row.chatId, userId);
  const isAuthor = row.senderId === userId;

  if (!isAuthor && !MANAGER_ROLES.has(membership.role)) {
    throw AppError.forbidden('Only the author or a moderator can delete a message');
  }

  await repo.softDeleteMessage(messageId);
  await hub.publish(await repo.memberIds(row.chatId), {
    type: 'message.delete',
    payload: { chatId: row.chatId, messageId },
  });

  return row.chatId;
}

/** Toggling: reacting twice with the same emoji removes the reaction. */
export async function toggleReaction(
  messageId: string,
  userId: string,
  emoji: string,
): Promise<Message> {
  const row = await repo.findMessageById(messageId);
  if (!row || row.deletedAt) throw AppError.notFound('Message not found');

  await requireMembership(row.chatId, userId);

  if (await repo.hasReaction(messageId, userId, emoji)) {
    await repo.removeReaction(messageId, userId, emoji);
  } else {
    await repo.addReaction(messageId, userId, emoji);
  }

  const message = (await decorate([row], userId))[0]!;
  const total = Object.values(message.reactions).reduce((sum, r) => sum + r.count, 0);
  await hub.publish(await repo.memberIds(row.chatId), {
    type: 'message.reaction',
    payload: { messageId, emoji, count: total },
  });

  return message;
}

/**
 * Pins or unpins one message, or — with no message — clears the chat's pins.
 *
 * A chat holds several pins and the header bar steps through them, so pinning a
 * second message no longer replaces the first. Unpinning names the message it
 * removes: "unpin" used to mean "throw away every pin", which was invisible
 * while only one could exist and destructive the moment more could.
 */
export async function pinMessage(
  chatId: string,
  userId: string,
  messageId: string | null,
  pinned = true,
): Promise<void> {
  const membership = await requireMembership(chatId, userId);

  const chat = await repo.findChatById(chatId);
  if (!chat) throw AppError.notFound('Chat not found');

  // Direct chats have no hierarchy, so either side may pin.
  if (chat.type !== 'dm' && !MANAGER_ROLES.has(membership.role)) {
    throw AppError.forbidden('Only a moderator can pin messages here');
  }

  if (!messageId) {
    await repo.clearPins(chatId);
    return;
  }

  const target = await repo.findMessageById(messageId);
  if (!target || target.chatId !== chatId) {
    throw new AppError(ERROR.VALIDATION, 'Message is not in this chat', 400);
  }

  if (pinned) await repo.addPin(chatId, messageId, userId);
  else await repo.removePin(chatId, messageId);
}

export async function markRead(
  chatId: string,
  userId: string,
  messageId: string,
): Promise<void> {
  await requireMembership(chatId, userId);

  const target = await repo.findMessageById(messageId);
  if (!target || target.chatId !== chatId) {
    throw new AppError(ERROR.VALIDATION, 'Message is not in this chat', 400);
  }

  await repo.markRead(chatId, userId, messageId);
}

export async function saveDraft(
  chatId: string,
  userId: string,
  draft: string | null,
): Promise<void> {
  await requireMembership(chatId, userId);
  await repo.setDraft(chatId, userId, draft);
}

export async function setPlacement(
  chatId: string,
  userId: string,
  patch: { folder?: string | null; isLater?: boolean },
): Promise<void> {
  await requireMembership(chatId, userId);
  await repo.setPlacement(chatId, userId, patch);
}

/**
 * Everything the caller missed. Hard rule 8: a reconnecting client must be able
 * to catch up over REST without relying on the socket.
 */
export async function sync(userId: string, since: string | undefined): Promise<SyncResponse> {
  const cursor = since ? decodeCursor(since) : null;
  if (since && !cursor) throw new AppError(ERROR.VALIDATION, 'Malformed cursor', 400);

  const rows = await repo.messagesSince(userId, cursor, LIMITS.maxPageSize);
  const last = rows.at(-1);

  return {
    messages: await decorate(rows, userId),
    reads: await repo.readsFor(userId),
    cursor: last ? encodeCursor(last.id) : (since ?? ''),
  };
}
