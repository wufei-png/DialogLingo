import { describe, expect, it } from 'vitest'
import {
  createOpenCodeAdapter,
  type OpenCodeCommandRunner
} from '../../../src/main/sources/opencode/adapter'

const filters = {
  query: '',
  timeRange: null,
  projects: [],
  platforms: [],
  includeArchived: false
}

describe('createOpenCodeAdapter', () => {
  it('reconstructs ordered turns from session/message/part fixture files', async () => {
    const adapter = createOpenCodeAdapter('tests/fixtures/opencode')
    const [summary] = await adapter.listSessions(filters)

    const turns = await adapter.readSession(summary.id)

    expect(turns.map((turn) => turn.role)).toEqual(['user', 'assistant'])
    expect(turns[1]?.text).toContain('start with a normalized session index')
  })

  it('reports a typed diagnostic when modern storage lacks a usable CLI', async () => {
    const runner: OpenCodeCommandRunner = () => ({
      exitCode: null,
      stdout: ''
    })
    const adapter = createOpenCodeAdapter(
      'tests/fixtures/opencode-modern/opencode',
      { runCommand: runner }
    )

    await expect(adapter.listSessions(filters)).resolves.toEqual([])
    expect(adapter.getDiagnostics?.()).toEqual([
      expect.objectContaining({ code: 'opencode-cli-unavailable' })
    ])
  })

  it('does not read global CLI data when a path override cannot be bound to it', async () => {
    const runner: OpenCodeCommandRunner = () => {
      throw new Error('CLI must not run for an unverified override')
    }
    const adapter = createOpenCodeAdapter('tests/fixtures/opencode-modern/custom-root', {
      runCommand: runner
    })

    await expect(adapter.listSessions(filters)).resolves.toEqual([])
    expect(adapter.getDiagnostics?.()).toEqual([
      expect.objectContaining({ code: 'opencode-cli-path-unverified' })
    ])
  })
})
