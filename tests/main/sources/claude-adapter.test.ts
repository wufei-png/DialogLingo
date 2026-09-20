import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createSqliteSourceScanCache } from '../../../src/main/sources/cache'
import { createClaudeAdapter } from '../../../src/main/sources/claude/adapter'
import { createTestDb } from '../testDb'

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

  it('keeps valid records and physical source lines when transcript and metadata records are malformed', async () => {
    const db = createTestDb()
    const adapter = createClaudeAdapter({
      cliRoot: 'tests/fixtures/claude-malformed',
      desktopCodeSessionRoot: 'tests/fixtures/claude-malformed-desktop'
    }, { cache: createSqliteSourceScanCache(db) })
    const [summary] = await adapter.listSessions({
      query: '',
      timeRange: null,
      projects: [],
      platforms: [],
      includeArchived: false
    })
    const turns = await adapter.readSession(summary.id, { locator: summary.locator })

    expect(turns).toMatchObject([
      {
        text: 'Keep the valid Claude prompt after a bad line.',
        sourceSpanRef: `${summary.locator}:4`
      },
      {
        text: 'Keep physical source lines stable.',
        sourceSpanRef: `${summary.locator}:5`
      }
    ])
    expect(adapter.getDiagnostics?.()).toEqual([
      expect.objectContaining({ code: 'source-jsonl-line-invalid' }),
      expect.objectContaining({ code: 'source-jsonl-line-invalid' }),
      expect.objectContaining({ code: 'source-jsonl-line-invalid' })
    ])
    expect(
      (db.prepare('select count(*) as count from source_scan_cache').get() as {
        count: number
      }).count
    ).toBe(0)
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

  it('reuses cached transcript parses when the Claude CLI file fingerprint is unchanged', async () => {
    const db = createTestDb()
    const cache = createSqliteSourceScanCache(db)
    const adapter = createClaudeAdapter('tests/fixtures/claude', { cache })
    const transcriptPath = path.normalize(
      'tests/fixtures/claude/projects/-workspace-demo/claude-session-1.jsonl'
    )
    const readFile = vi.spyOn(fs, 'readFileSync')
    const countTranscriptReads = () =>
      readFile.mock.calls.filter(
        ([file]) => path.normalize(String(file)) === transcriptPath
      ).length

    try {
      await adapter.listSessions({
        query: '',
        timeRange: null,
        projects: [],
        platforms: [],
        includeArchived: false
      })
      expect(countTranscriptReads()).toBeGreaterThan(0)

      readFile.mockClear()

      const sessions = await adapter.listSessions({
        query: '',
        timeRange: null,
        projects: [],
        platforms: [],
        includeArchived: false
      })

      expect(countTranscriptReads()).toBe(0)
      expect(sessions[0]?.turns?.[0]?.text).toContain(
        'How should we structure state?'
      )
    } finally {
      readFile.mockRestore()
    }
  })
})
