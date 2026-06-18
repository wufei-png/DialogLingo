import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { ScanEvent } from '../../../../shared/ipc/events'
import type { Settings } from '../../../../shared/schemas/settings'
import { countHighlightMarkers } from '../../../../shared/highlight'
import { ResizableSplitPane } from '../../components/ResizableSplitPane'
import { trpc } from '../../lib/trpc'
import {
  PLATFORM_LABELS,
  PLATFORM_OPTIONS,
  applySessionSelection,
  buildSessionSearchInput,
  findSessionTreeNavigationRow,
  getSessionTreeSessionRowId,
  groupSessions,
  moveSessionTreeNavigation,
  reconcileSessionTreeNavigation,
  resolveSearchBootPlan,
  type ProjectOption,
  type SearchGroupBy,
  type SearchQueryScope,
  type SessionTreeNavigationId,
  type SearchPlatform
} from './searchModel'
import { SearchRail } from './SearchRail'
import { SessionPreviewPane } from './SessionPreviewPane'

type SearchSession = {
  sessionId: string
  title: string
  titleSnippet: string | null
  snippet: string | null
  sourceType: 'codex' | 'claude' | 'opencode'
  projectPath: string | null
  updatedAt: string
  preview: string
}

type SessionPreview = {
  turns: Array<{ seq: number; role: 'user' | 'assistant'; text: string }>
  snippet: { snippet?: string } | null
}

type TimeRangePreset = 'last-7-days' | 'last-30-days' | 'all-time'
type GenerationPromptPreview = {
  prompt: string
  candidateCount: number
}

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

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function getVisiblePreviewText(preview: SessionPreview | null, fallbackPreview: string) {
  if (preview?.turns && preview.turns.length > 0) {
    return preview.turns.map((turn) => turn.text).join('\n\n')
  }

  return preview?.snippet?.snippet || fallbackPreview
}

function isTextEditingTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable)
  )
}

function shouldLetEnterTargetHandleItself(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (Boolean(target.closest('.session-select-button')) ||
      (Boolean(target.closest('button, a, [role="button"]')) &&
        !target.closest('.session-tree')))
  )
}

