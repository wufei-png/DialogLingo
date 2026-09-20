import { describe, expect, it, vi } from 'vitest'
import { scanSessions } from '../../../src/main/scan/scanSessions'
import { createPreviewQuery } from '../../../src/main/search/queryPreview'
import { createSqliteSourceScanCache } from '../../../src/main/sources/cache'
import type { SourceRegistry } from '../../../src/main/sources/types'
import { createTestDb } from '../testDb'
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

const modernRoot = 'tests/fixtures/opencode-modern/opencode'
const modernList = JSON.stringify({
  sessions: [
    {
      id: 'ses_modern_active',
      title: 'Modern OpenCode session',
      directory: '/workspace/modern',
      time: { created: 1773143205910, updated: 1773143685086 }
    },
    {
      id: 'ses_modern_archived',
      title: 'Archived modern session',
      directory: '/workspace/archived',
      archived: 1773143690000,
      time: { created: 1773143205910, updated: 1773143690000 }
    }
  ]
})
const modernExport = JSON.stringify({
  session: {
    id: 'ses_modern_active',
    title: 'Modern OpenCode session',
    directory: '/workspace/modern',
    time: { created: 1773143205910, updated: 1773143685086 }
  },
  messages: [
    {
      info: { id: 'msg_modern_user', role: 'user' },
      parts: [{ type: 'text', text: 'How should modern exports preserve source spans?' }]
    },
    {
      info: { id: 'msg_modern_assistant', role: 'assistant' },
      parts: [{ type: 'text', text: 'Keep a stable message identifier in every source reference.' }]
    }
  ]
})

function modernRunner(): OpenCodeCommandRunner {
  return (args) => {
    if (args.at(-1) === '--help') {
      return { exitCode: args[0] === 'export' ? 0 : 1, stdout: '' }
    }
    if (args.join(' ') === 'session list --format json') {
      return { exitCode: 0, stdout: modernList }
    }
    if (args.join(' ') === 'export ses_modern_active') {
      return { exitCode: 0, stdout: modernExport }
    }
    return { exitCode: 1, stdout: '' }
  }
}

describe('createOpenCodeAdapter', () => {
  it('reconstructs ordered turns from session/message/part fixture files', async () => {
    const runner: OpenCodeCommandRunner = () => {
      throw new Error('legacy storage must not invoke the CLI')
    }
    const adapter = createOpenCodeAdapter('tests/fixtures/opencode', { runCommand: runner })
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

  it('maps supported CLI list and export output while preserving archive and source references', async () => {
    const adapter = createOpenCodeAdapter(modernRoot, { runCommand: modernRunner() })

    const sessions = await adapter.listSessions(filters)
    const allSessions = await adapter.listSessions({ ...filters, includeArchived: true })
    const turns = await adapter.readSession('ses_modern_active', {
      locator: 'opencode-cli:ses_modern_active'
    })

    expect(sessions).toMatchObject([
      {
        id: 'ses_modern_active',
        projectPath: '/workspace/modern',
        locator: 'opencode-cli:ses_modern_active'
      }
    ])
    expect(allSessions.map((session) => session.id)).toEqual([
      'ses_modern_archived',
      'ses_modern_active'
    ])
    expect(turns).toMatchObject([
      {
        role: 'user',
        sourceSpanRef: 'opencode-cli:ses_modern_active:message:msg_modern_user'
      },
      {
        role: 'assistant',
        sourceSpanRef: 'opencode-cli:ses_modern_active:message:msg_modern_assistant'
      }
    ])
  })

  it('caches a modern CLI export with the OpenCode parser version', async () => {
    const db = createTestDb()
    const cache = createSqliteSourceScanCache(db)
    const runner = vi.fn(modernRunner())
    const adapter = createOpenCodeAdapter(modernRoot, { cache, runCommand: runner })

    await adapter.readSession('ses_modern_active', {
      locator: 'opencode-cli:ses_modern_active'
    })
    runner.mockClear()
    const turns = await adapter.readSession('ses_modern_active', {
      locator: 'opencode-cli:ses_modern_active'
    })
    const cacheVersion = db
      .prepare('select parser_version as parserVersion from source_scan_cache')
      .get() as { parserVersion: string }

    expect(turns).toHaveLength(2)
    expect(runner).not.toHaveBeenCalled()
    expect(cacheVersion.parserVersion).toBe('opencode-parser-v2')
  })

  it('carries modern CLI turns through scan, search, and preview', async () => {
    const db = createTestDb()
    const opencode = createOpenCodeAdapter(modernRoot, { runCommand: modernRunner() })
    const registry: SourceRegistry = {
      codex: { listSessions: async () => [], readSession: async () => [] },
      claude: { listSessions: async () => [], readSession: async () => [] },
      opencode
    }

    await scanSessions(db, registry)
    const searched = db
      .prepare('select id from sessions where search_text like ?')
      .all('%stable message identifier%') as Array<{ id: string }>
    const preview = createPreviewQuery(
      db
    )('opencode:ses_modern_active', 'source spans', 'transcript')

    expect(searched).toEqual([{ id: 'opencode:ses_modern_active' }])
    expect(preview.turns[0]?.sourceSpanRef).toBe(
      'opencode-cli:ses_modern_active:message:msg_modern_user'
    )
    expect(preview.turns[0]?.text).toContain('source spans')
  })

  it('keeps indexed modern turns when a later CLI export fails', async () => {
    let allowExport = true
    const runner: OpenCodeCommandRunner = (args) => {
      if (args.at(-1) === '--help') {
        return { exitCode: args[0] === 'export' ? 0 : 1, stdout: '' }
      }
      if (args.join(' ') === 'session list --format json') {
        return { exitCode: 0, stdout: modernList }
      }
      if (args.join(' ') === 'export ses_modern_active') {
        return allowExport
          ? { exitCode: 0, stdout: modernExport }
          : { exitCode: 1, stdout: '' }
      }
      return { exitCode: 1, stdout: '' }
    }
    const db = createTestDb()
    const opencode = createOpenCodeAdapter(modernRoot, { runCommand: runner })
    const registry: SourceRegistry = {
      codex: { listSessions: async () => [], readSession: async () => [] },
      claude: { listSessions: async () => [], readSession: async () => [] },
      opencode
    }

    await scanSessions(db, registry)
    allowExport = false
    const result = await scanSessions(db, registry)
    const turns = db
      .prepare('select text from session_turns where session_id = ? order by seq')
      .all('opencode:ses_modern_active') as Array<{ text: string }>

    expect(result.unreadableSessionCount).toBe(1)
    expect(turns).toEqual([
      { text: 'How should modern exports preserve source spans?' },
      { text: 'Keep a stable message identifier in every source reference.' }
    ])
  })
})
