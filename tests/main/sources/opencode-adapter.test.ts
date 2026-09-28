import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
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
const modernList = JSON.stringify([
  {
    id: 'ses_modern_active',
    title: 'Modern OpenCode session',
    directory: '/workspace/modern',
    createdAt: 1773143205910,
    updatedAt: 1773143685086,
    archivedAt: null
  },
  {
    id: 'ses_modern_archived',
    title: 'Archived modern session',
    directory: '/workspace/archived',
    createdAt: 1773143205910,
    updatedAt: 1773143690000,
    archivedAt: 1773143690000
  }
])
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
  return async (args) => {
    if (args.at(-1) === '--help') {
      return {
        exitCode: args[0] === 'export' ? 0 : 1,
        stdout: '',
        stderr: args[0] === 'export' ? 'opencode export [sessionID]' : ''
      }
    }
    if (args[0] === 'db' && args[2] === '--format' && args[3] === 'json') {
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
    const runner: OpenCodeCommandRunner = async () => {
      throw new Error('legacy storage must not invoke the CLI')
    }
    const adapter = createOpenCodeAdapter('tests/fixtures/opencode', { runCommand: runner })
    const [summary] = await adapter.listSessions(filters)

    const turns = await adapter.readSession(summary.id)

    expect(turns.map((turn) => turn.role)).toEqual(['user', 'assistant'])
    expect(turns[1]?.text).toContain('start with a normalized session index')
  })

  it('reports a typed diagnostic when modern storage lacks a usable CLI', async () => {
    const runner: OpenCodeCommandRunner = async () => ({
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
    const runner: OpenCodeCommandRunner = async () => {
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

  it('maps the global database list and CLI export while preserving archive and source references', async () => {
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

  it('lists sessions from multiple projects without using the current-project CLI list', async () => {
    const runner = vi.fn(async (args: string[]) => {
      if (args.join(' ') === 'export --help') {
        return { exitCode: 0, stdout: '', stderr: 'opencode export [sessionID]' }
      }
      if (args[0] === 'db') {
        return {
          exitCode: 0,
          stdout: JSON.stringify([
            {
              id: 'ses_first_project',
              title: 'First project',
              directory: '/workspace/first',
              createdAt: 1773143205910,
              updatedAt: 1773143685086,
              archivedAt: null
            },
            {
              id: 'ses_second_project',
              title: 'Second project',
              directory: '/workspace/second',
              createdAt: 1773143205910,
              updatedAt: 1773143685086,
              archivedAt: null
            }
          ])
        }
      }
      return { exitCode: 1, stdout: '' }
    })
    const adapter = createOpenCodeAdapter(modernRoot, { runCommand: runner })

    const sessions = await adapter.listSessions(filters)

    expect(sessions.map(({ id, projectPath }) => [id, projectPath])).toEqual([
      ['ses_first_project', '/workspace/first'],
      ['ses_second_project', '/workspace/second']
    ])
    expect(runner.mock.calls.some(([args]) => args[0] === 'session' && args[1] === 'list'))
      .toBe(false)
    expect(adapter.getDiagnostics?.()).toEqual([])
  })

  it.each([
    { name: 'an unsupported database command', result: { exitCode: 1, stdout: '' } },
    {
      name: 'an incomplete database row',
      result: { exitCode: 0, stdout: '[{"id":"ses_missing_fields"}]' }
    },
    { name: 'a non-array database result', result: { exitCode: 0, stdout: '{"sessions":[]}' } }
  ])('reports $name without silently returning a scoped list', async ({ result }) => {
    const runner = vi.fn(async (args: string[]) => {
      if (args.join(' ') === 'export --help') {
        return { exitCode: 0, stdout: '', stderr: 'opencode export [sessionID]' }
      }
      return result
    })
    const adapter = createOpenCodeAdapter(modernRoot, { runCommand: runner })

    await expect(adapter.listSessions(filters)).resolves.toEqual([])
    expect(adapter.getDiagnostics?.()).toEqual([
      expect.objectContaining({ code: 'opencode-cli-global-list-unsupported' })
    ])
    expect(runner.mock.calls.some(([args]) => args[0] === 'session' && args[1] === 'list'))
      .toBe(false)
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
    expect(cacheVersion.parserVersion).toBe('opencode-parser-v3')
  })

  it('reuses the export capability probe within a scan', async () => {
    const runner = vi.fn(modernRunner())
    const adapter = createOpenCodeAdapter(modernRoot, { runCommand: runner })

    await adapter.listSessions(filters)
    await adapter.readSession('ses_modern_active', { locator: 'opencode-cli:ses_modern_active' })
    await adapter.readSession('ses_modern_active', { locator: 'opencode-cli:ses_modern_active' })

    expect(runner.mock.calls.filter(([args]) => args.join(' ') === 'export --help')).toHaveLength(1)
    expect(runner.mock.calls).toContainEqual([
      ['db', expect.stringContaining('from session'), '--format', 'json'],
      expect.objectContaining({ databasePath: path.join(modernRoot, 'opencode.db') })
    ])
    expect(runner.mock.calls.some(([args]) => args[0] === 'session' && args[1] === 'list'))
      .toBe(false)

    await adapter.listSessions(filters)
    expect(runner.mock.calls.filter(([args]) => args.join(' ') === 'export --help')).toHaveLength(2)
  })

  it('invalidates a cached export when the WAL changes without changing the main database', async () => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dialoglingo-opencode-wal-'))
    const sourceRoot = path.join(temporaryRoot, 'opencode')
    fs.mkdirSync(sourceRoot)
    fs.writeFileSync(path.join(sourceRoot, 'opencode.db'), 'synthetic database')
    const db = createTestDb()
    const runner = vi.fn(modernRunner())

    try {
      const adapter = createOpenCodeAdapter(sourceRoot, {
        cache: createSqliteSourceScanCache(db),
        runCommand: runner
      })
      await adapter.readSession('ses_modern_active', { locator: 'opencode-cli:ses_modern_active' })
      const mainStat = fs.statSync(path.join(sourceRoot, 'opencode.db'))
      fs.writeFileSync(path.join(sourceRoot, 'opencode.db-wal'), 'new transaction')
      await adapter.readSession('ses_modern_active', { locator: 'opencode-cli:ses_modern_active' })

      expect(runner.mock.calls.filter(([args]) => args.join(' ') === 'export ses_modern_active'))
        .toHaveLength(2)
      expect(fs.statSync(path.join(sourceRoot, 'opencode.db')).mtimeMs).toBe(mainStat.mtimeMs)
    } finally {
      db.close()
      fs.rmSync(temporaryRoot, { recursive: true, force: true })
    }
  })

  it('rejects a misleading fallback help response', async () => {
    const runner: OpenCodeCommandRunner = async (args) => {
      if (args.join(' ') === 'session export --help') {
        return { exitCode: 0, stdout: '', stderr: 'opencode session\nmanage sessions' }
      }
      if (args.join(' ') === '--version') {
        return { exitCode: 0, stdout: '1.18.11' }
      }
      return { exitCode: 1, stdout: '' }
    }
    const adapter = createOpenCodeAdapter(modernRoot, { runCommand: runner })

    await expect(adapter.listSessions(filters)).resolves.toEqual([])
    expect(adapter.getDiagnostics?.()).toEqual([
      expect.objectContaining({ code: 'opencode-cli-export-unsupported' })
    ])
  })

  it.each([
    ['timeout', 'opencode-cli-timeout'],
    ['output-too-large', 'opencode-cli-output-too-large']
  ] as const)('reports %s when a modern export fails', async (failure, code) => {
    const successfulRunner = modernRunner()
    const runner: OpenCodeCommandRunner = async (args, options) =>
      args.join(' ') === 'export ses_modern_active'
        ? { exitCode: null, stdout: '', failure }
        : successfulRunner(args, options)
    const adapter = createOpenCodeAdapter(modernRoot, { runCommand: runner })

    await expect(adapter.readSession('ses_modern_active', {
      locator: 'opencode-cli:ses_modern_active'
    })).resolves.toEqual([])
    expect(adapter.getDiagnostics?.()).toEqual([
      expect.objectContaining({ code })
    ])
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
    const runner: OpenCodeCommandRunner = async (args) => {
      if (args.at(-1) === '--help') {
        return {
          exitCode: args[0] === 'export' ? 0 : 1,
          stdout: '',
          stderr: args[0] === 'export' ? 'opencode export [sessionID]' : ''
        }
      }
      if (args[0] === 'db' && args[2] === '--format' && args[3] === 'json') {
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
