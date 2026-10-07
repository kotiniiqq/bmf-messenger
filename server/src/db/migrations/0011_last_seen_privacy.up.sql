-- "Был в сети" is the one thing a messenger tells about you without being
-- asked, and the spec's privacy section says it has to be refusable. Default
-- is `everyone`, which is what the product did before this column existed.
alter table users
  add column show_last_seen boolean not null default true;
