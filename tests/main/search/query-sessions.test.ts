import { describe, expect, it } from 'vitest'
import { createSessionSearch } from '../../../src/main/search/querySessions'
import { createTestDb } from '../testDb'

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

    expect(titleRows.map((row) => row.sessionId)).toEqual(['s1'])
    expect(transcriptRows).toEqual([])
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
})
