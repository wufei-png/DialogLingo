import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createDb } from '../../../src/main/db/client'
import {
  resolveDefaultMigrationsDir,
  runMigrations
} from '../../../src/main/db/migrate'

describe('runMigrations', () => {
  it('resolves the source migrations directory during tests', () => {
    expect(resolveDefaultMigrationsDir()).toContain('src/main/db/migrations')
  })

  it('records applied migrations so the trigram search table is not rebuilt on every run', () => {
    const { sqlite } = createDb(':memory:')

    runMigrations(sqlite)
    sqlite
      .prepare(
        `
          insert into sessions (
            id,
            source_type,
            source_session_id,
            title,
            started_at,
            updated_at,
            preview,
            search_text,
            is_archived,
            raw_locator,
            hash
          )
          values (
            's1',
            'codex',
            's1',
            '日志监控',
            '2026-06-15T00:00:00Z',
            '2026-06-15T00:10:00Z',
            'preview',
            'body',
            0,
            'fixture',
            'h1'
          )
        `
      )
      .run()

    runMigrations(sqlite)

    const migrationCount = sqlite
      .prepare('select count(*) as count from schema_migrations')
      .get() as { count: number }
    const searchRows = sqlite
      .prepare("select count(*) as count from session_search where session_id = 's1'")
      .get() as { count: number }

    expect(migrationCount.count).toBe(5)
    expect(searchRows.count).toBe(1)

    const indexes = sqlite
      .prepare(
        `
          select name
          from sqlite_master
          where type = 'index'
            and name in (
              'session_turns_session_id_seq_idx',
              'sessions_updated_at_idx',
              'sessions_project_updated_at_idx'
            )
          order by name asc
        `
      )
      .all() as Array<{ name: string }>

    expect(indexes.map((row) => row.name)).toEqual([
      'session_turns_session_id_seq_idx',
      'sessions_project_updated_at_idx',
      'sessions_updated_at_idx'
    ])

    const cacheTable = sqlite
      .prepare(
        "select count(*) as count from sqlite_master where type = 'table' and name = 'source_scan_cache'"
      )
      .get() as { count: number }
    const cacheColumns = sqlite
      .prepare("select name from pragma_table_info('source_scan_cache') order by cid")
      .all() as Array<{ name: string }>

    expect(cacheTable.count).toBe(1)
    expect(cacheColumns.map((row) => row.name)).toEqual([
      'source_type',
      'locator',
      'parser_version',
      'size_bytes',
      'mtime_ms',
      'summary_json',
      'turns_json',
      'updated_at'
    ])
  })

  it('backs up an existing disk database only when migrations are pending', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dialoglingo-migrate-'))
    const dbPath = path.join(root, 'app.db')
    const migrationDir = path.join(root, 'migrations')
    const backupDir = path.join(root, 'user-data', 'database-backups')
    fs.mkdirSync(migrationDir)
    fs.writeFileSync(path.join(migrationDir, '0000.sql'), 'create table sample (value text not null);')
    const { sqlite } = createDb(dbPath)

    try {
      runMigrations(sqlite, migrationDir, { backupDir })
      sqlite.prepare('insert into sample (value) values (?)').run('saved')
      runMigrations(sqlite, migrationDir, { backupDir })
      expect(fs.existsSync(backupDir)).toBe(false)

      fs.writeFileSync(path.join(migrationDir, '0001.sql'), 'alter table sample add column extra text;')
      runMigrations(sqlite, migrationDir, { backupDir })
      const backups = fs.readdirSync(backupDir)
      expect(backups).toHaveLength(1)

      const { sqlite: snapshot } = createDb(path.join(backupDir, backups[0]))
      try {
        expect(snapshot.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }])
        expect(snapshot.pragma('foreign_key_check')).toEqual([])
        expect(snapshot.prepare('select value from sample').get()).toEqual({ value: 'saved' })
        expect(snapshot.prepare('select count(*) as count from schema_migrations').get()).toEqual({ count: 1 })
      } finally {
        snapshot.close()
      }
      expect(sqlite.prepare('select value from sample').get()).toEqual({ value: 'saved' })
    } finally {
      sqlite.close()
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('does not write migrations when the backup cannot be created', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dialoglingo-migrate-'))
    const migrationDir = path.join(root, 'migrations')
    fs.mkdirSync(migrationDir)
    fs.writeFileSync(path.join(migrationDir, '0000.sql'), 'create table sample (value text);')
    const { sqlite } = createDb(path.join(root, 'app.db'))

    try {
      runMigrations(sqlite, migrationDir)
      const blocker = path.join(root, 'not-a-directory')
      fs.writeFileSync(blocker, 'block')
      fs.writeFileSync(path.join(migrationDir, '0001.sql'), 'alter table sample add column extra text;')

      expect(() => runMigrations(sqlite, migrationDir, { backupDir: blocker })).toThrow('Database migration failed')
      expect(sqlite.prepare('select count(*) as count from schema_migrations').get()).toEqual({ count: 1 })
      expect(sqlite.prepare("select count(*) as count from pragma_table_info('sample')").get()).toEqual({ count: 1 })
      expect(sqlite.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }])
    } finally {
      sqlite.close()
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('leaves a corrupt disk file untouched when preflight fails', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dialoglingo-migrate-'))
    const dbPath = path.join(root, 'app.db')
    const backupDir = path.join(root, 'backups')
    const invalidBytes = Buffer.from('not a sqlite database')
    fs.writeFileSync(dbPath, invalidBytes)

    try {
      const { sqlite } = createDb(dbPath)
      try {
        expect(() => runMigrations(sqlite, resolveDefaultMigrationsDir(), { backupDir })).toThrow(
          'Database migration failed'
        )
      } finally {
        sqlite.close()
      }
      expect(fs.readFileSync(dbPath)).toEqual(invalidBytes)
      expect(fs.existsSync(backupDir)).toBe(false)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('keeps the original and snapshot usable if a later migration fails', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dialoglingo-migrate-'))
    const migrationDir = path.join(root, 'migrations')
    const backupDir = path.join(root, 'backups')
    fs.mkdirSync(migrationDir)
    fs.writeFileSync(path.join(migrationDir, '0000.sql'), 'create table sample (value text);')
    const { sqlite } = createDb(path.join(root, 'app.db'))

    try {
      runMigrations(sqlite, migrationDir)
      sqlite.prepare('insert into sample (value) values (?)').run('original')
      fs.writeFileSync(path.join(migrationDir, '0001.sql'), 'alter table sample add column extra text;')
      fs.writeFileSync(path.join(migrationDir, '0002.sql'), 'invalid sql;')

      expect(() => runMigrations(sqlite, migrationDir, { backupDir })).toThrow('Database migration failed')
      expect(sqlite.prepare('select value from sample').get()).toEqual({ value: 'original' })
      expect(sqlite.prepare("select count(*) as count from pragma_table_info('sample')").get()).toEqual({ count: 1 })
      expect(sqlite.prepare('select count(*) as count from schema_migrations').get()).toEqual({ count: 1 })

      const backups = fs.readdirSync(backupDir)
      expect(backups).toHaveLength(1)
      const { sqlite: snapshot } = createDb(path.join(backupDir, backups[0]))
      try {
        expect(snapshot.prepare('select value from sample').get()).toEqual({ value: 'original' })
        expect(snapshot.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }])
      } finally {
        snapshot.close()
      }
    } finally {
      sqlite.close()
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})
