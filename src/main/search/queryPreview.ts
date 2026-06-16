import type Database from 'better-sqlite3'
import {
  buildHighlightedText,
  buildHighlightedSnippet,
  buildScopedFtsMatchQuery,
  buildScopedLikeCondition,
  buildSearchQueryPlan,
  type QueryScope
} from './searchQuery'

type PreviewTurn = {
  seq: number
  role: string
  text: string
  sourceSpanRef: string | null
}

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
      .all(sessionId) as PreviewTurn[]

    const plan = buildSearchQueryPlan(query)
    const previewTurns =
      plan.trimmed && scope !== 'titles'
        ? turns.map((turn) => ({
            ...turn,
            text: buildHighlightedText(String(turn.text), plan.variants)
          }))
        : turns

    if (!plan.trimmed) {
      return {
        turns: previewTurns,
        snippet: null
      }
    }

    if (plan.useLikeFallback) {
      const like = buildScopedLikeCondition(scope, plan.variants, 's')
      const row = db
        .prepare(
          `
            select
              s.title,
              s.preview,
              s.search_text as searchText
            from sessions s
            where s.id = ? and ${like.sql}
            limit 1
          `
        )
        .get(sessionId, ...like.args) as
        | { title: string; preview: string; searchText: string }
        | undefined

      const source =
        scope === 'titles'
          ? row?.title
          : scope === 'transcript'
            ? row?.searchText
            : [row?.searchText, row?.preview, row?.title].find((value) =>
                value
                  ? plan.variants.some((variant) =>
                      value.toLocaleLowerCase().includes(variant.toLocaleLowerCase())
                    )
                  : false
              )

      return {
        turns: previewTurns,
        snippet: source
          ? {
              snippet: buildHighlightedSnippet(source, plan.variants)
            }
          : null
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
        .get(sessionId, buildScopedFtsMatchQuery(scope, plan.variants)) as
        | { snippet?: string }
        | undefined

      if (row?.snippet?.includes('<mark>')) {
        snippet = row
        break
      }

      snippet ??= row
    }

    return {
      turns: previewTurns,
      snippet
    }
  }
}
