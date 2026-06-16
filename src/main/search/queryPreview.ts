import type Database from 'better-sqlite3'

function toMatchQuery(query: string) {
  return `"${query.replaceAll('"', '""')}"`
}

type QueryScope = 'all' | 'titles' | 'transcript'

function snippetColumns(scope: QueryScope) {
  if (scope === 'titles') {
    return [1]
  }
  if (scope === 'transcript') {
    return [3]
  }
  return [3, 2, 1]
}

export function createPreviewQuery(db: Database.Database) {
  return (sessionId: string, query: string, scope: QueryScope = 'all') => {
    const turns = db
      .prepare(
        `
          select
            seq,
            role,
            text,
            source_span_ref as sourceSpanRef
          from session_turns
          where session_id = ?
          order by seq asc
        `
      )
      .all(sessionId)

    if (!query.trim()) {
      return {
        turns,
        snippet: null
      }
    }

    let snippet: { snippet?: string } | undefined
    for (const column of snippetColumns(scope)) {
      const row = db
        .prepare(
          `
            select snippet(session_search, ${column}, '<mark>', '</mark>', ' … ', 20) as snippet
            from session_search
            where session_id = ? and session_search match ?
            limit 1
          `
        )
        .get(sessionId, toMatchQuery(query.trim())) as { snippet?: string } | undefined

      if (row?.snippet?.includes('<mark>')) {
        snippet = row
        break
      }

      snippet ??= row
    }

    return {
      turns,
      snippet
    }
  }
}
