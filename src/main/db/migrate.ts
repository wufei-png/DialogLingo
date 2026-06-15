import fs from 'node:fs'
import path from 'node:path'
import { createDb } from './client'

const dbPath = process.env.DIALOGLINGO_DB_PATH ?? 'dialoglingo.db'
const { sqlite } = createDb(dbPath)
const migrationsDir = path.resolve('src/main/db/migrations')

for (const file of fs
  .readdirSync(migrationsDir)
  .filter((entry) => entry.endsWith('.sql'))
  .sort()) {
  sqlite.exec(fs.readFileSync(path.join(migrationsDir, file), 'utf8'))
}
