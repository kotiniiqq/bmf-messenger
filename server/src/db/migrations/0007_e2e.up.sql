-- The privacy mode: key material devices leave for each other, and the state a
-- chat is in. Reversed by 0007_e2e.down.sql.
--
-- Nothing here is readable by the server. Every key column is base64 of what
-- libsignal serialised, stored so a device that is offline when somebody wants
-- to reach it can still be reached.

create table device_keys (
  device_id        uuid primary key references devices(id) on delete cascade,
  user_id          uuid not null references users(id) on delete cascade,
  registration_id  integer not null,
  identity_key     text not null,
  signed_prekey_id integer not null,
  signed_prekey    text not null,
  signed_prekey_sig text not null,
  kyber_prekey_id  integer not null,
  kyber_prekey     text not null,
  kyber_prekey_sig text not null,
  updated_at       timestamptz not null default now()
);

create index device_keys_user_idx on device_keys (user_id);

create table one_time_prekeys (
  device_id  uuid not null references devices(id) on delete cascade,
  key_id     integer not null,
  key        text not null,
  claimed_at timestamptz,
  primary key (device_id, key_id)
);

-- Claiming reads the oldest unclaimed key for a device; the partial index is
-- what keeps that from scanning every key the device ever uploaded.
create index one_time_prekeys_unclaimed_idx
  on one_time_prekeys (device_id, key_id) where claimed_at is null;

-- `is_e2e` already existed as a boolean. It stays — the chat list reads it —
-- and the new column carries the part a boolean cannot: an offer that has been
-- made and not yet answered.
alter table chats
  add column e2e_state text not null default 'off'
    check (e2e_state in ('off', 'proposed', 'on')),
  add column e2e_proposed_by uuid references users(id) on delete set null,
  -- The two devices that agreed. A third device of either person is not in the
  -- session and cannot read the chat, which is the spec's "history does not
  -- sync between devices" stated as data.
  add column e2e_devices jsonb not null default '[]'::jsonb;

-- The ciphertext, addressed to one device. Null for every ordinary message,
-- and the body column is empty for every message that has one of these.
alter table messages add column envelope jsonb;
