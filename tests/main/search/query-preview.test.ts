import { describe, expect, it } from 'vitest'
import {
  HIGHLIGHT_START,
  markHighlightedText
} from '../../../src/shared/highlight'
import {
  createPreviewQuery,
  createWorkbookPreviewQuery
} from '../../../src/main/search/queryPreview'
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

    expect(preview.snippet?.snippet).toContain(HIGHLIGHT_START)
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

    expect(preview.snippet?.snippet).toContain(markHighlightedText('日志监'))
  })

  it('uses the short-query fallback when building preview snippets', () => {
    const db = createTestDb()
    insertPreviewSession(db, {
      id: 's1',
      title: 'plain title',
      searchText: '日志'
    })

    const preview = createPreviewQuery(db)('s1', '日志', 'transcript')

    expect(preview.snippet?.snippet).toContain(markHighlightedText('日志'))
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
      `first line before ${markHighlightedText('workbook')}\nsecond line after ${markHighlightedText('workbook')}`
    )
    expect(preview.turns[0].text).toContain('first line before')
    expect(preview.turns[0].text).toContain('second line after')
  })

  it('filters an initial environment context turn from preview rows', () => {
    const db = createTestDb()
    insertPreviewSession(db, {
      id: 's1',
      title: 'plain title',
      searchText:
        '<environment_context>\n  <cwd>/workspace/dialoglingo</cwd>\n</environment_context>'
    })
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
        values ('t-s1-real', 's1', 1, 'user', 'en', ?, 'fixture:2', 0)
      `
    ).run('Actual prompt after environment context')

    const preview = createPreviewQuery(db)('s1', '')

    expect(preview.turns.map((turn) => turn.text)).toEqual([
      'Actual prompt after environment context'
    ])
  })

  it('filters tool-noise turns from search preview rows', () => {
    const db = createTestDb()
    insertPreviewSession(db, {
      id: 's1',
      title: 'plain title',
      searchText: 'Evidence turn with useful language.'
    })
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
        values ('t-s1-noise', 's1', 1, 'assistant', 'en', ?, 'fixture:2', 1)
      `
    ).run('Adapter-marked tool output should stay hidden.')

    const preview = createPreviewQuery(db)('s1', '')

    expect(preview.turns.map((turn) => turn.text)).toEqual([
      'Evidence turn with useful language.'
    ])
  })

  it('does not treat literal mark tags in transcript text as search highlights', () => {
    const db = createTestDb()
    insertPreviewSession(db, {
      id: 's1',
      title: '调研 title match',
      searchText: 'Use the literal `<mark>` token when explaining render internals.'
    })

    const preview = createPreviewQuery(db)('s1', '调研', 'all')

    expect(preview.turns[0].text).toContain('`<mark>` token')
    expect(preview.turns[0].text).not.toContain(HIGHLIGHT_START)
  })

  it('returns full workbook source turns and highlights the matching source span', () => {
    const db = createTestDb()
    insertPreviewSession(db, {
      id: 's1',
      title: 'Source session',
      searchText: 'first turn'
    })
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
        values ('t-s1-second', 's1', 1, 'assistant', 'en', ?, 'fixture:2', 0)
      `
    ).run('Use geometric registration before fine alignment.')

    const preview = createWorkbookPreviewQuery(db)({
      sessionId: 's1',
      sourceSpanRef: 'fixture:2',
      highlightText: 'geometric registration'
    })

    expect(preview.turns).toHaveLength(2)
    expect(preview.turns[1].text).toContain(
      markHighlightedText('geometric registration')
    )
    expect(preview.matchedBy).toBe('source-span')
  })

  it('filters tool-noise turns from workbook source preview rows', () => {
    const db = createTestDb()
    insertPreviewSession(db, {
      id: 's1',
      title: 'Source session',
      searchText: 'Use a stable evidence manifest before generation.'
    })
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
        values ('t-s1-noise', 's1', 1, 'assistant', 'en', ?, 'fixture:2', 1)
      `
    ).run('Tool output that should not render in source preview.')

    const preview = createWorkbookPreviewQuery(db)({
      sessionId: 's1',
      sourceSpanRef: 'fixture:2',
      highlightText: 'Tool output'
    })

    expect(preview.turns.map((turn) => turn.text)).toEqual([
      'Use a stable evidence manifest before generation.'
    ])
    expect(preview.matchedBy).toBe('none')
  })

  it('falls back to workbook source text highlighting when the span is unavailable', () => {
    const db = createTestDb()
    insertPreviewSession(db, {
      id: 's1',
      title: 'Source session',
      searchText: 'The export bundle keeps workbook context available.'
    })

    const preview = createWorkbookPreviewQuery(db)({
      sessionId: 's1',
      sourceSpanRef: 'missing-span',
      highlightText: 'workbook context'
    })

    expect(preview.turns[0].text).toContain(markHighlightedText('workbook context'))
    expect(preview.matchedBy).toBe('highlight-text')
  })
})
