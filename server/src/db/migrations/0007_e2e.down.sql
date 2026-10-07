alter table messages drop column envelope;

alter table chats
  drop column e2e_devices,
  drop column e2e_proposed_by,
  drop column e2e_state;

drop table one_time_prekeys;
drop table device_keys;
