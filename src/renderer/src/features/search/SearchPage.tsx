import { useCallback, useEffect, useMemo, useState } from 'react'
import type { NavSectionId } from '../../../../shared/navigation'
import type { Settings } from '../../../../shared/schemas/settings'
import { ResizableSplitPane } from '../../components/ResizableSplitPane'
import { trpc } from '../../lib/trpc'
import {
  PLATFORM_OPTIONS,
  applySessionSelection,
  groupSessions,
  type ProjectOption,
  type SearchGroupBy,
  type SearchPlatform
} from './searchModel'
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

type QueryScope = 'all' | 'titles' | 'transcript'
type TimeRangePreset = 'last-7-days' | 'last-30-days' | 'all-time'

const SOURCE_GROUP_IDS = ['codex', 'claude', 'opencode']

function toTimeRange(preset: TimeRangePreset) {
  if (preset === 'all-time') {
    return null
  }

  const days = preset === 'last-7-days' ? 7 : 30
  const to = new Date()
  const from = new Date(to)
  from.setDate(from.getDate() - days)

  return {
    from: from.toISOString(),
    to: to.toISOString()
  }
}

function countHighlights(value: string) {
  return value.match(/<mark>/g)?.length ?? 0
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function SearchPage(props: {
  activeSection: NavSectionId
  onChangeSection: (section: NavSectionId) => void
  splitRatio: number
  onSplitRatioChange: (ratio: number) => void
  onSplitRatioCommit: (ratio: number) => void
  onOpenSettings: () => void
  onWorkbookReady: (payload: { jobId: string; workbookId: string }) => void
}) {
  const [sessions, setSessions] = useState<SearchSession[]>([])
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [focusedSessionId, setFocusedSessionId] = useState<string | null>(null)
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set())
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set())
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(
    new Set(SOURCE_GROUP_IDS)
  )
  const [platformFilter, setPlatformFilter] = useState<SearchPlatform[]>([
    ...PLATFORM_OPTIONS
  ])
  const [query, setQuery] = useState('')
  const [queryScope, setQueryScope] = useState<QueryScope>('all')
  const [timeRange, setTimeRange] = useState<TimeRangePreset>('last-7-days')
  const [groupBy, setGroupBy] = useState<SearchGroupBy>('platform')
  const [readyToLoad, setReadyToLoad] = useState(false)
  const [projectsReady, setProjectsReady] = useState(false)
  const [preview, setPreview] = useState<SessionPreview | null>(null)
  const [activeMatchIndex, setActiveMatchIndex] = useState(0)
  const [generationError, setGenerationError] = useState<string | null>(null)

  const focusedSession = useMemo(
    () => sessions.find((session) => session.sessionId === focusedSessionId) ?? null,
    [focusedSessionId, sessions]
  )

  const selectedProjectSignature = useMemo(
    () => [...selectedProjectIds].sort().join('|'),
    [selectedProjectIds]
  )

  const groups = useMemo(
    () =>
      groupSessions({
        sessions,
        projects,
        groupBy,
        selectedSessionIds,
        focusedSessionId,
        collapsedGroupIds
      }),
    [
      sessions,
      projects,
      groupBy,
      selectedSessionIds,
      focusedSessionId,
      collapsedGroupIds
    ]
  )

  const loadProjects = useCallback(async (defaultProjectIds?: string[]) => {
    const rows = (await trpc.projectsList.query()) as ProjectOption[]
    const rowIds = new Set(rows.map((row) => row.id))
    setProjects(rows)
    setSelectedProjectIds((current) => {
      if (defaultProjectIds && defaultProjectIds.length > 0) {
        const next = defaultProjectIds.filter((projectId) => rowIds.has(projectId))
        return new Set(next.length > 0 ? next : rows.map((row) => row.id))
      }

      const retained = [...current].filter((projectId) => rowIds.has(projectId))
      return new Set(retained.length > 0 ? retained : rows.map((row) => row.id))
    })
    setProjectsReady(true)
    return rows
  }, [])

  const loadSessions = useCallback(async () => {
    if (platformFilter.length === 0 || selectedProjectIds.size === 0) {
      setSessions([])
      setFocusedSessionId(null)
      setSelectedSessionIds(new Set())
      return
    }

    const rows = (await trpc.sessionSearch.query({
      query,
      scope: queryScope,
      groupBy,
      timeRange: toTimeRange(timeRange),
      projects: [...selectedProjectIds],
      platforms: platformFilter,
      includeArchived: false
    })) as SearchSession[]

    setSessions(rows)
    setSelectedSessionIds((current) => {
      const visibleIds = new Set(rows.map((row) => row.sessionId))
      return new Set([...current].filter((sessionId) => visibleIds.has(sessionId)))
    })
    setFocusedSessionId((current) =>
      rows.some((row) => row.sessionId === current)
        ? current
        : rows[0]?.sessionId ?? null
    )
  }, [
    groupBy,
    platformFilter,
    query,
    queryScope,
    selectedProjectIds,
    timeRange
  ])

  useEffect(() => {
    void (async () => {
      try {
        const status = await trpc.launchScanStatus.query()

        if (!status.scanOnLaunch) {
          await trpc.sessionRescan.mutate()
        }

        if (status.launchPlan?.focusedSessionId) {
          setFocusedSessionId(status.launchPlan.focusedSessionId)
        }
        if (status.launchPlan?.collapsedGroupIds) {
          setCollapsedGroupIds(new Set(status.launchPlan.collapsedGroupIds))
        }
        await loadProjects(status.launchPlan?.selectedProjectIds)
        setReadyToLoad(true)
      } catch {
        await loadProjects()
        setReadyToLoad(true)
      }
    })()
  }, [loadProjects])

  useEffect(() => {
    if (!readyToLoad || !projectsReady) {
      return
    }

    void loadSessions()
  }, [
    readyToLoad,
    projectsReady,
    loadSessions,
    platformFilter.join('|'),
    selectedProjectSignature
  ])

  useEffect(() => {
    if (!focusedSessionId) {
      setPreview(null)
      return
    }

    void (async () => {
      const nextPreview = (await trpc.sessionPreview.query({
        sessionId: focusedSessionId,
        query,
        scope: queryScope
      })) as SessionPreview
      setPreview(nextPreview)
    })()
  }, [focusedSessionId, query, queryScope])

  const previewText =
    preview?.turns
      ?.map((turn) => `${turn.role}: ${turn.text}`)
      .join('\n\n') ||
    preview?.snippet?.snippet ||
    'Select a session from the left to inspect normalized preview text.'
  const matchCount = countHighlights(previewText)

  useEffect(() => {
    setActiveMatchIndex(0)
  }, [previewText])

  function handleGroupByChange(nextGroupBy: SearchGroupBy) {
    setGroupBy(nextGroupBy)
    const nextGroups = groupSessions({
      sessions,
      projects,
      groupBy: nextGroupBy,
      selectedSessionIds,
      focusedSessionId,
      collapsedGroupIds: new Set()
    })
    setCollapsedGroupIds(new Set(nextGroups.map((group) => group.id)))
  }

  async function handleGenerate(sessionIds: string[]) {
    setGenerationError(null)

    if (sessionIds.length === 0) {
      setGenerationError('Select at least one session before generating.')
      return
    }

    try {
      const settings = (await trpc.settingsGet.query()) as Settings
      const missingProvider =
        !settings.provider.baseUrl.trim() ||
        !settings.provider.apiKey.trim() ||
        !settings.provider.defaultModel.trim()
      if (missingProvider) {
        setGenerationError('Configure LiteLLM base URL, API key, and model in Settings first.')
        return
      }

      const response = (await trpc.generationStart.mutate({
        sessionIds
      })) as {
        jobId: string
        workbookId: string
      }

      props.onWorkbookReady(response)
    } catch (error) {
      setGenerationError(getErrorMessage(error))
    }
  }

  return (
    <ResizableSplitPane
      className="search-layout"
      ratio={props.splitRatio}
      onRatioChange={props.onSplitRatioChange}
      onRatioCommit={props.onSplitRatioCommit}
      left={(
        <SearchRail
          activeSection={props.activeSection}
          onChangeSection={props.onChangeSection}
          onOpenSettings={props.onOpenSettings}
          sessions={sessions}
          projects={projects}
          groups={groups}
          focusedSessionId={focusedSessionId}
          selectedSessionIds={selectedSessionIds}
          selectedProjectIds={selectedProjectIds}
          platformFilter={platformFilter}
          query={query}
          queryScope={queryScope}
          timeRange={timeRange}
          groupBy={groupBy}
          generationError={generationError}
          onQueryChange={setQuery}
          onQueryScopeChange={setQueryScope}
          onTimeRangeChange={setTimeRange}
          onGroupByChange={handleGroupByChange}
          onPlatformFilterChange={setPlatformFilter}
          onProjectFilterChange={setSelectedProjectIds}
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
          onSetSessionSelection={(sessionIds, selected) =>
            setSelectedSessionIds((current) =>
              applySessionSelection(current, sessionIds, selected)
            )
          }
          onFocusSession={setFocusedSessionId}
          onToggleGroup={(groupId) =>
            setCollapsedGroupIds((current) => {
              const next = new Set(current)
              if (next.has(groupId)) {
                next.delete(groupId)
              } else {
                next.add(groupId)
              }
              return next
            })
          }
          onRescan={() => {
            void (async () => {
              await trpc.sessionRescan.mutate()
              await loadProjects()
              await loadSessions()
            })()
          }}
          onGenerate={handleGenerate}
      />
      )}
      right={(
        <SessionPreviewPane
          sessionTitle={focusedSession?.title ?? 'No session selected'}
          preview={previewText}
          matchCount={matchCount}
          activeMatchIndex={activeMatchIndex}
          onPrevMatch={() =>
            setActiveMatchIndex((current) =>
              matchCount > 0 ? (current + matchCount - 1) % matchCount : 0
            )
          }
          onNextMatch={() =>
            setActiveMatchIndex((current) =>
              matchCount > 0 ? (current + 1) % matchCount : 0
            )
          }
        />
      )}
    />
  )
}
