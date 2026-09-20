import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createDb } from '../../../src/main/db/client'
import { resolveDefaultMigrationsDir, runMigrations } from '../../../src/main/db/migrate'
import { createSessionSearch } from '../../../src/main/search/querySessions'
import { createWorkbookService } from '../../../src/main/workbook/service'

const migrationFiles = fs.readdirSync(resolveDefaultMigrationsDir()).filter((file) => file.endsWith('.sql')).sort()

function historicalDatabase(lastMigration: 0 | 2 | 4) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dialoglingo-upgrade-'))
  const filename = path.join(root, 'app.db')
  const migrationDir = path.join(root, 'migrations')
  const backupDir = path.join(root, 'user-data', 'database-backups')
  fs.mkdirSync(migrationDir)

  function copyThrough(last: number) {
    for (const file of migrationFiles.slice(0, last + 1)) {
      fs.copyFileSync(path.join(resolveDefaultMigrationsDir(), file), path.join(migrationDir, file))
    }
  }

  copyThrough(lastMigration)
  const { sqlite } = createDb(filename)
  runMigrations(sqlite, migrationDir, { backupDir })
  return { root, filename, migrationDir, backupDir, sqlite, copyThrough }
}

function insertRepresentativeRows(sqlite: ReturnType<typeof createDb>['sqlite']) {
  sqlite.exec(`
    insert into projects values ('project', 'Fixture', '/synthetic/project', '["codex"]', '2026-01-01', 0, 1);
    insert into sessions (
      id, source_type, source_session_id, project_id, title, started_at, updated_at,
      preview, search_text, is_archived, raw_locator, hash
    ) values (
      'session', 'codex', 'session', 'project', 'Workbook recovery', '2026-01-01', '2026-01-01',
      'Review the workbook', 'Review the workbook after migration', 0, 'synthetic:session', 'hash'
    );
    insert into session_turns values (
      'turn', 'session', 0, 'user', 'en', 'Review the workbook after migration', 'synthetic:1', 0
    );
    insert into generation_jobs values ('job', '2026-01-01', 'completed', '{}', 1, '{}');
    insert into generation_job_sessions values ('job', 'session', 'Workbook recovery', 'hash');
    insert into workbooks values ('book', 'job', '2026-01-01', 'ready');
    insert into workbook_items values (
      'item', 'book', 'Expression', '{"sourceText":"workbook"}',
      '{"sourceText":"workbook"}', '[{"sessionId":"session"}]', 'active'
    );
    insert into export_runs values (
      'export', 'book', 'anki-text-bundle', '/synthetic/export', '2026-01-01', '{}'
    );
  `)
}

describe('historical database upgrades', () => {
  for (const version of [0, 2, 4] as const) {
    it(`preserves search, workbook, and export data from 000${version}`, () => {
      const fixture = historicalDatabase(version)
      try {
        insertRepresentativeRows(fixture.sqlite)
        fixture.copyThrough(4)
        runMigrations(fixture.sqlite, fixture.migrationDir, { backupDir: fixture.backupDir })

        const search = createSessionSearch(fixture.sqlite)
        const rows = search({
          query: 'workbook',
          scope: 'all',
          groupBy: 'platform',
          timeRange: null,
          projects: [],
          platforms: [],
          includeArchived: false
        })
        expect(rows.map((row) => row.sessionId)).toEqual(['session'])
        expect(fixture.sqlite.prepare('select session_id from session_search').all()).toEqual([
          { session_id: 'session' }
        ])
        expect(fixture.sqlite.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }])
        expect(fixture.sqlite.pragma('foreign_key_check')).toEqual([])
        expect(fixture.sqlite.prepare('select count(*) as count from schema_migrations').get()).toEqual({ count: 5 })
        expect(createWorkbookService(fixture.filename).listActive('book')).toHaveLength(1)
        expect(fixture.sqlite.prepare('select output_path from export_runs where id = ?').get('export')).toEqual({
          output_path: '/synthetic/export'
        })

        if (version < 4) {
          const backups = fs.readdirSync(fixture.backupDir)
          expect(backups).toHaveLength(1)
          const { sqlite: snapshot } = createDb(path.join(fixture.backupDir, backups[0]))
          try {
            expect(snapshot.prepare('select id from workbook_items').get()).toEqual({ id: 'item' })
            expect(snapshot.prepare('select id from export_runs').get()).toEqual({ id: 'export' })
            expect(snapshot.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }])
          } finally {
            snapshot.close()
          }
        } else {
          expect(fs.existsSync(fixture.backupDir)).toBe(false)
        }
      } finally {
        fixture.sqlite.close()
        fs.rmSync(fixture.root, { recursive: true, force: true })
      }
    })
  }

  it('rejects an old orphan row before writing a migration or backup', () => {
    const fixture = historicalDatabase(0)
    try {
      fixture.sqlite.pragma('foreign_keys = OFF')
      fixture.sqlite.exec(`
        insert into session_turns values (
          'orphan', 'missing', 0, 'user', 'en', 'synthetic', 'synthetic:1', 0
        );
      `)
      fixture.sqlite.pragma('foreign_keys = ON')
      fixture.copyThrough(4)

      expect(() => runMigrations(fixture.sqlite, fixture.migrationDir, { backupDir: fixture.backupDir }))
        .toThrow('foreign_key_check found 1 violation')
      expect(fixture.sqlite.prepare('select count(*) as count from schema_migrations').get()).toEqual({ count: 1 })
      expect(fixture.sqlite.prepare('select id from session_turns').get()).toEqual({ id: 'orphan' })
      expect(fs.existsSync(fixture.backupDir)).toBe(false)
    } finally {
      fixture.sqlite.close()
      fs.rmSync(fixture.root, { recursive: true, force: true })
    }
  })

  it('retains the historical original and snapshot when a later migration fails', () => {
    const fixture = historicalDatabase(2)
    try {
      insertRepresentativeRows(fixture.sqlite)
      fixture.copyThrough(4)
      fs.writeFileSync(path.join(fixture.migrationDir, '0005_bad.sql'), 'invalid sql;')
      expect(() => runMigrations(fixture.sqlite, fixture.migrationDir, { backupDir: fixture.backupDir }))
        .toThrow('Database migration failed')
      expect(fixture.sqlite.prepare('select count(*) as count from schema_migrations').get()).toEqual({ count: 3 })
      expect(fixture.sqlite.prepare('select id from workbook_items').get()).toEqual({ id: 'item' })
      expect(fixture.sqlite.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }])

      const backups = fs.readdirSync(fixture.backupDir)
      expect(backups).toHaveLength(1)
      const { sqlite: snapshot } = createDb(path.join(fixture.backupDir, backups[0]))
      try {
        expect(snapshot.prepare('select id from export_runs').get()).toEqual({ id: 'export' })
        expect(snapshot.pragma('foreign_key_check')).toEqual([])
      } finally {
        snapshot.close()
      }
    } finally {
      fixture.sqlite.close()
      fs.rmSync(fixture.root, { recursive: true, force: true })
    }
  })
})
