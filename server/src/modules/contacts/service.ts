import { ERROR, type Contact } from '@bmf/shared';
import { AppError } from '../../lib/errors.js';
import * as authRepo from '../auth/repo.js';
import * as repo from './repo.js';
import { toContact } from './types.js';

export async function list(ownerId: string): Promise<Contact[]> {
  return (await repo.list(ownerId)).map(toContact);
}

/**
 * Adds somebody, or renames them.
 *
 * The name is private to whoever wrote it and never travels back to the person
 * described — that is the whole point of the feature, and the reason it is a
 * column on the contact rather than anywhere near the profile.
 */
export async function save(
  ownerId: string,
  userId: string,
  localName: string | null,
): Promise<Contact> {
  if (ownerId === userId) {
    throw new AppError(ERROR.VALIDATION, 'Cannot add yourself as a contact', 400);
  }

  const person = await authRepo.findUserById(userId);
  if (!person || person.deletedAt) throw AppError.notFound('User not found');

  // An empty name is no name: storing "" would leave the interface choosing
  // between a blank label and falling back, and it would have to fall back.
  const trimmed = localName?.trim() ?? null;
  await repo.upsert(ownerId, userId, trimmed || null);

  const saved = await repo.findOne(ownerId, userId);
  if (!saved) throw AppError.notFound('Contact not found');

  return toContact(saved);
}

export async function remove(ownerId: string, userId: string): Promise<void> {
  await repo.remove(ownerId, userId);
}
