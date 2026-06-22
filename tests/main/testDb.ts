import BetterSqlite3 from 'better-sqlite3'

export function createTestDb(): InstanceType<typeof BetterSqlite3> {
  const db = new BetterSqlite3(':memory:')

  db.exec(`
    create table projects (
      id text primary key,
      name text not null,
      local_path text not null,
      source_platforms_json text not null,
      discovered_at text not null,
      user_pinned integer not null,
      is_active integer not null
    );

    create table sessions (
      id text primary key,
      source_type text not null,
      source_session_id text not null,
      project_id text,
      title text not null,
      started_at text not null,
      updated_at text not null,
      preview text not null,
      search_text text not null,
      is_archived integer not null default 0,
      raw_locator text not null,
      hash text not null
    );

    create table session_turns (
      id text primary key,
      session_id text not null,
      seq integer not null,
      role text not null,
      language_hint text not null,
      text text not null,
      source_span_ref text not null,
      is_tool_noise integer not null
    );

    create index session_turns_session_id_seq_idx
    on session_turns(session_id, seq);

    create index sessions_updated_at_idx
    on sessions(updated_at desc);

    create index sessions_project_updated_at_idx
    on sessions(project_id, updated_at desc);

    create virtual table session_search using fts5(
      session_id UNINDEXED,
      title,
      preview,
      normalized_text,
      tokenize='trigram'
    );

    create trigger sessions_ai after insert on sessions begin
      insert into session_search(rowid, session_id, title, preview, normalized_text)
      values (new.rowid, new.id, new.title, new.preview, new.search_text);
    end;

    create trigger sessions_au after update of title, preview, search_text on sessions begin
      update session_search
      set session_id = new.id,
          title = new.title,
          preview = new.preview,
          normalized_text = new.search_text
      where rowid = old.rowid;
    end;

    create trigger sessions_ad after delete on sessions begin
      delete from session_search where rowid = old.rowid;
    end;
  `)

  return db
}
