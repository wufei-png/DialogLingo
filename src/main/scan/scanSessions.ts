import crypto from 'node:crypto'
import type Database from 'better-sqlite3'
import { createSourceRegistry } from '../sources'
import type { SessionFilterInput, SourceRegistry } from '../sources/types'
import { discoverProjects } from './discoverProjects'

function yieldToEventLoop() {
  return new Promise<void>((resolve) => {
    setImmediate(resolve)
  })
}

export async function scanSessions(
  db: Database.Database,
  registry: SourceRegistry = createSourceRegistry(),
  options?: { includeArchived?: boolean }
) {
  const baseFilters: SessionFilterInput = {
    query: '',
    timeRange: null,
    projects: [],
    platforms: [],
    includeArchived: options?.includeArchived ?? false
  }

  const allSummaries = [
    ...(await registry.codex.listSessions(baseFilters)),
    ...(await registry.claude.listSessions(baseFilters)),
    ...(await registry.opencode.listSessions(baseFilters))
  ]

  for (const project of discoverProjects(allSummaries)) {
    db.prepare(
      `
        insert into projects (
          id,
          name,
          local_path,
          source_platforms_json,
          discovered_at,
          user_pinned,
          is_active
        )
        values (?, ?, ?, ?, ?, 0, 1)
        on conflict(id) do update set
          name = excluded.name,
          local_path = excluded.local_path,
          source_platforms_json = excluded.source_platforms_json,
          discovered_at = excluded.discovered_at,
          is_active = 1
      `
    ).run(
      project.id,
      project.name,
      project.localPath,
      JSON.stringify(project.sourcePlatforms),
      new Date().toISOString()
    )
  }

  for (const summary of allSummaries) {
    await yieldToEventLoop()

    const persistedSessionId = `${summary.sourceType}:${summary.id}`
    const readOptions = { locator: summary.locator }
    // Some adapters fully parse transcript files while listing sessions. Reuse
    // those turns here so large JSONL files are not read twice during scans.
    const turns =
      summary.turns ??
      (summary.sourceType === 'codex'
        ? await registry.codex.readSession(summary.id, readOptions)
        : summary.sourceType === 'claude'
          ? await registry.claude.readSession(summary.id, readOptions)
          : await registry.opencode.readSession(summary.id, readOptions))

    const searchText = turns.map((turn) => turn.text).join('\n')
    const sessionHash = crypto.createHash('sha1').update(searchText).digest('hex')

    db.prepare(
      `
        insert into sessions (
          id,
          source_type,
          source_session_id,
          project_id,
          title,
          started_at,
          updated_at,
          preview,
          search_text,
          is_archived,
          raw_locator,
          hash
        )
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        on conflict(id) do update set
          source_type = excluded.source_type,
          source_session_id = excluded.source_session_id,
          project_id = excluded.project_id,
          title = excluded.title,
          started_at = excluded.started_at,
          updated_at = excluded.updated_at,
          preview = excluded.preview,
          search_text = excluded.search_text,
          is_archived = excluded.is_archived,
          raw_locator = excluded.raw_locator,
          hash = excluded.hash
      `
    ).run(
      persistedSessionId,
      summary.sourceType,
      summary.id,
      summary.projectPath || null,
      summary.title,
      summary.startedAt,
      summary.updatedAt,
      summary.preview,
      searchText,
      summary.archived ? 1 : 0,
      summary.locator,
      sessionHash
    )

    db.prepare('delete from session_turns where session_id = ?').run(persistedSessionId)

    turns.forEach((turn, index) => {
      db.prepare(
        `
          insert into session_turns (
            id,
            session_id,
            seq,
            role,
            language_hint,
            text,
            source_span_ref,
            is_tool_noise
          )
          values (?, ?, ?, ?, ?, ?, ?, 0)
        `
      ).run(
        `${persistedSessionId}:${turn.id}`,
        persistedSessionId,
        index,
        turn.role,
        turn.languageHint,
        turn.text,
        turn.sourceSpanRef
      )
    })
  }

  return {
    projectCount: discoverProjects(allSummaries).length,
    sessionCount: allSummaries.length
  }
}
