alter table export_runs add column status text not null default 'completed';
alter table export_runs add column started_at text;
alter table export_runs add column completed_at text;
alter table export_runs add column failed_at text;
alter table export_runs add column error_code text;
alter table export_runs add column error_message text;

update export_runs
set
  started_at = created_at,
  completed_at = created_at
where status = 'completed';
