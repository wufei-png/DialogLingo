import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createDb } from '../../../src/main/db/client'
import { runMigrations } from '../../../src/main/db/migrate'
import { buildGenericTextBundle } from '../../../src/main/export/genericTextBundle'
import { commitExportDirectory } from '../../../src/main/export/commit'
import { diagnoseStartedExportRuns } from '../../../src/main/export/diagnostics'
import { createExportRunStore } from '../../../src/main/export/runStatus'

function createWorkbook(sqlite: ReturnType<typeof createDb>['sqlite']) {
  sqlite.exec(`
    insert into generation_jobs values ('job', '2026-01-01', 'completed', '{}', 0, '{}');
    insert into workbooks values ('book', 'job', '2026-01-01', 'ready');
  `)
}

describe('started export diagnostics', () => {
  it('finds a complete app-named directory without deleting it', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dialoglingo-diagnostics-'))
    const { sqlite } = createDb(':memory:')
    runMigrations(sqlite)
    createWorkbook(sqlite)
    const store = createExportRunStore(sqlite)
    store.start({
      id: 'run-1',
      workbookId: 'book',
      exportType: 'generic-text-bundle',
      outputPath: root,
      startedAt: '2026-09-21T00:00:00.000Z',
      metadata: { outputName: 'DialogLingo' }
    })
    const output = buildGenericTextBundle({
      workbookId: 'book',
      deckName: 'DialogLingo',
      direction: 'en-zh',
      tagPrefix: 'dialoglingo',
      runId: 'run-1',
      expressions: [],
      sentences: []
    })
    const { ['manifest.json']: _manifest, ...payloadFiles } = output.files
    const committed = await commitExportDirectory({
      parentDirectory: root,
      preferredName: 'DialogLingo',
      manifest: output.manifest,
      files: payloadFiles
    })

    await expect(diagnoseStartedExportRuns(sqlite)).resolves.toEqual([
      {
        runId: 'run-1',
        status: 'complete-directory',
        outputPath: committed.outputPath,
        reason: null
      }
    ])
    expect(fs.existsSync(committed.outputPath)).toBe(true)
    sqlite.close()
  })

  it('reports a missing directory without guessing what to remove', async () => {
    const { sqlite } = createDb(':memory:')
    runMigrations(sqlite)
    createWorkbook(sqlite)
    createExportRunStore(sqlite).start({
      id: 'run-2',
      workbookId: 'book',
      exportType: 'anki-package',
      outputPath: '/tmp/dialoglingo-not-created',
      startedAt: '2026-09-21T00:00:00.000Z',
      metadata: { outputName: 'DialogLingo' }
    })

    await expect(diagnoseStartedExportRuns(sqlite)).resolves.toEqual([
      {
        runId: 'run-2',
        status: 'missing-directory',
        outputPath: '/tmp/dialoglingo-not-created',
        reason: null
      }
    ])
    sqlite.close()
  })
})
