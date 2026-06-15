import { useEffect, useMemo, useState } from 'react'
import { trpc } from '../../lib/trpc'
import { SearchRail } from './SearchRail'
import { SessionPreviewPane } from './SessionPreviewPane'

type SearchSession = {
  sessionId: string
  title: string
  snippet: string | null
  sourceType: 'codex' | 'claude' | 'opencode'
  projectPath: string | null
  updatedAt: string
  preview: string
}

type SessionPreview = {
  turns: Array<{ seq: number; role: string; text: string }>
  snippet: { snippet?: string } | null
}

export function SearchPage(props: {
  onWorkbookReady: (payload: { jobId: string; workbookId: string }) => void
}) {
  const [sessions, setSessions] = useState<SearchSession[]>([])
  const [focusedSessionId, setFocusedSessionId] = useState<string | null>(null)
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set())
  const [preview, setPreview] = useState<SessionPreview | null>(null)

  const focusedSession = useMemo(
    () => sessions.find((session) => session.sessionId === focusedSessionId) ?? null,
    [focusedSessionId, sessions]
  )

  async function loadSessions() {
    const rows = (await trpc.sessionSearch.query({
      query: '',
      scope: 'all',
      groupBy: 'platform',
      timeRange: null,
      projects: [],
      platforms: [],
      includeArchived: false
    })) as SearchSession[]

    setSessions(rows)
    setFocusedSessionId((current) => current ?? rows[0]?.sessionId ?? null)
  }

  useEffect(() => {
    void (async () => {
      await trpc.sessionRescan.mutate()
      await loadSessions()
    })()
  }, [])

  useEffect(() => {
    if (!focusedSessionId) {
      setPreview(null)
      return
    }

    void (async () => {
      const nextPreview = (await trpc.sessionPreview.query({
        sessionId: focusedSessionId,
        query: ''
      })) as SessionPreview
      setPreview(nextPreview)
    })()
  }, [focusedSessionId])

  const previewText =
    preview?.snippet?.snippet ||
    preview?.turns
      ?.map((turn) => `${turn.role}: ${turn.text}`)
      .join('\n\n') ||
    'Select a session from the left to inspect normalized preview text.'

  return (
    <div className="search-layout">
      <SearchRail
        sessions={sessions}
        focusedSessionId={focusedSessionId}
        selectedSessionIds={selectedSessionIds}
        onToggleSession={(sessionId) =>
          setSelectedSessionIds((current) => {
            const next = new Set(current)
            if (next.has(sessionId)) {
              next.delete(sessionId)
            } else {
              next.add(sessionId)
            }
            return next
          })
        }
        onFocusSession={setFocusedSessionId}
        onRescan={() => {
          void (async () => {
            await trpc.sessionRescan.mutate()
            await loadSessions()
          })()
        }}
        onGenerate={async (sessionIds) => {
          const response = (await trpc.generationStart.mutate({
            sessionIds
          })) as {
            jobId: string
            workbookId: string
          }

          props.onWorkbookReady(response)
        }}
      />
      <SessionPreviewPane
        sessionTitle={focusedSession?.title ?? 'No session selected'}
        preview={previewText}
        matchCount={0}
        onPrevMatch={() => undefined}
        onNextMatch={() => undefined}
      />
    </div>
  )
}
