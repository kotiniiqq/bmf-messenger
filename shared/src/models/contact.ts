import type { User } from './user.js';

/**
 * Somebody in your contacts, and what you decided to call them.
 *
 * `localName` belongs to whoever wrote it and is never shown to the person it
 * describes — writing "Игорь с работы" is a note to yourself, not a rename of
 * their account. It is stored against the contact for the same reason: the
 * profile is theirs, the label is yours.
 */
export interface Contact {
  user: User;
  localName: string | null;
  addedAt: string;
}
