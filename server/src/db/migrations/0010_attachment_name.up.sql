-- The original file name was only ever inside the bucket key, which is not a
-- thing the client is allowed to see: it carries the uploader's id and the
-- storage layout. Without it every attachment rendered as the word "Вложение".
alter table attachments add column name text not null default '';
