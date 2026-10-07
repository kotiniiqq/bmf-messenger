import type { ChatListItem, Contact, User } from '@bmf/shared';

/**
 * What this account calls other people.
 *
 * A local name is worth having only if it appears everywhere the person does —
 * a chat list that says "Игорь с работы" and a message header that says
 * "@igor2011" is two names for one человек. So every screen that draws somebody
 * goes through here, and the rule is one line: your name for them wins, then
 * theirs, then the handle they signed up with.
 */
export function nameFor(
  user: Pick<User, 'id' | 'displayName' | 'username'>,
  contacts: Record<string, Contact>,
): string {
  return contacts[user.id]?.localName?.trim() || user.displayName || user.username;
}

/** The same question for a chat: only a direct one is named after a person. */
export function titleFor(chat: ChatListItem, contacts: Record<string, Contact>): string {
  if (chat.type === 'dm' && chat.peerId) {
    const local = contacts[chat.peerId]?.localName?.trim();
    if (local) return local;
  }

  return chat.title;
}
