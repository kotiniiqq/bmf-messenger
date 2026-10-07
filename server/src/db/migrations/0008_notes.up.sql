-- Notes: private to their author, never shared, never in a chat.
-- Reversed by 0008_notes.down.sql.

create table notes (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references users(id) on delete cascade,
  title      text not null default '',
  body       text not null default '',
  -- Free text rather than a table: the prototype's folders are a label the user
  -- types, and a join table would make renaming one a migration.
  folder     text,
  pinned     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- The list is "mine, newest first", paged by cursor — this is the index that
-- serves it without a sort.
create index notes_user_idx on notes (user_id, updated_at desc, id desc)
  where deleted_at is null;

-- Search across one person's notes. Russian, like the message search.
create index notes_search_idx on notes
  using gin (to_tsvector('russian', title || ' ' || body));
