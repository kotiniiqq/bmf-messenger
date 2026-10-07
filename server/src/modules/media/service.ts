import type { Readable } from 'node:stream';
import { ERROR, LIMITS, type Attachment } from '@bmf/shared';
import { AppError } from '../../lib/errors.js';
import { buildKey, deleteObject, getObject, putObject } from '../../lib/storage.js';
import * as chatRepo from '../chats/repo.js';
import * as userRepo from '../users/repo.js';
import * as repo from './repo.js';

/** What an upload answers with, and what a message carries in `meta.attachments`. */
export type UploadedFile = Attachment;

/**
 * What the client is allowed to send. An allowlist rather than a blocklist:
 * anything not named here is refused, so a new dangerous type is refused by
 * default instead of after someone notices.
 */
const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'audio/ogg',
  'audio/mpeg',
  'audio/wav',
  'video/mp4',
  'video/webm',
  'application/pdf',
  'text/plain',
  'application/zip',
  'application/octet-stream',
]);

/**
 * Reads intrinsic dimensions straight from the file header. Only the formats
 * whose headers are trivial to parse — a full image library is not worth the
 * dependency when the value is only used to size a placeholder in the UI.
 */
export function readImageSize(
  buffer: Buffer,
  mime: string,
): { width: number; height: number } | null {
  try {
    if (mime === 'image/png' && buffer.length > 24) {
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }

    if (mime === 'image/gif' && buffer.length > 10) {
      return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
    }

    if (mime === 'image/jpeg') {
      let offset = 2;
      while (offset + 9 < buffer.length) {
        if (buffer[offset] !== 0xff) break;
        const marker = buffer[offset + 1]!;
        const length = buffer.readUInt16BE(offset + 2);

        // SOF0..SOF3 and SOF5..SOF15 carry the frame dimensions.
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8) {
          return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
        }

        offset += 2 + length;
      }
    }
  } catch {
    // A malformed header is not a reason to reject the upload.
  }

  return null;
}

export async function upload(input: {
  userId: string;
  filename: string;
  mime: string;
  body: Buffer;
}): Promise<UploadedFile> {
  if (input.body.length === 0) {
    throw new AppError(ERROR.VALIDATION, 'File is empty', 400);
  }

  if (input.body.length > LIMITS.attachmentSizeBytes) {
    throw new AppError(ERROR.VALIDATION, 'File is too large', 400, {
      max: LIMITS.attachmentSizeBytes,
    });
  }

  if (!ALLOWED_MIME.has(input.mime)) {
    throw new AppError(ERROR.VALIDATION, 'This file type is not accepted', 400, {
      mime: input.mime,
    });
  }

  const key = buildKey(input.userId, input.filename);
  await putObject({ key, body: input.body, contentType: input.mime });

  const size = readImageSize(input.body, input.mime);
  const row = await repo.insertAttachment({
    bucketKey: key,
    name: displayName(input.filename),
    mime: input.mime,
    size: input.body.length,
    width: size?.width ?? null,
    height: size?.height ?? null,
  });

  return toAttachment(row);
}

/**
 * The name as it will be shown, not as it will be stored.
 *
 * Directories and control characters are dropped, because this string ends up
 * in a `Content-Disposition` header and in a save dialog. The rest is left
 * alone, so a file named in Russian arrives named in Russian.
 */
function displayName(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  const printable = [...base].filter((ch) => ch !== '"' && ch.codePointAt(0)! > 0x1f);
  return printable.join('').slice(0, 200) || 'file';
}

function toAttachment(row: {
  id: string;
  name: string;
  mime: string;
  size: string | number;
  width: number | null;
  height: number | null;
}): Attachment {
  return {
    id: row.id,
    name: row.name,
    mime: row.mime,
    size: Number(row.size),
    width: row.width,
    height: row.height,
  };
}

/**
 * Opens an attachment for someone who belongs to the chat it was posted in. An
 * upload nobody attached yet stays visible to its uploader alone, which is why
 * the key embeds the owner id.
 *
 * Answers with the bytes rather than a redirect to storage: see `getObject`.
 */
