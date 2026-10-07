-- Reverses 0003_chats.up.sql, dropping in reverse dependency order.

drop table if exists attachments;
drop table if exists pinned_messages;
drop table if exists message_reads;
drop table if exists message_reactions;
drop table if exists messages;
drop table if exists chat_members;
drop table if exists chats;
