import { sql } from '../../db/client.js';

export interface AttachmentRow {
  id: string;
  messageId: string | null;
  bucketKey: string;
  name: string;
  mime: string;
  size: string;
  width: number | null;
  height: number | null;
  duration: number | null;
  createdAt: Date;
}

export async function insertAttachment(input: {
  bucketKey: string;
  name: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
}): Promise<AttachmentRow> {
  const rows = await sql<AttachmentRow[]>`
    insert into attachments (message_id, bucket_key, name, mime, size, width, height)
    values (
      null, ${input.bucketKey}, ${input.name}, ${input.mime},
      ${input.size}, ${input.width}, ${input.height}
    )
    returning *`;
  const row = rows[0];
  if (!row) throw new Error('Attachment insert returned no row');
  return row;
}

export async function findById(id: string): Promise<AttachmentRow | null> {
  const rows = await sql<AttachmentRow[]>`select * from attachments where id = ${id} limit 1`;
  return rows[0] ?? null;
}

export async function findByIds(ids: string[]): Promise<AttachmentRow[]> {
  if (ids.length === 0) return [];
  return sql<AttachmentRow[]>`select * from attachments where id = any(${ids}::uuid[])`;
}

export async function findByMessage(messageId: string): Promise<AttachmentRow[]> {
  return sql<AttachmentRow[]>`
    select * from attachments where message_id = ${messageId} order by created_at`;
}

/**
 * Pictures posted in a chat, newest first — the tiles on a profile screen.
 *
 * `after` is the clearing mark of the member asking, so somebody who deleted
 * the chat does not get its gallery back. Paged by created_at, like everything
 * else that walks a chat.
 */
export async function imagesInChat(input: {
  chatId: string;
  after: Date | null;
  before: string | null;
  limit: number;
}): Promise<AttachmentRow[]> {
  return sql<AttachmentRow[]>`
    select a.* from attachments a
    join messages m on m.id = a.message_id
    where m.chat_id = ${input.chatId}
      and m.deleted_at is null
      and m.scheduled_at is null
      and a.mime like 'image/%'
      and m.created_at > coalesce(${input.after}::timestamptz, '-infinity'::timestamptz)
      ${
        input.before
          ? sql`and (a.created_at, a.id) < (
              select created_at, id from attachments where id = ${input.before}
            )`
          : sql``
      }
    order by a.created_at desc, a.id desc
    limit ${input.limit}`;
}

/** Binds orphan uploads to the message that finally referenced them. */
export async function attachToMessage(ids: string[], messageId: string): Promise<void> {
  if (ids.length === 0) return;
  await sql`
    update attachments set message_id = ${messageId}
    where id = any(${ids}::uuid[]) and message_id is null`;
}

/**
 * Uploads that were never attached to a message. A client that crashes between
 * uploading and sending would otherwise leave the object paid for and unreachable.
 */
export async function findStaleOrphans(olderThanHours: number): Promise<AttachmentRow[]> {
  return sql<AttachmentRow[]>`
    select * from attachments
    where message_id is null
      and created_at < now() - ${`${olderThanHours} hours`}::interval`;
}

export async function deleteById(id: string): Promise<void> {
  await sql`delete from attachments where id = ${id}`;
}
