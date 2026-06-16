import { describe, expect, it } from 'vitest'
import {
  PLATFORM_OPTIONS,
  groupSessions,
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

  it('groups by platform and keeps navigation rows title-only', () => {
    const groups = groupSessions({
      groupBy: 'platform',
      projects,
      focusedSessionId: 's1',
      selectedSessionIds: new Set(['s2']),
      collapsedGroupIds: new Set(['codex']),
      queryActive: false,
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
            selected: false,
            focused: true
          }
        ]
      }
    ])
    expect('snippet' in groups[0].rows[0]).toBe(false)
  })

  it('groups by project and expands matching groups while search is active', () => {
    const groups = groupSessions({
      groupBy: 'project',
      projects,
      focusedSessionId: null,
      selectedSessionIds: new Set(['s2']),
      collapsedGroupIds: new Set(['/workspace/dialoglingo', '/workspace/other']),
      queryActive: true,
      sessions
    })

    expect(groups.map((group) => [group.id, group.label, group.expanded])).toEqual([
      ['/workspace/dialoglingo', 'dialoglingo', true],
      ['/workspace/other', 'other', true]
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
      queryActive: false,
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

  it('keeps selection actions scoped to expanded visible rows', () => {
    const groups = groupSessions({
      groupBy: 'platform',
      projects,
      focusedSessionId: null,
      selectedSessionIds: new Set(['s2']),
      collapsedGroupIds: new Set(['codex']),
      queryActive: false,
      sessions
    })

    const visibleRows = groups
      .filter((group) => group.expanded)
      .flatMap((group) => group.rows)
    const selectAllResult = new Set(['s2'])
    visibleRows.forEach((row) => selectAllResult.add(row.sessionId))

    expect(groups.map((group) => [group.id, group.expanded])).toEqual([
      ['claude', true],
      ['codex', false]
    ])
    expect([...selectAllResult].sort()).toEqual(['s2'])
  })
})
