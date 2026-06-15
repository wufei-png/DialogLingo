import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createDb } from './client'

export function runMigrations(
  sqlite: ReturnType<typeof createDb>['sqlite'],
  migrationsDir = path.resolve('src/main/db/migrations')
) {
  for (const file of fs
    .readdirSync(migrationsDir)
    .filter((entry) => entry.endsWith('.sql'))
    .sort()) {
    sqlite.exec(fs.readFileSync(path.join(migrationsDir, file), 'utf8'))
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dbPath = process.env.DIALOGLINGO_DB_PATH ?? 'dialoglingo.db'
  const { sqlite } = createDb(dbPath)
  runMigrations(sqlite)
}
