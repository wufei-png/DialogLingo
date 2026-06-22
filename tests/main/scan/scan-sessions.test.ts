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

  it('skips unchanged session and turn writes on repeated scans', async () => {
    const db = createTestDb()
    let summary = {
      id: 'codex-repeat',
      sourceType: 'codex' as const,
      title: 'Repeated Codex scan',
      projectPath: '/workspace/dialoglingo',
      startedAt: '2026-06-15T12:00:00.000Z',
      updatedAt: '2026-06-15T12:00:05.000Z',
      preview: 'Need faster launch scans.',
      locator: '/fixtures/codex-repeat.jsonl',
      turns: [
        {
          id: 'codex-turn-1',
          role: 'user' as const,
          text: 'Need faster launch scans.',
          languageHint: 'en' as const,
          sourceSpanRef: '/fixtures/codex-repeat.jsonl:2'
        }
      ]
    }
    const registry: SourceRegistry = {
      codex: {
        listSessions: async () => [summary],
        readSession: async () => []
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

    const firstScan = await scanSessions(db, registry)
    db.exec(`
      create table turn_write_log (kind text not null);

      create trigger turn_write_log_insert after insert on session_turns begin
        insert into turn_write_log(kind) values ('insert');
      end;

      create trigger turn_write_log_delete after delete on session_turns begin
        insert into turn_write_log(kind) values ('delete');
      end;
    `)
    const countTurnWrites = () =>
      (
        db.prepare('select count(*) as count from turn_write_log').get() as {
          count: number
        }
      ).count

    const secondScan = await scanSessions(db, registry)

    expect(firstScan.rewrittenTurnSessionCount).toBe(1)
    expect(secondScan.skippedSessionCount).toBe(1)
    expect(secondScan.rewrittenTurnSessionCount).toBe(0)
    expect(countTurnWrites()).toBe(0)

    summary = {
      ...summary,
      title: 'Renamed Codex scan'
    }
    const metadataOnlyScan = await scanSessions(db, registry)
    const renamed = db
      .prepare("select title from sessions where id = 'codex:codex-repeat'")
      .get() as { title: string }

    expect(metadataOnlyScan.updatedSessionCount).toBe(1)
    expect(metadataOnlyScan.rewrittenTurnSessionCount).toBe(0)
    expect(renamed.title).toBe('Renamed Codex scan')
    expect(countTurnWrites()).toBe(0)
  })

  it('persists adapter-provided and heuristic tool-noise flags', async () => {
    const db = createTestDb()
    const summary = {
      id: 'codex-tool-noise',
      sourceType: 'codex' as const,
      title: 'Codex tool noise',
      projectPath: '/workspace/dialoglingo',
      startedAt: '2026-06-15T12:00:00.000Z',
      updatedAt: '2026-06-15T12:00:05.000Z',
      preview: 'Need better candidate mining.',
      locator: '/fixtures/codex-tool-noise.jsonl',
      turns: [
        {
          id: 'natural',
          role: 'assistant' as const,
          text: 'Need better candidate mining before generation.',
          languageHint: 'en' as const,
          sourceSpanRef: '/fixtures/codex-tool-noise.jsonl:2'
        },
        {
          id: 'adapter-noise',
          role: 'assistant' as const,
          text: 'Adapter-marked tool output.',
          languageHint: 'en' as const,
          sourceSpanRef: '/fixtures/codex-tool-noise.jsonl:3',
          isToolNoise: true
        },
        {
          id: 'heuristic-noise',
          role: 'assistant' as const,
          text: '```ts\nconst value = 1\n```',
          languageHint: 'en' as const,
          sourceSpanRef: '/fixtures/codex-tool-noise.jsonl:4'
        }
      ]
    }
    const registry: SourceRegistry = {
      codex: {
        listSessions: async () => [summary],
        readSession: async () => []
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

    const rows = db
      .prepare(
        `
          select source_span_ref as sourceSpanRef, is_tool_noise as isToolNoise
          from session_turns
          order by seq asc
        `
      )
      .all() as Array<{ sourceSpanRef: string; isToolNoise: number }>

    expect(rows).toEqual([
      {
        sourceSpanRef: '/fixtures/codex-tool-noise.jsonl:2',
        isToolNoise: 0
      },
      {
        sourceSpanRef: '/fixtures/codex-tool-noise.jsonl:3',
        isToolNoise: 1
      },
      {
        sourceSpanRef: '/fixtures/codex-tool-noise.jsonl:4',
        isToolNoise: 1
      }
    ])
  })

  it('passes archived-session preference to source adapters', async () => {
    const db = createTestDb()
    const codexListSessions = vi.fn(async () => [])
    const claudeListSessions = vi.fn(async () => [])
    const opencodeListSessions = vi.fn(async () => [])
    const registry: SourceRegistry = {
      codex: {
        listSessions: codexListSessions,
        readSession: async () => []
      },
      claude: {
        listSessions: claudeListSessions,
        readSession: async () => []
      },
      opencode: {
        listSessions: opencodeListSessions,
        readSession: async () => []
      }
    }

    await scanSessions(db, registry, { includeArchived: true })

    for (const listSessions of [
      codexListSessions,
      claudeListSessions,
      opencodeListSessions
    ]) {
      expect(listSessions).toHaveBeenCalledWith(
        expect.objectContaining({ includeArchived: true })
      )
    }
  })
})
