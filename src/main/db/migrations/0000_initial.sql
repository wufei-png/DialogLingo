create table if not exists settings (
  id integer primary key check (id = 1),
  json text not null
);

create table if not exists projects (
  id text primary key,
  name text not null,
  local_path text not null,
  source_platforms_json text not null,
  discovered_at text not null,
  user_pinned integer not null,
  is_active integer not null
);

create table if not exists sessions (
  id text primary key,
  source_type text not null,
  source_session_id text not null,
  project_id text references projects(id),
  title text not null,
  started_at text not null,
  updated_at text not null,
  preview text not null,
  search_text text not null,
  raw_locator text not null,
  hash text not null
);

create table if not exists session_turns (
  id text primary key,
  session_id text not null references sessions(id) on delete cascade,
  seq integer not null,
  role text not null,
  language_hint text not null,
  text text not null,
  source_span_ref text not null,
  is_tool_noise integer not null
);

create table if not exists generation_jobs (
  id text primary key,
  created_at text not null,
  status text not null,
  selected_filters_json text not null,
  selected_session_count integer not null,
  progress_json text not null
);

create table if not exists generation_job_sessions (
  job_id text not null references generation_jobs(id) on delete cascade,
  session_id text not null references sessions(id) on delete cascade,
  snapshot_title text not null,
  snapshot_hash text not null,
  primary key (job_id, session_id)
);

create table if not exists candidate_groups (
  id text primary key,
  job_id text not null references generation_jobs(id) on delete cascade,
  session_id text not null references sessions(id) on delete cascade,
  source_span_ref text not null,
  prompt_text text not null,
  status text not null
);

create table if not exists enrichment_batches (
  id text primary key,
  job_id text not null references generation_jobs(id) on delete cascade,
  batch_index integer not null,
  status text not null,
  request_json text not null,
  response_json text not null
);

create table if not exists ranked_orders (
  id text primary key,
  job_id text not null references generation_jobs(id) on delete cascade,
  rank_profile_json text not null,
  ordered_ids_json text not null
);

create table if not exists workbooks (
  id text primary key,
  job_id text not null references generation_jobs(id) on delete cascade,
  created_at text not null,
  status text not null
);

create table if not exists workbook_items (
  id text primary key,
  workbook_id text not null references workbooks(id) on delete cascade,
  item_type text not null,
  generated_snapshot_json text not null,
  current_snapshot_json text not null,
  source_refs_json text not null,
  state text not null
);

create table if not exists workbook_item_revisions (
  id text primary key,
  workbook_item_id text not null references workbook_items(id) on delete cascade,
  action_type text not null,
  before_json text not null,
  after_json text not null,
  created_at text not null
);

create table if not exists export_runs (
  id text primary key,
  workbook_id text not null references workbooks(id) on delete cascade,
  export_type text not null,
  output_path text not null,
  created_at text not null,
  metadata_json text not null
);
