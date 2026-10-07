-- Calls and who took part in them. Reversed by 0005_calls.down.sql.

create table calls (
  id         uuid primary key default uuid_generate_v4(),
  chat_id    uuid not null references chats(id) on delete cascade,
  started_by uuid references users(id) on delete set null,
  kind       text not null default 'audio' check (kind in ('audio', 'video')),
  -- The LiveKit room name. Derived from the id rather than the chat, so a second
  -- call in the same chat never lands in a room the first one is still using.
  room       text not null unique,
  started_at timestamptz not null default now(),
  ended_at   timestamptz,
  -- Why it stopped, for the history screen: a call nobody answered has to read
  -- differently from one that was hung up.
  end_reason text check (end_reason in ('hangup', 'declined', 'missed', 'failed'))
);

-- At most one live call per chat. A partial unique index rather than a check,
-- because the constraint is about the rows that have not ended yet.
create unique index calls_one_active_per_chat on calls (chat_id) where ended_at is null;

create index calls_chat_started_idx on calls (chat_id, started_at desc);

create table call_participants (
  call_id   uuid not null references calls(id) on delete cascade,
  user_id   uuid not null references users(id) on delete cascade,
  joined_at timestamptz,
  left_at   timestamptz,
  -- Set when the call reaches them, so a second device does not re-ring.
  invited_at timestamptz not null default now(),
  primary key (call_id, user_id)
);

create index call_participants_user_idx on call_participants (user_id);
