import BetterSqlite3 from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'

export type DbClient = {
  sqlite: InstanceType<typeof BetterSqlite3>
  db: BetterSQLite3Database
}

export function createDb(filename: string): DbClient {
  const sqlite = new BetterSqlite3(filename)

  return {
    sqlite,
    db: drizzle(sqlite)
  }
}
