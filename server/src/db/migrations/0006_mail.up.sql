-- Mail: external mailboxes connected over IMAP, and the messages read from them.
-- Reversed by 0006_mail.down.sql.

create table mail_accounts (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references users(id) on delete cascade,
  -- What the person sees in the account switcher.
  label       text not null default '',
  address     text not null,
  kind        text not null default 'imap' check (kind in ('imap', 'bmf')),

  imap_host   text,
  imap_port   integer not null default 993,
  imap_secure boolean not null default true,
  -- Encrypted with MAIL_SECRET (AES-256-GCM), never stored or logged in the
  -- clear. For Gmail this holds an app password, not the account password.
  secret      bytea,

  -- Set while a sync is running, so two workers do not fetch the same mailbox.
  syncing_at  timestamptz,
  synced_at   timestamptz,
  -- Last error text shown to the owner: a mailbox that stopped working has to
  -- say why rather than silently going quiet.
  last_error  text,

  created_at  timestamptz not null default now(),
  unique (user_id, address)
);

create index mail_accounts_user_idx on mail_accounts (user_id);

create table mail_messages (
  id          uuid primary key default uuid_generate_v4(),
  account_id  uuid not null references mail_accounts(id) on delete cascade,
  -- IMAP's own identity for the message. Together with the folder it is what
  -- makes a repeated sync update rather than duplicate (hard rule 6).
  uid         bigint not null,
  folder      text not null default 'INBOX',

  message_id  text,
  from_name   text not null default '',
  from_addr   text not null default '',
  to_addrs    text[] not null default '{}',
  subject     text not null default '',
  -- Enough to draw the list without fetching bodies for everything.
  preview     text not null default '',
  body_text   text,
  body_html   text,

  sent_at     timestamptz,
  received_at timestamptz not null default now(),
  is_read     boolean not null default false,
  is_flagged  boolean not null default false,
  has_files   boolean not null default false,

  unique (account_id, folder, uid)
);

-- The list is drawn newest first, per account and folder.
create index mail_messages_list_idx on mail_messages (account_id, folder, received_at desc);
create index mail_messages_unread_idx on mail_messages (account_id) where is_read = false;