export function SearchPage(props: {
  splitRatio: number
  onSplitRatioChange: (ratio: number) => void
  onSplitRatioCommit: (ratio: number) => void
  onOpenSettings: () => void
  onWorkbookReady: (payload: { jobId: string; workbookId: string }) => void
}) {
  const { t } = useTranslation()
  const [sessions, setSessions] = useState<SearchSession[]>([])
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [focusedSessionId, setFocusedSessionId] = useState<string | null>(null)
  const [navigationRowId, setNavigationRowId] = useState<SessionTreeNavigationId | null>(
    null
  )
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set())
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set())
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(
    new Set(SOURCE_GROUP_IDS)
  )
  const [platformFilter, setPlatformFilter] = useState<SearchPlatform[]>([
    ...PLATFORM_OPTIONS
  ])
  const [query, setQuery] = useState('')
  const [queryScope, setQueryScope] = useState<SearchQueryScope>('all')
  const [timeRange, setTimeRange] = useState<TimeRangePreset>('last-7-days')
  const [groupBy, setGroupBy] = useState<SearchGroupBy>('platform')
  const [readyToLoad, setReadyToLoad] = useState(false)
  const [projectsReady, setProjectsReady] = useState(false)
  const [preview, setPreview] = useState<SessionPreview | null>(null)
  const [activeMatchIndex, setActiveMatchIndex] = useState(0)
  const [generationError, setGenerationError] = useState<string | null>(null)
  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: async () => (await trpc.settingsGet.query()) as Settings
  })
  const includeArchivedSessions =
    settingsQuery.data?.scan.includeArchivedSessions ?? false

  const focusedSession = useMemo(
    () => sessions.find((session) => session.sessionId === focusedSessionId) ?? null,
    [focusedSessionId, sessions]
  )
  const fallbackNavigationRowId = focusedSessionId
    ? getSessionTreeSessionRowId(focusedSessionId)
    : null

  const selectedProjectSignature = useMemo(
    () => [...selectedProjectIds].sort().join('|'),
    [selectedProjectIds]
  )
  const searchGroupLabels = useMemo(
    () => ({
      platformLabels: PLATFORM_LABELS,
      unassignedProject: t('search.unassigned'),
      unknownDate: t('search.unknownDate')
    }),
    [t]
  )

  const groups = useMemo(
    () =>
      groupSessions({
        sessions,
        projects,
        groupBy,
        selectedSessionIds,
        focusedSessionId:
          navigationRowId?.startsWith('session:')
            ? navigationRowId.slice('session:'.length)
            : focusedSessionId,
        collapsedGroupIds,
        labels: searchGroupLabels
      }),
    [
      sessions,
      projects,
      groupBy,
      selectedSessionIds,
      navigationRowId,
      focusedSessionId,
      collapsedGroupIds,
      searchGroupLabels
    ]
  )
  const visibleNavigationRowId = useMemo(
    () =>
      reconcileSessionTreeNavigation(
        groups,
        navigationRowId ?? fallbackNavigationRowId
      ),
    [fallbackNavigationRowId, groups, navigationRowId]
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
      setNavigationRowId(null)
      setSelectedSessionIds(new Set())
      return
    }

    const rows = (await trpc.sessionSearch.query(
      buildSessionSearchInput({
        query,
        scope: queryScope,
        groupBy,
        timeRange: toTimeRange(timeRange),
        projects: [...selectedProjectIds],
        platforms: platformFilter,
        includeArchivedSessions
      })
    )) as SearchSession[]

    setSessions(rows)
    setSelectedSessionIds((current) => {
      const visibleIds = new Set(rows.map((row) => row.sessionId))
      return new Set([...current].filter((sessionId) => visibleIds.has(sessionId)))
    })
    setNavigationRowId((current) =>
      current?.startsWith('session:') &&
      rows.some((row) => getSessionTreeSessionRowId(row.sessionId) === current)
        ? current
        : null
    )
    setFocusedSessionId((current) =>
      rows.some((row) => row.sessionId === current)
        ? current
        : rows[0]?.sessionId ?? null
    )
  }, [
    groupBy,
    includeArchivedSessions,
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
        const bootPlan = resolveSearchBootPlan(status)

        if (bootPlan.focusedSessionId) {
          setFocusedSessionId(bootPlan.focusedSessionId)
        }
        if (bootPlan.collapsedGroupIds) {
          setCollapsedGroupIds(new Set(bootPlan.collapsedGroupIds))
        }
        await loadProjects(bootPlan.selectedProjectIds)
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
    const unsubscribe = window.dialoglingoScan?.subscribe((event: ScanEvent) => {
      if (event.phase !== 'completed') {
        return
      }

      void (async () => {
        await loadProjects()
        await loadSessions()
      })()
    })

    return () => {
      unsubscribe?.()
    }
  }, [loadProjects, loadSessions])

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

  const emptyPreviewText = t('search.emptyPreview')
  const previewTurns = preview?.turns ?? []
  const fallbackPreview = preview?.snippet?.snippet || emptyPreviewText
  const visiblePreviewText = getVisiblePreviewText(preview, emptyPreviewText)
  const enablePreviewHighlights = query.trim().length > 0
  const matchCount = enablePreviewHighlights
    ? countHighlightMarkers(focusedSession?.titleSnippet) +
      countHighlightMarkers(visiblePreviewText)
    : 0

  useEffect(() => {
    setActiveMatchIndex(0)
  }, [focusedSession?.titleSnippet, visiblePreviewText])

  function handleGroupByChange(nextGroupBy: SearchGroupBy) {
    setGroupBy(nextGroupBy)
    const nextGroups = groupSessions({
      sessions,
      projects,
      groupBy: nextGroupBy,
      selectedSessionIds,
      focusedSessionId,
      collapsedGroupIds: new Set(),
      labels: searchGroupLabels
    })
    setCollapsedGroupIds(new Set(nextGroups.map((group) => group.id)))
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isTextEditingTarget(event.target)) {
        return
      }

      if (event.key === 'j' || event.key === 'ArrowDown') {
        event.preventDefault()
        setNavigationRowId((current) =>
          moveSessionTreeNavigation(groups, current ?? fallbackNavigationRowId, 1)
        )
        return
      }

      if (event.key === 'k' || event.key === 'ArrowUp') {
        event.preventDefault()
        setNavigationRowId((current) =>
          moveSessionTreeNavigation(groups, current ?? fallbackNavigationRowId, -1)
        )
        return
      }

      if (event.key === 'Enter') {
        if (shouldLetEnterTargetHandleItself(event.target)) {
          return
        }

        const currentRowId =
          reconcileSessionTreeNavigation(groups, navigationRowId ?? fallbackNavigationRowId) ??
          moveSessionTreeNavigation(groups, null, 1)
        const currentRow = findSessionTreeNavigationRow(groups, currentRowId)
        if (!currentRow) {
          return
        }

        event.preventDefault()
        setNavigationRowId(currentRow.id)
        if (currentRow.kind === 'group') {
          setCollapsedGroupIds((current) => {
            const next = new Set(current)
            if (next.has(currentRow.group.id)) {
              next.delete(currentRow.group.id)
            } else {
              next.add(currentRow.group.id)
            }
            return next
          })
          return
        }

        setFocusedSessionId(currentRow.row.sessionId)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [fallbackNavigationRowId, groups, navigationRowId])

  const loadGenerationPromptPreview = useCallback(async (sessionIds: string[]) => {
    return (await trpc.generationPromptPreview.query({
      sessionIds
    })) as GenerationPromptPreview
  }, [])

  async function handleGenerate(sessionIds: string[], promptOverride: string | null) {
    setGenerationError(null)

    if (sessionIds.length === 0) {
      setGenerationError(t('search.noSessionSelected'))
      return
    }

    try {
      const response = (await trpc.generationStart.mutate({
        sessionIds,
        promptOverride
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
          navigationRowId={visibleNavigationRowId}
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
          onNavigateRow={setNavigationRowId}
          onFocusSession={(sessionId) => {
            setFocusedSessionId(sessionId)
            setNavigationRowId(getSessionTreeSessionRowId(sessionId))
          }}
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
          onPromptPreview={loadGenerationPromptPreview}
          onGenerate={handleGenerate}
      />
      )}
      right={(
        <SessionPreviewPane
          sessionTitle={focusedSession?.title ?? 'No session selected'}
          sessionTitleSnippet={focusedSession?.titleSnippet ?? null}
          turns={previewTurns}
          fallbackPreview={fallbackPreview}
          enableHighlights={enablePreviewHighlights}
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
