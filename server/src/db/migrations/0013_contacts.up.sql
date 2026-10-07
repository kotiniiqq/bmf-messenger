-- Contacts, and the private name their owner gave them.
--
-- The name is strictly one-way: it belongs to whoever wrote it and is never
-- shown to the person it describes, which is why it lives on the contact row
-- rather than anywhere near the profile. Calling somebody "мама" or "Игорь с
-- работы" is a note to yourself.
create table contacts (
  owner_id   uuid not null references users(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  local_name text,
  created_at timestamptz not null default now(),
  primary key (owner_id, user_id),
  -- A contact entry for yourself would mean renaming your own account from a
  -- screen that promises the opposite.
  constraint contacts_not_self check (owner_id <> user_id)
);

-- The list is always read by owner, newest first.
create index contacts_owner_idx on contacts (owner_id, created_at desc);
