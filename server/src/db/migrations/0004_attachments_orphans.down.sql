-- Reverses 0004_attachments_orphans.up.sql. Unclaimed rows must go first:
-- they cannot satisfy the restored NOT NULL constraint.

drop index if exists attachments_orphan_idx;
delete from attachments where message_id is null;
alter table attachments alter column message_id set not null;
