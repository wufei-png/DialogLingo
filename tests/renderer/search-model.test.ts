import { describe, expect, it } from 'vitest'
import { markHighlightedText } from '../../src/shared/highlight'
import {
  PLATFORM_OPTIONS,
  applySessionSelection,
  areAllSessionIdsSelected,
  buildSessionSearchInput,
  findSessionTreeNavigationRow,
  flattenSessionTree,
  getSessionTreeSessionRowId,
  groupSessions,
  moveSessionTreeNavigation,
  reconcileSessionTreeNavigation,
  resolveSearchBootPlan,
  togglePlatformFilter
} from '../../src/renderer/src/features/search/searchModel'

const projects = [
  {
    id: '/workspace/dialoglingo',
    name: 'dialoglingo',
    localPath: '/workspace/dialoglingo',
    sourcePlatforms: ['codex']
  },
  {
    id: '/workspace/other',
    name: 'other',
    localPath: '/workspace/other',
    sourcePlatforms: ['claude']
  }
]

const sessions = [
  {
    sessionId: 's1',
    title: 'A very long Codex title',
    snippet: 'This preview must stay out of the navigation row',
    sourceType: 'codex' as const,
    projectPath: '/workspace/dialoglingo',
    updatedAt: '2026-06-15T10:00:00.000Z'
  },
  {
    sessionId: 's2',
    title: 'Claude title',
    snippet: 'Hidden by platform filter',
    sourceType: 'claude' as const,
    projectPath: '/workspace/other',
    updatedAt: '2026-06-14T10:00:00.000Z'
  }
]

