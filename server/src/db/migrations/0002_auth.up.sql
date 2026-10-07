-- Authentication support: case-insensitive identities, device session details
-- and an audit trail. Reversed by 0002_auth.down.sql.

-- Usernames and emails are compared case-insensitively. The columns keep the
-- casing the user typed so it can be displayed back to them.
alter table users drop constraint if exists users_username_key;
alter table users drop constraint if exists users_email_key;
drop index if exists users_username_key;
drop index if exists users_email_key;

create unique index users_username_lower_idx on users (lower(username));
create unique index users_email_lower_idx on users (lower(email));

-- Always null during the beta: port 25 is blocked, so no verification mail
-- can be sent. The column exists so enabling it later is not a schema change.
alter table users add column email_verified_at timestamptz;

alter table devices
  add column created_at              timestamptz not null default now(),
  add column last_ip                 inet,
  add column last_city               text,
  add column prev_refresh_token_hash text,
  add column refresh_rotated_at      timestamptz,
  add column refresh_expires_at      timestamptz;

-- Keep the platform list in step with the Device type in shared/src/models/user.ts.
alter table devices add constraint devices_platform_check
  check (platform in ('windows', 'linux', 'macos', 'android', 'ios'));

-- Refresh tokens are looked up by hash on every /auth/refresh call.
create index devices_refresh_hash_idx on devices (refresh_token_hash) where revoked_at is null;
create index devices_prev_refresh_hash_idx on devices (prev_refresh_token_hash)
  where prev_refresh_token_hash is not null;

create table audit_log (
  id         uuid primary key default uuid_generate_v4(),
  actor_id   uuid references users(id) on delete set null,
  action     text not null,
  target     text,
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_actor_idx on audit_log (actor_id, created_at desc);
-- Retention is bounded (spec section 10); the cleanup job scans by age.
create index audit_log_created_idx on audit_log (created_at);
