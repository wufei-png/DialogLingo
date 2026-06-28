import type Database from 'better-sqlite3'
import {
  HIGHLIGHT_END,
  HIGHLIGHT_START,
  hasHighlightMarker,
  markHighlightedText
} from '../../shared/highlight'
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
  isToolNoise: number
}

type SessionPreviewMeta = {
  sessionId: string
  title: string
  sourceType: string
  projectPath: string | null
  updatedAt: string
}

function isEnvironmentContextText(text: string) {
  const trimmed = text.trim()
  return (
    trimmed.startsWith('<environment_context>') &&
    trimmed.endsWith('</environment_context>')
  )
}

function filterInitialEnvironmentContextTurn(turns: PreviewTurn[]) {
  const [firstTurn] = turns
  if (firstTurn?.role === 'user' && isEnvironmentContextText(firstTurn.text)) {
    // Older rows may predate the tool-noise flag. Keep this display guard so
    // preview navigation stays focused on conversation evidence.
    return turns.slice(1)
  }

  return turns
}

function filterPreviewTurns(turns: PreviewTurn[]) {
  return filterInitialEnvironmentContextTurn(turns).filter(
    (turn) => !turn.isToolNoise
  )
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

function hasHighlight(value: string) {
  return hasHighlightMarker(value)
}

function markWholeText(value: string) {
  return markHighlightedText(value)
}

function highlightText(value: string, highlightText: string) {
  const plan = buildSearchQueryPlan(highlightText)
  return plan.trimmed ? buildHighlightedText(value, plan.variants) : value
}

export function createPreviewQuery(db: Database.Database) {
  return (sessionId: string, query: string, scope: QueryScope = 'all') => {
    const rawTurns = db
      .prepare(
        `
          select
            seq,
            role,
            text,
            source_span_ref as sourceSpanRef,
            is_tool_noise as isToolNoise
          from session_turns
          where session_id = ?
          order by seq asc
        `
      )
      .all(sessionId) as PreviewTurn[]
    const turns = filterPreviewTurns(rawTurns)

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
            select snippet(session_search, ${column}, '${HIGHLIGHT_START}', '${HIGHLIGHT_END}', ' … ', 20) as snippet
            from session_search
            where session_id = ? and session_search match ?
            limit 1
          `
        )
        .get(sessionId, buildScopedFtsMatchQuery(scope, plan.variants)) as
        | { snippet?: string }
        | undefined

      if (hasHighlightMarker(row?.snippet)) {
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

export function createWorkbookPreviewQuery(db: Database.Database) {
  return (input: {
    sessionId: string
    sourceSpanRef?: string | null
    highlightText?: string | null
  }) => {
    const session = db
      .prepare(
        `
          select
            s.id as sessionId,
            s.title,
            s.source_type as sourceType,
            p.local_path as projectPath,
            s.updated_at as updatedAt
          from sessions s
          left join projects p on p.id = s.project_id
          where s.id = ?
          limit 1
        `
      )
      .get(input.sessionId) as SessionPreviewMeta | undefined
    const rawTurns = db
      .prepare(
        `
          select
            seq,
            role,
            text,
            source_span_ref as sourceSpanRef,
            is_tool_noise as isToolNoise
          from session_turns
          where session_id = ?
          order by seq asc
        `
      )
      .all(input.sessionId) as PreviewTurn[]
    const turns = filterPreviewTurns(rawTurns)
    const sourceSpanRef = input.sourceSpanRef?.trim() ?? ''
    const highlight = input.highlightText?.trim() ?? ''
    const sourceMatchedTurns = sourceSpanRef
      ? turns.filter((turn) => turn.sourceSpanRef === sourceSpanRef)
      : []

    let matchedBy: 'source-span' | 'highlight-text' | 'none' = 'none'
    const previewTurns =
      sourceMatchedTurns.length > 0
        ? turns.map((turn) => {
            if (turn.sourceSpanRef !== sourceSpanRef) {
              return turn
            }

            const nextText = highlightText(String(turn.text), highlight)
            matchedBy = 'source-span'
            return {
              ...turn,
              text: hasHighlight(nextText) ? nextText : markWholeText(String(turn.text))
            }
          })
        : turns.map((turn) => {
            const nextText = highlightText(String(turn.text), highlight)
            if (hasHighlight(nextText)) {
              matchedBy = 'highlight-text'
            }
            return {
              ...turn,
              text: nextText
            }
          })

    return {
      session: session ?? {
        sessionId: input.sessionId,
        title: input.sessionId,
        sourceType: '',
        projectPath: null,
        updatedAt: ''
      },
      turns: previewTurns,
      snippet: null,
      matchedBy
    }
  }
}
