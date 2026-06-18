import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { logger } from '../logging'

export type DbClient = {
  sqlite: InstanceType<typeof BetterSqlite3>
  db: BetterSQLite3Database
}

const require = createRequire(import.meta.url)

function resolveNativeBinding() {
  if (process.env.DIALOGLINGO_BETTER_SQLITE3_BINDING) {
    return process.env.DIALOGLINGO_BETTER_SQLITE3_BINDING
  }

  if (!process.versions.electron) {
    return undefined
  }

  // Electron and Node need separate better-sqlite3 ABI builds; the dev/build
  // scripts prepare this Electron-specific copy before the app starts.
  const packageDir = path.dirname(require.resolve('better-sqlite3/package.json'))
  const bindingPath = path.join(
    packageDir,
    'build',
    'Release',
    'better_sqlite3.electron.node'
  )

  return fs.existsSync(bindingPath) ? bindingPath : undefined
}

export function createDb(filename: string): DbClient {
  const nativeBinding = resolveNativeBinding()
  logger.debug('db', 'opening sqlite database', {
    filename,
    nativeBinding: nativeBinding ?? 'default'
  })

  const sqlite = nativeBinding
    ? new BetterSqlite3(filename, { nativeBinding })
    : new BetterSqlite3(filename)

  return {
    sqlite,
    db: drizzle(sqlite)
  }
}
