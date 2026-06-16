import { describe, expect, it } from 'vitest'
import { createPreviewQuery } from '../../../src/main/search/queryPreview'
import { createTestDb } from '../testDb'

function insertPreviewSession(
  db: ReturnType<typeof createTestDb>,
  input: {
    id: string
    title: string
    preview?: string
    searchText?: string
  }
) {
  db.prepare(
    `
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
      values (?, 'codex', ?, ?, '2026-06-15T00:00:00Z', '2026-06-15T00:10:00Z', ?, ?, 0, 'fixture', ?)
    `
  ).run(
    input.id,
    input.id,
    input.title,
    input.preview ?? 'preview without the keyword',
    input.searchText ?? 'body without the keyword',
    `h-${input.id}`
  )

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
      values (?, ?, 0, 'user', 'en', ?, 'fixture:1', 0)
    `
  ).run(`t-${input.id}`, input.id, input.searchText ?? 'body without the keyword')
}

describe('createPreviewQuery', () => {
  it('returns a highlighted title snippet when the query matches title scope', () => {
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
        'Fix workbook generation',
        '2026-06-15T00:00:00Z',
        '2026-06-15T00:10:00Z',
        'preview without the keyword',
        'body without the keyword',
        0,
        'fixture',
        'h1'
      );

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
      values (
        't1',
        's1',
        0,
        'user',
        'en',
        'body without the keyword',
        'fixture:1',
        0
      );
    `)

    const preview = createPreviewQuery(db)('s1', 'workbook', 'titles')

    expect(preview.snippet?.snippet).toContain('<mark>')
    expect(preview.snippet?.snippet).toContain('workbook')
  })

  it('highlights normalized punctuation variants in title snippets', () => {
    const db = createTestDb()
    insertPreviewSession(db, {
      id: 's1',
      title: '日志监控 Codex 会话',
      searchText: 'body without the keyword'
    })

    const preview = createPreviewQuery(db)('s1', '日志-监', 'titles')

    expect(preview.snippet?.snippet).toContain('<mark>日志监</mark>')
  })

  it('uses the short-query fallback when building preview snippets', () => {
    const db = createTestDb()
    insertPreviewSession(db, {
      id: 's1',
      title: 'plain title',
      searchText: '日志'
    })

    const preview = createPreviewQuery(db)('s1', '日志', 'transcript')

    expect(preview.snippet?.snippet).toContain('<mark>日志</mark>')
  })

  it('keeps full preview turns while highlighting matching transcript text', () => {
    const db = createTestDb()
    insertPreviewSession(db, {
      id: 's1',
      title: 'plain title',
      searchText: 'first line before workbook\nsecond line after workbook'
    })

    const preview = createPreviewQuery(db)('s1', 'workbook', 'transcript')

    expect(preview.turns[0].text).toBe(
      'first line before <mark>workbook</mark>\nsecond line after <mark>workbook</mark>'
    )
    expect(preview.turns[0].text).toContain('first line before')
    expect(preview.turns[0].text).toContain('second line after')
  })
})
