import { sql } from '../../db/client.js';
import type { NoteRow } from './types.js';

/** The only file in the notes module allowed to speak SQL (CONTRIBUTING.md layout rules). */

export async function insertNote(input: {
  userId: string;
  title: string;
  body: string;
  folder: string | null;
}): Promise<NoteRow> {
  const rows = await sql<NoteRow[]>`
    insert into notes (user_id, title, body, folder)
    values (${input.userId}, ${input.title}, ${input.body}, ${input.folder})
    returning *`;
  const row = rows[0];
  if (!row) throw new Error('Note insert returned no row');
  return row;
}

export async function findNote(id: string): Promise<NoteRow | null> {
  const rows = await sql<NoteRow[]>`
    select * from notes where id = ${id} and deleted_at is null limit 1`;
  return rows[0] ?? null;
}

/**
 * One page, pinned first and newest after, keyed on a cursor rather than an
 * offset (hard rule 7). The pinned ones lead because that is what pinning is
 * for; within each group the sort is the one the index already provides.
 */
export async function pageNotes(input: {
  userId: string;
  before: string | null;
  limit: number;
  folder: string | null;
}): Promise<NoteRow[]> {
  const cursor = input.before
    ? sql`and (n.pinned, n.updated_at, n.id) <
          (select pinned, updated_at, id from notes where id = ${input.before})`
    : sql``;

  const folder = input.folder ? sql`and n.folder = ${input.folder}` : sql``;

  return sql<NoteRow[]>`
    select n.* from notes n
    where n.user_id = ${input.userId} and n.deleted_at is null
      ${folder}
      ${cursor}
    order by n.pinned desc, n.updated_at desc, n.id desc
    limit ${input.limit}`;
}

/** Every folder the user has actually used, with how many notes are in it. */
export async function foldersOf(userId: string): Promise<{ folder: string; count: string }[]> {
  return sql<{ folder: string; count: string }[]>`
    select folder, count(*) as count from notes
     where user_id = ${userId} and deleted_at is null and folder is not null
     group by folder
     order by folder`;
}

export async function updateNote(
  id: string,
  patch: { title?: string; body?: string; folder?: string | null; pinned?: boolean },
): Promise<NoteRow | null> {
  const rows = await sql<NoteRow[]>`
    update notes set
      title      = coalesce(${patch.title ?? null}, title),
      body       = coalesce(${patch.body ?? null}, body),
      -- Folder is nullable on purpose, so "move out of every folder" has to be
      -- expressible: an explicit null in the patch clears it.
      folder     = ${patch.folder === undefined ? sql`folder` : sql`${patch.folder}`},
      pinned     = coalesce(${patch.pinned ?? null}, pinned),
      updated_at = now()
    where id = ${id} and deleted_at is null
    returning *`;
  return rows[0] ?? null;
}

/** Soft delete: the row stays so a mistaken tap is survivable for now. */
export async function deleteNote(id: string): Promise<void> {
  await sql`update notes set deleted_at = now() where id = ${id}`;
}

export async function searchNotes(
  userId: string,
  query: string,
  limit: number,
): Promise<NoteRow[]> {
  return sql<NoteRow[]>`
    select * from notes
     where user_id = ${userId} and deleted_at is null
       and to_tsvector('russian', title || ' ' || body)
           @@ websearch_to_tsquery('russian', ${query})
     order by updated_at desc
     limit ${limit}`;
}
