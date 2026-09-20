import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createDb } from './client'

type Sqlite = ReturnType<typeof createDb>['sqlite']

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

function databaseFile(sqlite: Sqlite): string | null {
  const main = (sqlite.pragma('database_list') as Array<{ name: string; file: string }>).find(
    (row) => row.name === 'main'
  )
  return main?.file || null
}

function checkDatabase(sqlite: Sqlite, label: string) {
  const integrity = sqlite.pragma('integrity_check') as Array<{ integrity_check: string }>
  if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') {
    throw new Error(
      `${label}: integrity_check failed: ${integrity.map((row) => row.integrity_check).join('; ')}`
    )
  }

  const violations = sqlite.pragma('foreign_key_check') as Array<{
    table: string
    rowid: number | null
    parent: string
  }>
  if (violations.length > 0) {
    const first = violations[0]
    throw new Error(
      `${label}: foreign_key_check found ${violations.length} violation(s); first: ${first.table} rowid=${first.rowid} parent=${first.parent}`
    )
  }
}

function appliedMigrations(sqlite: Sqlite): Set<string> {
  const exists = sqlite
    .prepare("select 1 from sqlite_master where type = 'table' and name = 'schema_migrations'")
    .get()
  if (!exists) {
    return new Set()
  }

  return new Set(
    (sqlite.prepare('select filename from schema_migrations').all() as Array<{ filename: string }>).map(
      (row) => row.filename
    )
  )
}

function snapshotBeforeMigration(sqlite: Sqlite, dbFile: string, backupDir: string): string {
  fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 })
  const backupPath = path.join(
    backupDir,
    `${path.basename(dbFile)}.${new Date().toISOString().replace(/[:.]/g, '-')}.${crypto.randomUUID()}.backup`
  )
  sqlite.prepare('vacuum main into ?').run(backupPath)
  fs.chmodSync(backupPath, 0o600)

  const { sqlite: backup } = createDb(backupPath)
  try {
    checkDatabase(backup, `Migration backup ${backupPath}`)
  } finally {
    backup.close()
  }
  return backupPath
}

export function runMigrations(
  sqlite: Sqlite,
  migrationsDir = resolveDefaultMigrationsDir(),
  options: { backupDir?: string } = {}
) {
  const dbFile = databaseFile(sqlite)
  const label = dbFile ?? 'In-memory database'
  const files = fs.readdirSync(migrationsDir).filter((entry) => entry.endsWith('.sql')).sort()

  try {
    // Check before creating the tracking table or changing the user database.
    checkDatabase(sqlite, label)
    const applied = appliedMigrations(sqlite)
    const pending = files.filter((file) => !applied.has(file))
    if (pending.length === 0) {
      return
    }

    const hasExistingSchema = Boolean(
      sqlite.prepare("select 1 from sqlite_master where type = 'table' limit 1").get()
    )
    if (dbFile && hasExistingSchema) {
      snapshotBeforeMigration(
        sqlite,
        dbFile,
        options.backupDir ?? path.join(path.dirname(dbFile), 'backups')
      )
    }

    sqlite.transaction(() => {
      sqlite.exec(`
        create table if not exists schema_migrations (
          filename text primary key,
          applied_at text not null
        );
      `)

      for (const file of pending) {
        const migration = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
        sqlite.exec(migration)
        sqlite
          .prepare('insert into schema_migrations (filename, applied_at) values (?, ?)')
          .run(file, new Date().toISOString())
      }
    })()
  } catch (error) {
    throw new Error(
      `Database migration failed for ${label}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    )
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dbPath = process.env.DIALOGLINGO_DB_PATH ?? 'dialoglingo.db'
  const { sqlite } = createDb(dbPath)
  try {
    runMigrations(sqlite)
  } finally {
    sqlite.close()
  }
}
