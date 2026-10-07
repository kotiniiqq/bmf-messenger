/**
 * A note: private to its author, never shared and never part of a chat.
 *
 * The body is plain text with the light markup the prototype's editor describes
 * — `#` headings, `**bold**`, `-` lists, `- [ ]` checkboxes. It is stored as
 * typed and rendered on the client, so nothing here needs to know about it.
 */
export interface Note {
  id: string;
  title: string;
  body: string;
  /** A label the user types; empty means the note sits outside any folder. */
  folder: string | null;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}
