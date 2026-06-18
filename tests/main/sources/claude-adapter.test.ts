import { describe, expect, it } from 'vitest'
import { createClaudeAdapter } from '../../../src/main/sources/claude/adapter'

describe('createClaudeAdapter', () => {
  it('reads transcript turns from fixture jsonl', async () => {
    const adapter = createClaudeAdapter('tests/fixtures/claude')
    const [summary] = await adapter.listSessions({
      query: '',
      timeRange: null,
      projects: [],
      platforms: [],
      includeArchived: false
    })

    const turns = await adapter.readSession(summary.id)

    expect(turns.some((turn) => turn.text.includes('How should we structure state?'))).toBe(true)
    expect(
      turns.some((turn) =>
        turn.text.includes('Start with Zustand for local UI intent')
      )
    ).toBe(true)
  })

  it('applies Claude Desktop Code archive metadata to CLI transcripts', async () => {
    const adapter = createClaudeAdapter({
      cliRoot: 'tests/fixtures/claude',
      desktopCodeSessionRoot: 'tests/fixtures/claude-desktop-code'
    })

    const activeSessions = await adapter.listSessions({
      query: '',
      timeRange: null,
      projects: [],
      platforms: [],
      includeArchived: false
    })
    const allSessions = await adapter.listSessions({
      query: '',
      timeRange: null,
      projects: [],
      platforms: [],
      includeArchived: true
    })
    const archived = allSessions.find(
      (session) => session.id === 'claude-session-archived'
    )

    expect(activeSessions.map((session) => session.id)).not.toContain(
      'claude-session-archived'
    )
    expect(archived).toMatchObject({
      id: 'claude-session-archived',
      title: 'Archived Claude Desktop session',
      projectPath: '/workspace/archived',
      archived: true,
      updatedAt: '2026-03-10T11:54:45.086Z'
    })

    const turns = await adapter.readSession('claude-session-archived')

    expect(turns.map((turn) => turn.role)).toEqual(['user', 'assistant'])
    expect(turns[1]?.text).toContain('useful phrasing practice')
  })
})
