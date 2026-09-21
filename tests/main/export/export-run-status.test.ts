import { describe, expect, it } from 'vitest'
import { createDb } from '../../../src/main/db/client'
import { runMigrations } from '../../../src/main/db/migrate'
import {
  classifyExportFailure,
  createExportRunStore,
  exportErrorMessage
} from '../../../src/main/export/runStatus'

function createWorkbook(sqlite: ReturnType<typeof createDb>['sqlite']) {
  sqlite.exec(`
    insert into generation_jobs values ('job', '2026-01-01', 'completed', '{}', 0, '{}');
    insert into workbooks values ('book', 'job', '2026-01-01', 'ready');
  `)
}

describe('export run status', () => {
  it('records started and completed lifecycle data', () => {
    const { sqlite } = createDb(':memory:')
    runMigrations(sqlite)
    createWorkbook(sqlite)
    const store = createExportRunStore(sqlite)

    store.start({
      id: 'run-1',
      workbookId: 'book',
      exportType: 'anki-text-bundle',
      outputPath: '/tmp/staging',
      startedAt: '2026-09-21T00:00:00.000Z',
      metadata: { phase: 'started' }
    })

    expect(sqlite.prepare('select status, started_at, completed_at from export_runs').get()).toEqual({
      status: 'started',
      started_at: '2026-09-21T00:00:00.000Z',
      completed_at: null
    })

    store.complete({
      id: 'run-1',
      outputPath: '/tmp/final',
      completedAt: '2026-09-21T00:00:01.000Z',
      metadata: { phase: 'completed' }
    })

    expect(
      sqlite
        .prepare('select status, output_path, completed_at, error_code from export_runs')
        .get()
    ).toEqual({
      status: 'completed',
      output_path: '/tmp/final',
      completed_at: '2026-09-21T00:00:01.000Z',
      error_code: null
    })
    sqlite.close()
  })

  it('records bounded failure diagnostics without changing the requested output', () => {
    const { sqlite } = createDb(':memory:')
    runMigrations(sqlite)
    createWorkbook(sqlite)
    const store = createExportRunStore(sqlite)
    store.start({
      id: 'run-2',
      workbookId: 'book',
      exportType: 'anki-package',
      outputPath: '/tmp/final',
      startedAt: '2026-09-21T00:00:00.000Z'
    })

    store.fail({
      id: 'run-2',
      failedAt: '2026-09-21T00:00:02.000Z',
      code: 'payload-write-failed',
      message: 'x'.repeat(600)
    })

    const row = sqlite
      .prepare('select status, output_path, error_code, length(error_message) as error_length from export_runs')
      .get()
    expect(row).toEqual({
      status: 'failed',
      output_path: '/tmp/final',
      error_code: 'payload-write-failed',
      error_length: 500
    })
    sqlite.close()
  })

  it('maps output and build failures to finite diagnostic codes', () => {
    expect(classifyExportFailure({ code: 'EACCES' })).toBe('invalid-output-location')
    expect(classifyExportFailure(new Error('invalid package'), 'build')).toBe('package-build-failed')
    expect(classifyExportFailure(new Error('db'), 'database')).toBe('database-update-failed')
    expect(exportErrorMessage('\u0000bad')).toBe('bad')
  })
})
