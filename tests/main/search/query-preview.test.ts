import { describe, expect, it } from 'vitest'
import { createPreviewQuery } from '../../../src/main/search/queryPreview'
import { createTestDb } from '../testDb'

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
})
