import { describe, expect, it } from 'vitest'
import { createSessionSearch } from '../../../src/main/search/querySessions'
import { createTestDb } from '../testDb'

function insertSession(
  db: ReturnType<typeof createTestDb>,
  input: {
    id: string
    title: string
    preview?: string
    searchText?: string
    sourceType?: 'codex' | 'claude' | 'opencode'
    projectId?: string
    updatedAt?: string
    archived?: boolean
  }
) {
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
    `
  ).run(
    input.id,
    input.sourceType ?? 'codex',
    input.id,
    input.projectId ?? null,
    input.title,
    '2026-06-15T00:00:00Z',
    input.updatedAt ?? '2026-06-15T00:10:00Z',
    input.preview ?? 'preview',
    input.searchText ?? 'body',
    input.archived ? 1 : 0,
    'fixture',
    `h-${input.id}`
  )
}

describe('createSessionSearch', () => {
  it('searches titles and normalized transcript text', () => {
    const db = createTestDb()

    db.exec(`
      insert into sessions (
        id,
        source_type,
        source_session_id,
        title,
        started_at,
        updated_at,
        preview,
        search_text,
        is_archived,
        raw_locator,
        hash
      )
      values (
        's1',
        'codex',
        's1',
        'Refine workbook ranking',
        '2026-06-15T00:00:00Z',
        '2026-06-15T00:10:00Z',
        'ranking',
        'Use a soft type-balance rerank.',
        0,
        'fixture',
        'h1'
      );

      insert into sessions (
        id,
        source_type,
        source_session_id,
        title,
        started_at,
        updated_at,
        preview,
        search_text,
        is_archived,
        raw_locator,
        hash
      )
      values (
        's2',
        'codex',
        's2',
        'Archived title',
        '2026-06-14T00:00:00Z',
        '2026-06-14T00:10:00Z',
        'old ranking',
        'Archived transcript token.',
        1,
        'fixture',
        'h2'
      );
    `)

    const search = createSessionSearch(db)
    const rows = search({
      query: 'type-balance',
      scope: 'all',
      groupBy: 'platform',
      timeRange: null,
      projects: [],
      platforms: [],
      includeArchived: false
    })

    expect(rows.map((row) => row.sessionId)).toEqual(['s1'])
  })

  it('honors scope-specific matches and archived filtering', () => {
    const db = createTestDb()

    db.exec(`
      insert into sessions (
        id,
        source_type,
        source_session_id,
        title,
        started_at,
        updated_at,
        preview,
        search_text,
        is_archived,
        raw_locator,
        hash
      )
      values (
        's1',
        'codex',
        's1',
        'Title keyword only',
        '2026-06-15T00:00:00Z',
        '2026-06-15T00:10:00Z',
        'preview',
        'body token only',
        0,
        'fixture',
        'h1'
      );

      insert into sessions (
        id,
        source_type,
        source_session_id,
        title,
        started_at,
        updated_at,
        preview,
        search_text,
        is_archived,
        raw_locator,
        hash
      )
      values (
        's2',
        'codex',
        's2',
        'Another session',
        '2026-06-15T00:00:00Z',
        '2026-06-15T00:10:00Z',
        'preview',
        'transcript keyword only',
        1,
        'fixture',
        'h2'
      );
    `)

    const search = createSessionSearch(db)

    const titleRows = search({
      query: 'title keyword only',
      scope: 'titles',
      groupBy: 'platform',
      timeRange: null,
      projects: [],
      platforms: [],
      includeArchived: false
    })

    const transcriptRows = search({
      query: 'transcript keyword only',
      scope: 'transcript',
      groupBy: 'platform',
      timeRange: null,
      projects: [],
      platforms: [],
      includeArchived: false
    })
    const archivedTranscriptRows = search({
      query: 'transcript keyword only',
      scope: 'transcript',
      groupBy: 'platform',
      timeRange: null,
      projects: [],
      platforms: [],
      includeArchived: true
    })

    expect(titleRows.map((row) => row.sessionId)).toEqual(['s1'])
    expect(transcriptRows).toEqual([])
    expect(archivedTranscriptRows.map((row) => row.sessionId)).toEqual(['s2'])
  })

  it('honors project, platform, and time filters together', () => {
    const db = createTestDb()

    db.exec(`
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
      values
      (
        's1',
        'codex',
        's1',
        '/workspace/dialoglingo',
        'Recent Codex',
        '2026-06-15T00:00:00Z',
        '2026-06-15T00:10:00Z',
        'preview',
        'body',
        0,
        'fixture',
        'h1'
      ),
      (
        's2',
        'codex',
        's2',
        '/workspace/other',
        'Wrong project',
        '2026-06-15T00:00:00Z',
        '2026-06-15T00:10:00Z',
        'preview',
        'body',
        0,
        'fixture',
        'h2'
      ),
      (
        's3',
        'claude',
        's3',
        '/workspace/dialoglingo',
        'Wrong platform',
        '2026-06-15T00:00:00Z',
        '2026-06-15T00:10:00Z',
        'preview',
        'body',
        0,
        'fixture',
        'h3'
      ),
      (
        's4',
        'codex',
        's4',
        '/workspace/dialoglingo',
        'Too old',
        '2026-05-01T00:00:00Z',
        '2026-05-01T00:10:00Z',
        'preview',
        'body',
        0,
        'fixture',
        'h4'
      );
    `)

    const search = createSessionSearch(db)
    const rows = search({
      query: '',
      scope: 'all',
      groupBy: 'platform',
      timeRange: {
        from: '2026-06-01T00:00:00Z',
        to: '2026-06-30T23:59:59Z'
      },
      projects: ['/workspace/dialoglingo'],
      platforms: ['codex'],
      includeArchived: false
    })

    expect(rows.map((row) => row.sessionId)).toEqual(['s1'])
  })

  it('matches Chinese substrings with trigram search', () => {
    const db = createTestDb()
    insertSession(db, {
      id: 's1',
      title: '日志监控 Codex 会话',
      searchText: '这里讨论日志监控方案'
    })

    const search = createSessionSearch(db)
    const fullRows = search({
      query: '日志监控',
      scope: 'titles',
      groupBy: 'platform',
      timeRange: null,
      projects: [],
      platforms: [],
      includeArchived: false
    })
    const partialRows = search({
      query: '日志监',
      scope: 'titles',
      groupBy: 'platform',
      timeRange: null,
      projects: [],
      platforms: [],
      includeArchived: false
    })

    expect(fullRows.map((row) => row.sessionId)).toEqual(['s1'])
    expect(partialRows.map((row) => row.sessionId)).toEqual(['s1'])
    expect(partialRows[0].snippet).toContain('<mark>日志监</mark>')
  })

  it('normalizes everyday spaces and punctuation in search input', () => {
    const db = createTestDb()
    insertSession(db, {
      id: 's1',
      title: '日志监控 Codex 会话',
      searchText: '这里讨论日志监控方案'
    })

    const search = createSessionSearch(db)
    const baseInput = {
      scope: 'titles' as const,
      groupBy: 'platform' as const,
      timeRange: null,
      projects: [],
      platforms: [],
      includeArchived: false
    }

    expect(search({ ...baseInput, query: '日志 监' }).map((row) => row.sessionId)).toEqual([
      's1'
    ])
    expect(search({ ...baseInput, query: '日志-监' }).map((row) => row.sessionId)).toEqual([
      's1'
    ])
  })

  it('keeps title and transcript scopes isolated for active sessions', () => {
    const db = createTestDb()
    insertSession(db, {
      id: 'title-only',
      title: '日志监控 title',
      searchText: 'body only'
    })
    insertSession(db, {
      id: 'transcript-only',
      title: 'plain title',
      searchText: '日志监控 transcript'
    })

    const search = createSessionSearch(db)
    const baseInput = {
      query: '日志监',
      groupBy: 'platform' as const,
      timeRange: null,
      projects: [],
      platforms: [],
      includeArchived: false
    }

    expect(
      search({ ...baseInput, scope: 'titles' }).map((row) => row.sessionId)
    ).toEqual(['title-only'])
    expect(
      search({ ...baseInput, scope: 'transcript' }).map((row) => row.sessionId)
    ).toEqual(['transcript-only'])
  })

  it('falls back to scoped LIKE matching for one- and two-character queries', () => {
    const db = createTestDb()
    insertSession(db, {
      id: 'title-short',
      title: '日志',
      searchText: 'body only'
    })
    insertSession(db, {
      id: 'transcript-short',
      title: 'plain title',
      searchText: '日志'
    })

    const search = createSessionSearch(db)
    const baseInput = {
      query: '日志',
      groupBy: 'platform' as const,
      timeRange: null,
      projects: [],
      platforms: [],
      includeArchived: false
    }

    const titleRows = search({ ...baseInput, scope: 'titles' })
    const transcriptRows = search({ ...baseInput, scope: 'transcript' })

    expect(titleRows.map((row) => row.sessionId)).toEqual(['title-short'])
    expect(titleRows[0].snippet).toContain('<mark>日志</mark>')
    expect(transcriptRows.map((row) => row.sessionId)).toEqual([
      'transcript-short'
    ])
  })
})
