-- A file is uploaded before the message that carries it exists, so an attachment
-- has to be able to sit unlinked for a while. A background job removes the ones
-- that are never claimed. Reversed by 0004_attachments_orphans.down.sql.

alter table attachments alter column message_id drop not null;

-- The cleanup job scans for unclaimed rows by age.
create index attachments_orphan_idx on attachments (created_at) where message_id is null;
