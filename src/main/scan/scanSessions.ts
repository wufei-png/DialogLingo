import crypto from 'node:crypto'
import type Database from 'better-sqlite3'
import { createSourceRegistry } from '../sources'
import type {
  ConversationTurn,
  SessionFilterInput,
  SourceRegistry,
  SourceType
} from '../sources/types'
import { isTurnToolNoise } from '../text/turnNoise'
import { logger } from '../logging'
import { discoverProjects } from './discoverProjects'

type PersistedSession = {
  id: string
  sourceType: SourceType
  sourceSessionId: string
  projectId: string | null
  title: string
  startedAt: string
  updatedAt: string
  preview: string
  searchText: string
  isArchived: number
  rawLocator: string
  hash: string
}

type ExistingSession = PersistedSession & {
  turnCount: number
}

function yieldToEventLoop() {
  return new Promise<void>((resolve) => {
    setImmediate(resolve)
  })
}

function isSamePersistedSession(existing: ExistingSession, next: PersistedSession) {
  return (
    existing.sourceType === next.sourceType &&
    existing.sourceSessionId === next.sourceSessionId &&
    existing.projectId === next.projectId &&
    existing.title === next.title &&
    existing.startedAt === next.startedAt &&
    existing.updatedAt === next.updatedAt &&
    existing.preview === next.preview &&
    existing.searchText === next.searchText &&
    existing.isArchived === next.isArchived &&
    existing.rawLocator === next.rawLocator &&
    existing.hash === next.hash
  )
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

  const codexSummaries = await registry.codex.listSessions(baseFilters)
  const claudeSummaries = await registry.claude.listSessions(baseFilters)
  const opencodeSummaries = await registry.opencode.listSessions(baseFilters)
  const allSummaries = [
    ...codexSummaries,
    ...claudeSummaries,
    ...opencodeSummaries
  ]
  logger.debug('session-scan', 'adapter sessions listed', {
    includeArchived: baseFilters.includeArchived,
    codexSessionCount: codexSummaries.length,
    claudeSessionCount: claudeSummaries.length,
    opencodeSessionCount: opencodeSummaries.length,
    totalSessionCount: allSummaries.length
  })

  const projects = discoverProjects(allSummaries)
  const upsertProject = db.prepare(
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
  )
  const selectSession = db.prepare(
    `
      select
        s.id,
        s.source_type as sourceType,
        s.source_session_id as sourceSessionId,
        s.project_id as projectId,
        s.title,
        s.started_at as startedAt,
        s.updated_at as updatedAt,
        s.preview,
        s.search_text as searchText,
        s.is_archived as isArchived,
        s.raw_locator as rawLocator,
        s.hash,
        (
          select count(*)
          from session_turns st
          where st.session_id = s.id
        ) as turnCount
      from sessions s
      where s.id = ?
      limit 1
    `
  )
  const upsertSession = db.prepare(
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
  )
  const deleteTurns = db.prepare('delete from session_turns where session_id = ?')
  const insertTurn = db.prepare(
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
      values (?, ?, ?, ?, ?, ?, ?, ?)
    `
  )

  const persistProjects = db.transaction((discoveredAt: string) => {
    for (const project of projects) {
      upsertProject.run(
        project.id,
        project.name,
        project.localPath,
        JSON.stringify(project.sourcePlatforms),
        discoveredAt
      )
    }
  })
  const persistSession = db.transaction(
    (input: {
      session: PersistedSession
      turnsToRewrite: ConversationTurn[] | null
      sessionChanged: boolean
    }) => {
      if (input.sessionChanged) {
        upsertSession.run(
          input.session.id,
          input.session.sourceType,
          input.session.sourceSessionId,
          input.session.projectId,
          input.session.title,
          input.session.startedAt,
          input.session.updatedAt,
          input.session.preview,
          input.session.searchText,
          input.session.isArchived,
          input.session.rawLocator,
          input.session.hash
        )
      }

      if (!input.turnsToRewrite) {
        return
      }

      deleteTurns.run(input.session.id)

      input.turnsToRewrite.forEach((turn, index) => {
        insertTurn.run(
          `${input.session.id}:${turn.id}`,
          input.session.id,
          index,
          turn.role,
          turn.languageHint,
          turn.text,
          turn.sourceSpanRef,
          isTurnToolNoise(turn) ? 1 : 0
        )
      })
    }
  )

  persistProjects(new Date().toISOString())

  let insertedSessionCount = 0
  let updatedSessionCount = 0
  let skippedSessionCount = 0
  let rewrittenTurnSessionCount = 0
  let rewrittenTurnCount = 0

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
    const persistedSession: PersistedSession = {
      id: persistedSessionId,
      sourceType: summary.sourceType,
      sourceSessionId: summary.id,
      projectId: summary.projectPath || null,
      title: summary.title,
      startedAt: summary.startedAt,
      updatedAt: summary.updatedAt,
      preview: summary.preview,
      searchText,
      isArchived: summary.archived ? 1 : 0,
      rawLocator: summary.locator,
      hash: sessionHash
    }
    const existing = selectSession.get(persistedSessionId) as ExistingSession | undefined
    const sessionChanged = existing
      ? !isSamePersistedSession(existing, persistedSession)
      : true
    const turnsToRewrite =
      !existing || existing.hash !== sessionHash || existing.turnCount !== turns.length
        ? turns
        : null

    if (!sessionChanged && !turnsToRewrite) {
      skippedSessionCount += 1
      continue
    }

    if (!existing) {
      insertedSessionCount += 1
    } else if (sessionChanged) {
      updatedSessionCount += 1
    }

    if (turnsToRewrite) {
      rewrittenTurnSessionCount += 1
      rewrittenTurnCount += turnsToRewrite.length
    }

    persistSession({
      session: persistedSession,
      turnsToRewrite,
      sessionChanged
    })
  }

  logger.debug('session-scan', 'session persistence complete', {
    totalSessionCount: allSummaries.length,
    insertedSessionCount,
    updatedSessionCount,
    skippedSessionCount,
    rewrittenTurnSessionCount,
    rewrittenTurnCount
  })

  return {
    projectCount: projects.length,
    sessionCount: allSummaries.length,
    insertedSessionCount,
    updatedSessionCount,
    skippedSessionCount,
    rewrittenTurnSessionCount,
    rewrittenTurnCount
  }
}
