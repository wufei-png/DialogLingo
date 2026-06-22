create index if not exists session_turns_session_id_seq_idx
on session_turns(session_id, seq);

create index if not exists sessions_updated_at_idx
on sessions(updated_at desc);

create index if not exists sessions_project_updated_at_idx
on sessions(project_id, updated_at desc);
