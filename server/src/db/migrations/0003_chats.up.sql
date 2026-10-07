-- Chats, messages and everything hanging off a message. Reversed by 0003_chats.down.sql.

create table chats (
  id         uuid primary key default uuid_generate_v4(),
  type       text not null check (type in ('dm', 'group', 'channel', 'saved', 'ai')),
  title      text not null default '',
  avatar_url text,
  accent     text,
  is_e2e     boolean not null default false,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table chat_members (
  chat_id     uuid not null references chats(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  role        text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at   timestamptz not null default now(),
  muted_until timestamptz,
  folder      text,
  is_later    boolean not null default false,
  draft       text,
  primary key (chat_id, user_id)
);

create index chat_members_user_idx on chat_members (user_id);

create table messages (
  id             uuid primary key default uuid_generate_v4(),
  chat_id        uuid not null references chats(id) on delete cascade,
  sender_id      uuid references users(id) on delete set null,
  client_msg_id  uuid not null,
  kind           text not null default 'text'
                 check (kind in ('text','voice','sticker','gif','file','image','track',
                                 'mail_card','system')),
  body           text not null default '',
  meta           jsonb not null default '{}'::jsonb,
  reply_to       uuid references messages(id) on delete set null,
  forwarded_from uuid references messages(id) on delete set null,
  edited_at      timestamptz,
  scheduled_at   timestamptz,
  created_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

-- History pages are read newest-first within a chat (spec section 5).
create index messages_chat_created_idx on messages (chat_id, created_at desc, id desc);

-- Idempotency: a retried send must return the existing row, never a duplicate
-- (hard rule 6). Scoped per chat and sender so two clients cannot collide.
create unique index messages_client_msg_idx on messages (chat_id, sender_id, client_msg_id);

-- Full-text search over message bodies (spec section 5). Russian first: the UI
-- is Russian, and the simple configuration would not stem it.
create index messages_body_fts_idx on messages
  using gin (to_tsvector('russian', body));

create table message_reactions (
  message_id uuid not null references messages(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  emoji      text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create table message_reads (
  chat_id              uuid not null references chats(id) on delete cascade,
  user_id              uuid not null references users(id) on delete cascade,
  last_read_message_id uuid references messages(id) on delete set null,
  updated_at           timestamptz not null default now(),
  primary key (chat_id, user_id)
);

create table pinned_messages (
  chat_id    uuid not null references chats(id) on delete cascade,
  message_id uuid not null references messages(id) on delete cascade,
  pinned_by  uuid references users(id) on delete set null,
  pinned_at  timestamptz not null default now(),
  primary key (chat_id, message_id)
);

create table attachments (
  id         uuid primary key default uuid_generate_v4(),
  message_id uuid not null references messages(id) on delete cascade,
  bucket_key text not null,
  mime       text not null,
  size       bigint not null,
  width      integer,
  height     integer,
  duration   integer,
  created_at timestamptz not null default now()
);

create index attachments_message_idx on attachments (message_id);
