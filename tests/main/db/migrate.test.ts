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

    expect(migrationCount.count).toBe(3)
    expect(searchRows.count).toBe(1)
  })
})