export async function download(
  attachmentId: string,
  userId: string,
): Promise<{ body: Readable; name: string; mime: string; size: number }> {
  const row = await repo.findById(attachmentId);
  if (!row) throw AppError.notFound('Attachment not found');

  // An avatar is meant to be seen by everyone the person talks to, so it is not
  // bound to a message and cannot be checked through one. Anyone signed in may
  // read it; that is what a profile picture is for.
  if (await userRepo.isAvatar(attachmentId)) {
    const object = await getObject(row.bucketKey);
    return { body: object.body, name: row.name, mime: row.mime, size: Number(row.size) };
  }

  // A group's picture belongs to the room rather than to a message in it, so
  // membership of that room is the check — not membership of a chat this
  // attachment was never posted in.
  const pictureOf = await chatRepo.chatWithAvatar(attachmentId);
  if (pictureOf) {
    if (!(await chatRepo.findMembership(pictureOf, userId))) {
      throw AppError.notFound('Attachment not found');
    }
    const object = await getObject(row.bucketKey);
    return { body: object.body, name: row.name, mime: row.mime, size: Number(row.size) };
  }

  if (row.messageId) {
    const message = await chatRepo.findMessageById(row.messageId);
    if (!message) throw AppError.notFound('Attachment not found');

    const membership = await chatRepo.findMembership(message.chatId, userId);
    if (!membership) throw AppError.notFound('Attachment not found');

    // Someone who deleted this chat gave up their copy of what is in it.
    if (membership.clearedAt && message.createdAt <= membership.clearedAt) {
      throw AppError.notFound('Attachment not found');
    }
  } else if (!row.bucketKey.startsWith(`u/${userId}/`)) {
    throw AppError.notFound('Attachment not found');
  }

  const object = await getObject(row.bucketKey);
  return {
    body: object.body,
    name: row.name,
    mime: row.mime,
    size: Number(row.size),
  };
}

/** Rejects ids that are already spoken for or belong to somebody else. */
export async function claimForMessage(
  attachmentIds: string[],
  userId: string,
  messageId: string,
): Promise<void> {
  if (attachmentIds.length === 0) return;

  if (attachmentIds.length > LIMITS.attachmentsPerMessage) {
    throw new AppError(ERROR.VALIDATION, 'Too many attachments', 400, {
      max: LIMITS.attachmentsPerMessage,
    });
  }

  const rows = await repo.findByIds(attachmentIds);
  if (rows.length !== attachmentIds.length) {
    throw new AppError(ERROR.VALIDATION, 'Unknown attachment', 400);
  }

  for (const row of rows) {
    if (row.messageId) {
      throw new AppError(ERROR.VALIDATION, 'Attachment already belongs to a message', 400);
    }
    if (!row.bucketKey.startsWith(`u/${userId}/`)) {
      throw new AppError(ERROR.VALIDATION, 'Unknown attachment', 400);
    }
  }

  await repo.attachToMessage(attachmentIds, messageId);
}

export async function attachmentsOf(messageId: string): Promise<UploadedFile[]> {
  return (await repo.findByMessage(messageId)).map(toAttachment);
}

/**
 * The pictures in a chat, for the gallery on a profile screen.
 *
 * Membership is checked here rather than in the router because the same check
 * decides what the caller may see: their own clearing mark bounds the gallery
 * exactly as it bounds the history.
 */
export async function imagesInChat(
  chatId: string,
  userId: string,
  options: { before?: string; limit?: number },
): Promise<{ items: Attachment[]; nextCursor: string | null }> {
  const membership = await chatRepo.findMembership(chatId, userId);
  if (!membership) throw AppError.notFound('Chat not found');

  const limit = Math.min(options.limit ?? 60, 100);
  const rows = await repo.imagesInChat({
    chatId,
    after: membership.clearedAt,
    before: options.before ?? null,
    limit: limit + 1,
  });

  const page = rows.slice(0, limit);
  return {
    items: page.map(toAttachment),
    nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
  };
}

/** Removes uploads nobody ever attached, object first so no key is orphaned. */
export async function pruneOrphans(olderThanHours = 24): Promise<number> {
  const orphans = await repo.findStaleOrphans(olderThanHours);

  for (const orphan of orphans) {
    await deleteObject(orphan.bucketKey).catch(() => undefined);
    await repo.deleteById(orphan.id);
  }

  return orphans.length;
}
