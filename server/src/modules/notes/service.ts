import type { Note, Page } from '@bmf/shared';
import { ERROR } from '@bmf/shared';
import { AppError } from '../../lib/errors.js';
import * as repo from './repo.js';
import type { NoteRow } from './types.js';

/**
 * Notes belong to exactly one person and are never shared.
 *
 * That makes the whole module one rule repeated: every read and every write
 * confirms the note is the caller's own first. A note is the one thing here a
 * user writes for themselves, and leaking one would be worse than leaking a
 * message they at least chose to send to somebody.
 */

const MAX_TITLE = 200;
const MAX_BODY = 100_000;

function toNote(row: NoteRow): Note {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    folder: row.folder,
    pinned: row.pinned,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function own(id: string, userId: string): Promise<NoteRow> {
  const row = await repo.findNote(id);
  // 404 rather than 403: somebody else's note is not theirs to learn about.
  if (!row || row.userId !== userId) throw AppError.notFound('Note not found');
  return row;
}

function checkSize(title: string | undefined, body: string | undefined): void {
  if (title !== undefined && title.length > MAX_TITLE) {
    throw new AppError(ERROR.VALIDATION, 'Title is too long', 400, { max: MAX_TITLE });
  }
  if (body !== undefined && body.length > MAX_BODY) {
    throw new AppError(ERROR.VALIDATION, 'Note is too long', 400, { max: MAX_BODY });
  }
}

export async function create(
  userId: string,
  input: { title?: string; body?: string; folder?: string | null },
): Promise<Note> {
  checkSize(input.title, input.body);

  const row = await repo.insertNote({
    userId,
    title: input.title ?? '',
    body: input.body ?? '',
    folder: input.folder ?? null,
  });
  return toNote(row);
}

export async function list(input: {
  userId: string;
  before: string | null;
  limit: number;
  folder: string | null;
}): Promise<Page<Note>> {
  // One more than asked, so "is there another page" is answered by the query
  // rather than guessed from the count.
  const rows = await repo.pageNotes({ ...input, limit: input.limit + 1 });
  const page = rows.slice(0, input.limit);
  const last = page.at(-1);

  return {
    items: page.map(toNote),
    nextCursor: rows.length > input.limit && last ? last.id : null,
  };
}

export async function folders(userId: string): Promise<{ folder: string; count: number }[]> {
  const rows = await repo.foldersOf(userId);
  return rows.map((row) => ({ folder: row.folder, count: Number(row.count) }));
}

export async function get(id: string, userId: string): Promise<Note> {
  return toNote(await own(id, userId));
}

export async function update(
  id: string,
  userId: string,
  patch: { title?: string; body?: string; folder?: string | null; pinned?: boolean },
): Promise<Note> {
  await own(id, userId);
  checkSize(patch.title, patch.body);

  const row = await repo.updateNote(id, patch);
  if (!row) throw AppError.notFound('Note not found');
  return toNote(row);
}

export async function remove(id: string, userId: string): Promise<void> {
  await own(id, userId);
  await repo.deleteNote(id);
}

export async function search(userId: string, query: string, limit: number): Promise<Note[]> {
  const rows = await repo.searchNotes(userId, query, limit);
  return rows.map(toNote);
}
