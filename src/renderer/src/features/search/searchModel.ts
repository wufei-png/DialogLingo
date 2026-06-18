export type SearchPlatform = 'codex' | 'claude' | 'opencode'
export type SearchGroupBy = 'platform' | 'time' | 'project'
export type SearchQueryScope = 'all' | 'titles' | 'transcript'
export type SearchBootStatus = {
  scanOnLaunch: boolean
  launchPlan: {
    selectedProjectIds: string[]
    focusedSessionId: string | null
    collapsedGroupIds: string[]
  } | null
}

export const PLATFORM_OPTIONS: SearchPlatform[] = ['codex', 'claude', 'opencode']

export const PLATFORM_LABELS: Record<SearchPlatform, string> = {
  codex: 'Codex',
  claude: 'Claude Code',
  opencode: 'OpenCode'
}

type SearchSession = {
  sessionId: string
  title: string
  snippet: string | null
  sourceType: SearchPlatform
  projectPath: string | null
  updatedAt: string
}

export type SessionGroup = {
  id: string
  label: string
  expanded: boolean
  selectedCount: number
  totalCount: number
  rows: Array<{
    sessionId: string
    title: string
    selected: boolean
    focused: boolean
  }>
}

export type SessionTreeVirtualRow =
  | {
      kind: 'group'
      id: string
      group: SessionGroup
    }
  | {
      kind: 'session'
      id: string
      groupId: string
      row: SessionGroup['rows'][number]
    }

export type ProjectOption = {
  id: string
  name: string
  localPath: string
  sourcePlatforms: string[]
}

export function togglePlatformFilter(
  current: SearchPlatform[],
  platform: SearchPlatform
) {
  const next = current.includes(platform)
    ? current.filter((value) => value !== platform)
    : [...current, platform]

  return PLATFORM_OPTIONS.filter((value) => next.includes(value))
}

export function resolveSearchBootPlan(status: SearchBootStatus) {
  return {
    shouldManualRescan: false,
    selectedProjectIds: status.launchPlan?.selectedProjectIds,
    focusedSessionId: status.launchPlan?.focusedSessionId ?? null,
    collapsedGroupIds: status.launchPlan?.collapsedGroupIds
  }
}

export function buildSessionSearchInput(input: {
  query: string
  scope: SearchQueryScope
  groupBy: SearchGroupBy
  timeRange: { from: string; to: string } | null
  projects: string[]
  platforms: SearchPlatform[]
  includeArchivedSessions: boolean
}) {
  return {
    query: input.query,
    scope: input.scope,
    groupBy: input.groupBy,
    timeRange: input.timeRange,
    projects: input.projects,
    platforms: input.platforms,
    includeArchived: input.includeArchivedSessions
  }
}

export function areAllSessionIdsSelected(
  sessionIds: string[],
  selectedSessionIds: Set<string>
) {
  return (
    sessionIds.length > 0 &&
    sessionIds.every((sessionId) => selectedSessionIds.has(sessionId))
  )
}

export function applySessionSelection(
  currentSelectedIds: Set<string>,
  sessionIds: string[],
  selected: boolean
) {
  const next = new Set(currentSelectedIds)

  for (const sessionId of sessionIds) {
    if (selected) {
      next.add(sessionId)
    } else {
      next.delete(sessionId)
    }
  }

  return next
}

function getProjectLabel(projectPath: string | null, projects: ProjectOption[]) {
  if (!projectPath) {
    return 'Unassigned'
  }

  return projects.find((project) => project.id === projectPath)?.name ?? projectPath
}

function toDayLabel(updatedAt: string) {
  return updatedAt.slice(0, 10) || 'Unknown date'
}

function compareByUpdatedDesc(left: SearchSession, right: SearchSession) {
  return right.updatedAt.localeCompare(left.updatedAt)
}

function compareByUpdatedAsc(left: SearchSession, right: SearchSession) {
  return left.updatedAt.localeCompare(right.updatedAt)
}

export function groupSessions(input: {
  sessions: SearchSession[]
  groupBy: SearchGroupBy
  projects: ProjectOption[]
  selectedSessionIds: Set<string>
  focusedSessionId: string | null
  collapsedGroupIds: Set<string>
}): SessionGroup[] {
  const buckets = new Map<string, { label: string; sessions: SearchSession[] }>()

  for (const session of input.sessions) {
    const id =
      input.groupBy === 'platform'
        ? session.sourceType
        : input.groupBy === 'time'
          ? toDayLabel(session.updatedAt)
          : session.projectPath ?? 'unassigned'
    const label =
      input.groupBy === 'platform'
        ? PLATFORM_LABELS[session.sourceType]
        : input.groupBy === 'time'
          ? id
          : getProjectLabel(session.projectPath, input.projects)

    const bucket = buckets.get(id)
    if (bucket) {
      bucket.sessions.push(session)
    } else {
      buckets.set(id, { label, sessions: [session] })
    }
  }

  return [...buckets.entries()]
    .sort((left, right) => {
      if (input.groupBy === 'time') {
        return right[0].localeCompare(left[0])
      }
      return left[1].label.localeCompare(right[1].label)
    })
    .map(([id, bucket]) => {
      const orderedSessions = [...bucket.sessions].sort(
        input.groupBy === 'time' ? compareByUpdatedAsc : compareByUpdatedDesc
      )
      const rows = orderedSessions
        .map((session) => ({
          sessionId: session.sessionId,
          title: session.title,
          selected: input.selectedSessionIds.has(session.sessionId),
          focused: input.focusedSessionId === session.sessionId
        }))

      return {
        id,
        label: bucket.label,
        expanded: !input.collapsedGroupIds.has(id),
        selectedCount: rows.filter((row) => row.selected).length,
        totalCount: rows.length,
        rows
      }
    })
}

export function flattenSessionTree(groups: SessionGroup[]): SessionTreeVirtualRow[] {
  return groups.flatMap((group) => {
    const header: SessionTreeVirtualRow = {
      kind: 'group',
      id: `group:${group.id}`,
      group
    }

    if (!group.expanded) {
      return [header]
    }

    return [
      header,
      ...group.rows.map((row) => ({
        kind: 'session' as const,
        id: `session:${row.sessionId}`,
        groupId: group.id,
        row
      }))
    ]
  })
}
