import { createDb } from '../db/client'
import { settingsSchema } from '../../shared/schemas/settings'
import { DEFAULT_SETTINGS } from './defaults'

const CREATE_SETTINGS_TABLE_SQL =
  'create table if not exists settings (id integer primary key check (id = 1), json text not null)'

export function createSettingsService(
  filename: string,
  options?: { runMigrations?: boolean }
) {
  const { sqlite } = createDb(filename)

  if (options?.runMigrations) {
    sqlite.exec(CREATE_SETTINGS_TABLE_SQL)
  }

  return {
    get() {
      const row = sqlite
        .prepare('select json from settings where id = 1')
        .get() as { json?: string } | undefined

      if (!row?.json) {
        return DEFAULT_SETTINGS
      }

      return settingsSchema.parse(JSON.parse(row.json))
    },
    save(nextJson: unknown) {
      const next = settingsSchema.parse(nextJson)

      sqlite
        .prepare(
          'insert into settings (id, json) values (1, ?) on conflict(id) do update set json = excluded.json'
        )
        .run(JSON.stringify(next))

      return next
    },
    reset() {
      const next = settingsSchema.parse(DEFAULT_SETTINGS)

      sqlite
        .prepare(
          'insert into settings (id, json) values (1, ?) on conflict(id) do update set json = excluded.json'
        )
        .run(JSON.stringify(next))

      return next
    }
  }
}
