import { describe, expect, it } from 'vitest'
import { createCodexAdapter } from '../../../src/main/sources/codex/adapter'

describe('createCodexAdapter', () => {
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
})
