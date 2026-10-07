-- A channel has a description in the prototype's creation wizard and nowhere to
-- keep it, so it was collected and dropped. Groups get one too: the difference
-- between them is who may write, not what may be said about them.
alter table chats add column description text not null default '';
