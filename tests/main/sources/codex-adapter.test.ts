import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  createSqliteSourceScanCache,
  getSourceParserVersion
} from '../../../src/main/sources/cache'
import { createCodexAdapter } from '../../../src/main/sources/codex/adapter'
import { createTestDb } from '../testDb'

describe('createCodexAdapter', () => {
  it('uses an adapter-specific cache parser version', () => {
    expect(getSourceParserVersion('codex')).toBe('codex-parser-v2')
    expect(getSourceParserVersion('claude')).toBe('claude-parser-v2')
    expect(getSourceParserVersion('opencode')).toBe('opencode-parser-v2')
  })

  it('lists sessions from fixture rollouts', async () => {
    const adapter = createCodexAdapter('tests/fixtures/codex')
    const sessions = await adapter.listSessions({
      query: '',
      timeRange: null,
      projects: [],
      platforms: [],
      includeArchived: false
    })

    expect(sessions.map((session) => session.title)).toContain('Codex fixture session')
  })

  it('reads normalized turns from a rollout transcript', async () => {
    const adapter = createCodexAdapter('tests/fixtures/codex')
    const [summary] = await adapter.listSessions({
      query: '',
      timeRange: null,
      projects: [],
      platforms: [],
      includeArchived: false
    })

    const turns = await adapter.readSession(summary.id)

    expect(summary.preview).toContain('Need better ranking')
    expect(summary.preview).not.toContain('environment_context')
    expect(turns.map((turn) => turn.role)).toEqual(['user', 'assistant'])
    expect(turns[0]?.text).toContain('Need better ranking')
    expect(turns.map((turn) => turn.text).join('\n')).not.toContain(
      'environment_context'
    )
  })

  it('reuses cached transcript parses when the Codex rollout file fingerprint is unchanged', async () => {
    const db = createTestDb()
    const cache = createSqliteSourceScanCache(db)
    const adapter = createCodexAdapter('tests/fixtures/codex', { cache })
    const transcriptPath = path.normalize(
      'tests/fixtures/codex/sessions/2026/06/15/rollout-2026-06-15T12-00-00-codex-session-1.jsonl'
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
      expect(sessions[0]?.turns?.[0]?.text).toContain('Need better ranking')
    } finally {
      readFile.mockRestore()
    }
  })
})
