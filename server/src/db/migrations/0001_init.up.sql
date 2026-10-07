-- Stage 0: minimal schema so the app boots and CI has something to migrate against.
-- Every migration must be reversible and is never edited after merge.

create extension if not exists "uuid-ossp";
create extension if not exists pg_trgm;

create table users (
  id            uuid primary key default uuid_generate_v4(),
  username      text not null unique,
  email         text not null unique,
  password_hash text not null,
  display_name  text not null,
  avatar_url    text,
  status_id     text not null default 'on',
  status_text   text,
  status_auto   boolean not null default true,
  is_pro        boolean not null default false,
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create table devices (
  id                 uuid primary key default uuid_generate_v4(),
  user_id            uuid not null references users(id) on delete cascade,
  name               text not null,
  platform           text not null,
  refresh_token_hash text not null,
  last_seen_at       timestamptz not null default now(),
  revoked_at         timestamptz
);

create index devices_user_idx on devices(user_id) where revoked_at is null;

create table consents (
  user_id     uuid not null references users(id) on delete cascade,
  document    text not null,
  version     text not null,
  accepted_at timestamptz not null default now(),
  primary key (user_id, document, version)
);