describe('searchModel', () => {
  it('toggles platform filters while preserving platform order', () => {
    expect(togglePlatformFilter([...PLATFORM_OPTIONS], 'claude')).toEqual([
      'codex',
      'opencode'
    ])
    expect(togglePlatformFilter(['opencode'], 'codex')).toEqual(['codex', 'opencode'])
  })

  it('does not request a manual rescan during search boot', () => {
    const disabled = resolveSearchBootPlan({
      scanOnLaunch: false,
      launchPlan: null
    })
    const enabled = resolveSearchBootPlan({
      scanOnLaunch: true,
      launchPlan: {
        selectedProjectIds: ['p1'],
        focusedSessionId: 's1',
        collapsedGroupIds: ['codex']
      }
    })

    expect(disabled.shouldManualRescan).toBe(false)
    expect(enabled.shouldManualRescan).toBe(false)
    expect(enabled.selectedProjectIds).toEqual(['p1'])
    expect(enabled.focusedSessionId).toBe('s1')
    expect(enabled.collapsedGroupIds).toEqual(['codex'])
  })

  it('maps the archived-session setting into the search input', () => {
    const baseInput = {
      query: 'ranking',
      scope: 'all' as const,
      groupBy: 'platform' as const,
      timeRange: null,
      projects: ['/workspace/dialoglingo'],
      platforms: ['codex'] as Array<'codex'>
    }

    expect(
      buildSessionSearchInput({
        ...baseInput,
        includeArchivedSessions: false
      }).includeArchived
    ).toBe(false)
    expect(
      buildSessionSearchInput({
        ...baseInput,
        includeArchivedSessions: true
      }).includeArchived
    ).toBe(true)
  })

  it('groups by platform and keeps navigation rows free of transcript snippets', () => {
    const groups = groupSessions({
      groupBy: 'platform',
      projects,
      focusedSessionId: 's1',
      selectedSessionIds: new Set(['s2']),
      collapsedGroupIds: new Set(['codex']),
      sessions: [sessions[0]]
    })

    expect(groups).toEqual([
      {
        id: 'codex',
        label: 'Codex',
        expanded: false,
        selectedCount: 0,
        totalCount: 1,
        rows: [
          {
            sessionId: 's1',
            title: 'A very long Codex title',
            titleSnippet: null,
            selected: false,
            focused: true
          }
        ]
      }
    ])
    expect('snippet' in groups[0].rows[0]).toBe(false)
  })

  it('carries highlighted title snippets into navigation rows', () => {
    const groups = groupSessions({
      groupBy: 'platform',
      projects,
      focusedSessionId: null,
      selectedSessionIds: new Set(),
      collapsedGroupIds: new Set(),
      sessions: [
        {
          ...sessions[0],
          titleSnippet: `A very long ${markHighlightedText('Codex')} title`
        }
      ]
    })

    expect(groups[0].rows[0].titleSnippet).toBe(
      `A very long ${markHighlightedText('Codex')} title`
    )
    expect('snippet' in groups[0].rows[0]).toBe(false)
  })

  it('groups by project without overriding collapsed groups', () => {
    const groups = groupSessions({
      groupBy: 'project',
      projects,
      focusedSessionId: null,
      selectedSessionIds: new Set(['s2']),
      collapsedGroupIds: new Set(['/workspace/dialoglingo', '/workspace/other']),
      sessions
    })

    expect(groups.map((group) => [group.id, group.label, group.expanded])).toEqual([
      ['/workspace/dialoglingo', 'dialoglingo', false],
      ['/workspace/other', 'other', false]
    ])
    expect(groups[1].selectedCount).toBe(1)
  })

  it('groups time by day and sorts sessions inside a day from earlier to later', () => {
    const groups = groupSessions({
      groupBy: 'time',
      projects,
      focusedSessionId: null,
      selectedSessionIds: new Set(),
      collapsedGroupIds: new Set(),
      sessions: [
        sessions[0],
        {
          ...sessions[0],
          sessionId: 's3',
          title: 'Earlier',
          updatedAt: '2026-06-15T08:00:00.000Z'
        }
      ]
    })

    expect(groups[0].id).toBe('2026-06-15')
    expect(groups[0].rows.map((row) => row.sessionId)).toEqual(['s3', 's1'])
  })

  it('flattens tree rows with only expanded group sessions', () => {
    const groups = groupSessions({
      groupBy: 'platform',
      projects,
      focusedSessionId: null,
      selectedSessionIds: new Set(),
      collapsedGroupIds: new Set(['codex']),
      sessions
    })

    expect(flattenSessionTree(groups).map((row) => row.id)).toEqual([
      'group:claude',
      'session:s2',
      'group:codex'
    ])
  })

  it('moves tree navigation through group and session rows', () => {
    const groups = groupSessions({
      groupBy: 'platform',
      projects,
      focusedSessionId: null,
      selectedSessionIds: new Set(),
      collapsedGroupIds: new Set(['codex']),
      sessions
    })

    expect(moveSessionTreeNavigation(groups, null, 1)).toBe('group:claude')
    expect(moveSessionTreeNavigation(groups, null, -1)).toBe('group:codex')
    expect(moveSessionTreeNavigation(groups, 'group:claude', 1)).toBe('session:s2')
    expect(moveSessionTreeNavigation(groups, 'session:s2', 1)).toBe('group:codex')
    expect(moveSessionTreeNavigation(groups, 'missing', 1)).toBe('group:claude')
    expect(reconcileSessionTreeNavigation(groups, 'session:s1')).toBeNull()
    expect(reconcileSessionTreeNavigation(groups, 'group:codex')).toBe('group:codex')
  })

  it('moves tree navigation in visible order and clamps at list edges', () => {
    const groups = groupSessions({
      groupBy: 'platform',
      projects,
      focusedSessionId: null,
      selectedSessionIds: new Set(),
      collapsedGroupIds: new Set(),
      sessions
    })

    expect(flattenSessionTree(groups).map((row) => row.id)).toEqual([
      'group:claude',
      'session:s2',
      'group:codex',
      'session:s1'
    ])
    expect(moveSessionTreeNavigation(groups, 'session:s2', 1)).toBe('group:codex')
    expect(moveSessionTreeNavigation(groups, 'group:codex', 1)).toBe('session:s1')
    expect(moveSessionTreeNavigation(groups, 'session:s1', 1)).toBe('session:s1')
    expect(moveSessionTreeNavigation(groups, 'session:s1', -1)).toBe('group:codex')
    expect(moveSessionTreeNavigation(groups, 'group:claude', -1)).toBe('group:claude')
  })

  it('finds navigation rows for Enter behavior', () => {
    const groups = groupSessions({
      groupBy: 'platform',
      projects,
      focusedSessionId: null,
      selectedSessionIds: new Set(),
      collapsedGroupIds: new Set(),
      sessions
    })

    expect(getSessionTreeSessionRowId('s1')).toBe('session:s1')
    expect(findSessionTreeNavigationRow(groups, 'group:codex')?.kind).toBe('group')
    expect(findSessionTreeNavigationRow(groups, 'session:s1')).toMatchObject({
      kind: 'session',
      row: expect.objectContaining({ sessionId: 's1' })
    })
  })

  it('selects all filtered sessions even when their groups are collapsed', () => {
    const groups = groupSessions({
      groupBy: 'platform',
      projects,
      focusedSessionId: null,
      selectedSessionIds: new Set(['s2']),
      collapsedGroupIds: new Set(['codex']),
      sessions
    })

    const selectAllResult = applySessionSelection(
      new Set(['s2']),
      sessions.map((session) => session.sessionId),
      true
    )

    expect(groups.map((group) => [group.id, group.expanded])).toEqual([
      ['claude', true],
      ['codex', false]
    ])
    expect([...selectAllResult].sort()).toEqual(['s1', 's2'])
  })

  it('detects filter-level all selected state and clears only current results', () => {
    const currentResultIds = sessions.map((session) => session.sessionId)

    expect(areAllSessionIdsSelected([], new Set())).toBe(false)
    expect(areAllSessionIdsSelected(currentResultIds, new Set(['s1']))).toBe(false)
    expect(
      areAllSessionIdsSelected(currentResultIds, new Set(['s1', 's2', 'outside']))
    ).toBe(true)

    const cleared = applySessionSelection(
      new Set(['s1', 's2', 'outside']),
      currentResultIds,
      false
    )

    expect([...cleared].sort()).toEqual(['outside'])
  })

  it('applies group-level selection only to the target group rows', () => {
    const groups = groupSessions({
      groupBy: 'platform',
      projects,
      focusedSessionId: null,
      selectedSessionIds: new Set(['s2', 'outside']),
      collapsedGroupIds: new Set(['codex']),
      sessions
    })
    const codexGroup = groups.find((group) => group.id === 'codex')
    const codexSessionIds = codexGroup?.rows.map((row) => row.sessionId) ?? []

    const selected = applySessionSelection(
      new Set(['s2', 'outside']),
      codexSessionIds,
      true
    )
    const cleared = applySessionSelection(selected, codexSessionIds, false)

    expect(codexSessionIds).toEqual(['s1'])
    expect([...selected].sort()).toEqual(['outside', 's1', 's2'])
    expect([...cleared].sort()).toEqual(['outside', 's2'])
  })
})
