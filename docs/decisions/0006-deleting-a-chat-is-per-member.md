# 6. Deleting a chat is per member, and means two different things

Date: 2026-08-04

## Context

`BMF-SPEC.md` §6 lists the chat endpoints and has no way to remove a chat. The
prototype has a "Покинуть группу" button in the chat-info panel that raises a
toast and does nothing else. So the product has never decided what deleting a
chat means, and the first person to need it was a tester with a list of chats
they could not clean up.

The straightforward reading — remove the caller's `chat_members` row — is wrong
for a direct chat. Delivery is driven by membership: the other person is still
writing into that conversation, and once the row is gone their next message has
nowhere to arrive. They would be typing into a chat that silently no longer
reaches anyone, which is worse than not offering deletion at all.

The other tempting reading — delete the messages — would reach into somebody
else's history. Nothing else in this product does that, and a messenger where
one side can erase the other side's copy is a different product.

## Decision

One action, `DELETE /chats/:id`, that removes the chat **for the caller only**
and does one of two things depending on the chat:

- **Group or channel** — the membership row is deleted. That is leaving: no more
  messages arrive, the chat is gone from the list, and its history is refused
  with the same 404 as any chat the caller does not belong to. Messages already
  sent stay for everyone else; they were addressed to the room.
- **Direct chat, and saved messages** — the membership row stays and
  `chat_members.cleared_at` is stamped with the current time. Every read of
  `messages` on that member's behalf — history, the chat list, `GET /sync`,
  search — filters to what came after it. The chat leaves the list until the
  other side writes again, and comes back empty.

An owner who leaves a group hands it to the longest-standing admin, or to the
longest-standing member when there is no admin. The alternative — refusing to
let an owner out until they nominate a successor — is a dialog nobody finishes,
and a group with no owner has nobody who can moderate it and no way to recover.
When the last member leaves, the chat is soft-deleted.

## Consequences

"What is in this chat" no longer has one answer: it is always a question about a
particular member. Any new query over `messages` has to carry the viewer and
apply the same filter, or it becomes a way to read back deleted history — search
was already such a hole before this landed, and is covered by a test now.

Clearing is not recoverable, from anywhere, on purpose. The confirmation panel
says so before it happens, which is why deleting from the chat list is two
clicks rather than one.

`cleared_at` accumulates: a member who clears a chat repeatedly only ever moves
the mark forward. Nothing prunes the messages themselves, so a direct chat that
both sides cleared still holds its rows. That is a storage question for the day
the 60 GB disk gets tight, not a correctness one, and deleting an account still
removes everything it touched.
