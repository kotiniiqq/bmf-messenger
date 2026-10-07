-- Deleting a chat is per member, not per chat: one side removing a conversation
-- must not reach into the other side's copy of it.
--
-- For a direct chat that means marking where this member's view starts rather
-- than deleting rows. Removing their membership instead would leave the other
-- person writing into a chat with one participant, and their messages would
-- have nowhere to arrive.
alter table chat_members add column cleared_at timestamptz;

-- The chat list and the history both filter on it, always alongside the member
-- row they already look up, so it rides on the existing primary key.
comment on column chat_members.cleared_at is
  'Messages older than this are invisible to this member; null means the whole history.';
