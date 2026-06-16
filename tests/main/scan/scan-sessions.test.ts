import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { scanSessions } from '../../../src/main/scan/scanSessions'
import { createSourceRegistry } from '../../../src/main/sources'
import type { SourceRegistry } from '../../../src/main/sources/types'
import { createTestDb } from '../testDb'

const here = path.dirname(fileURLToPath(import.meta.url))

function fixtureRoot(name: string) {
  return path.resolve(here, '../../fixtures', name)
}

describe('scanSessions', () => {
  it('persists projects, sessions, and turns from the source registry', async () => {
    const db = createTestDb()
    const registry = createSourceRegistry({
      codex: fixtureRoot('codex'),
      claude: fixtureRoot('claude'),
      opencode: fixtureRoot('opencode')
    })

    await scanSessions(db, registry)

    const projectCount = db.prepare('select count(*) as count from projects').get() as {
      count: number
    }
    const sessionCount = db.prepare('select count(*) as count from sessions').get() as {
      count: number
    }
    const turnCount = db
      .prepare('select count(*) as count from session_turns')
      .get() as { count: number }
    const namespacedSession = db
      .prepare("select id from sessions where source_type = 'codex' limit 1")
      .get() as { id: string }
    const namespacedTurn = db
      .prepare(
        "select id from session_turns where session_id = ? limit 1"
      )
      .get(namespacedSession.id) as { id: string }

    expect(projectCount.count).toBeGreaterThan(0)
    expect(sessionCount.count).toBeGreaterThan(0)
    expect(turnCount.count).toBeGreaterThan(0)
    expect(namespacedSession.id.startsWith('codex:')).toBe(true)
    expect(namespacedTurn.id.startsWith(`${namespacedSession.id}:`)).toBe(true)
  })

  it('reuses turns parsed during listing instead of reading the session again', async () => {
    const db = createTestDb()
    const readSession = vi.fn(async () => {
      throw new Error('readSession should not be called when listSessions returned turns')
    })
    const summary = {
      id: 'codex-with-turns',
      sourceType: 'codex' as const,
      title: 'Codex with pre-parsed turns',
      projectPath: '/workspace/dialoglingo',
      startedAt: '2026-06-15T12:00:00.000Z',
      updatedAt: '2026-06-15T12:00:05.000Z',
      preview: 'Need better ranking defaults.',
      locator: '/fixtures/codex-with-turns.jsonl',
      turns: [
        {
          id: 'codex-turn-1',
          role: 'user' as const,
          text: 'Need better ranking defaults.',
          languageHint: 'en' as const,
          sourceSpanRef: '/fixtures/codex-with-turns.jsonl:2'
        }
      ]
    }
    const registry: SourceRegistry = {
      codex: {
        listSessions: async () => [summary],
        readSession
      },
      claude: {
        listSessions: async () => [],
        readSession: async () => []
      },
      opencode: {
        listSessions: async () => [],
        readSession: async () => []
      }
    }

    await scanSessions(db, registry)

    const turn = db
      .prepare('select text, source_span_ref as sourceSpanRef from session_turns limit 1')
      .get() as { text: string; sourceSpanRef: string }

    expect(readSession).not.toHaveBeenCalled()
    expect(turn).toEqual({
      text: 'Need better ranking defaults.',
      sourceSpanRef: '/fixtures/codex-with-turns.jsonl:2'
    })
  })
})
