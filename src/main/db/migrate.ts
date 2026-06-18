import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createDb } from './client'

export function resolveDefaultMigrationsDir() {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url))
  const candidates = [
    path.join(moduleDir, 'db', 'migrations'),
    path.join(moduleDir, 'migrations'),
    path.resolve(process.cwd(), 'src/main/db/migrations')
  ]

  const migrationsDir = candidates.find((candidate) => {
    try {
      return fs.statSync(candidate).isDirectory()
    } catch {
      return false
    }
  })

  if (!migrationsDir) {
    throw new Error(
      `Database migrations directory not found. Checked: ${candidates.join(', ')}`
    )
  }

  return migrationsDir
}

export function runMigrations(
  sqlite: ReturnType<typeof createDb>['sqlite'],
  migrationsDir = resolveDefaultMigrationsDir()
) {
  sqlite.exec(`
    create table if not exists schema_migrations (
      filename text primary key,
      applied_at text not null
    );
  `)

  const applied = new Set(
    sqlite
      .prepare('select filename from schema_migrations')
      .all()
      .map((row) => (row as { filename: string }).filename)
  )

  for (const file of fs
    .readdirSync(migrationsDir)
    .filter((entry) => entry.endsWith('.sql'))
    .sort()) {
    if (applied.has(file)) {
      continue
    }

    const migration = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
    sqlite
      .transaction(() => {
        sqlite.exec(migration)
        sqlite
          .prepare(
            'insert into schema_migrations (filename, applied_at) values (?, ?)'
          )
          .run(file, new Date().toISOString())
      })()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dbPath = process.env.DIALOGLINGO_DB_PATH ?? 'dialoglingo.db'
  const { sqlite } = createDb(dbPath)
  runMigrations(sqlite)
}
