-- Reverses 0002_auth.up.sql.

drop table if exists audit_log;

drop index if exists devices_prev_refresh_hash_idx;
drop index if exists devices_refresh_hash_idx;
alter table devices drop constraint if exists devices_platform_check;

alter table devices
  drop column if exists refresh_expires_at,
  drop column if exists refresh_rotated_at,
  drop column if exists prev_refresh_token_hash,
  drop column if exists last_city,
  drop column if exists last_ip,
  drop column if exists created_at;

alter table users drop column if exists email_verified_at;

drop index if exists users_email_lower_idx;
drop index if exists users_username_lower_idx;

alter table users add constraint users_username_key unique (username);
alter table users add constraint users_email_key unique (email);
