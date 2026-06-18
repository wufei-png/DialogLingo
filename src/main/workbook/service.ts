import BetterSqlite3 from 'better-sqlite3'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'

type DraftItemInput = {
  workbookId: string
  itemType: 'Expression' | 'Sentence'
  generatedSnapshot: unknown
  currentSnapshot: unknown
  sourceRefs: unknown
}

const require = createRequire(import.meta.url)

function resolveNativeBinding() {
  if (process.env.DIALOGLINGO_BETTER_SQLITE3_BINDING) {
    return process.env.DIALOGLINGO_BETTER_SQLITE3_BINDING
  }

  if (!process.versions.electron) {
    return undefined
  }

  // Keep workbook tests on the default Node binding while Electron uses the
  // rebuilt native module captured by the app startup scripts.
  const packageDir = path.dirname(require.resolve('better-sqlite3/package.json'))
  const bindingPath = path.join(
    packageDir,
    'build',
    'Release',
    'better_sqlite3.electron.node'
  )

  return fs.existsSync(bindingPath) ? bindingPath : undefined
}

export function createWorkbookService(
  filename: string,
  options?: { runMigrations?: boolean }
) {
  const nativeBinding = resolveNativeBinding()
  const db = nativeBinding
    ? new BetterSqlite3(filename, { nativeBinding })
    : new BetterSqlite3(filename)

  if (options?.runMigrations) {
    db.exec(`
      create table if not exists workbook_items (
        id text primary key,
        workbook_id text not null,
        item_type text not null,
        generated_snapshot_json text not null,
        current_snapshot_json text not null,
        source_refs_json text not null,
        state text not null
      );

      create table if not exists workbook_item_revisions (
        id text primary key,
        workbook_item_id text not null,
        action_type text not null,
        before_json text not null,
        after_json text not null,
        created_at text not null
      );
    `)
  }

  return {
    insertDraftItem(input: DraftItemInput) {
      const id = crypto.randomUUID()
      db.prepare(
        `
          insert into workbook_items (
            id,
            workbook_id,
            item_type,
            generated_snapshot_json,
            current_snapshot_json,
            source_refs_json,
            state
          )
          values (?, ?, ?, ?, ?, ?, 'active')
        `
      ).run(
        id,
        input.workbookId,
        input.itemType,
        JSON.stringify(input.generatedSnapshot),
        JSON.stringify(input.currentSnapshot),
        JSON.stringify(input.sourceRefs)
      )

      return { id }
    },

    saveCurrentSnapshot(id: string, nextSnapshot: unknown) {
      const row = db
        .prepare('select current_snapshot_json from workbook_items where id = ?')
        .get(id) as { current_snapshot_json: string }

      db.prepare(
        'update workbook_items set current_snapshot_json = ? where id = ?'
      ).run(JSON.stringify(nextSnapshot), id)

      db.prepare(
        `
          insert into workbook_item_revisions (
            id,
            workbook_item_id,
            action_type,
            before_json,
            after_json,
            created_at
          )
          values (?, ?, 'edit', ?, ?, ?)
        `
      ).run(
        crypto.randomUUID(),
        id,
        row.current_snapshot_json,
        JSON.stringify(nextSnapshot),
        new Date().toISOString()
      )
    },

    revertItem(id: string) {
      const row = db
        .prepare('select generated_snapshot_json from workbook_items where id = ?')
        .get(id) as { generated_snapshot_json: string }

      db.prepare(
        'update workbook_items set current_snapshot_json = ? where id = ?'
      ).run(row.generated_snapshot_json, id)
    },

    deleteItem(id: string) {
      db.prepare("update workbook_items set state = 'deleted' where id = ?").run(id)
    },

    restoreItem(id: string) {
      db.prepare("update workbook_items set state = 'active' where id = ?").run(id)
    },

    listDeleted(workbookId: string) {
      return db
        .prepare(
          "select * from workbook_items where workbook_id = ? and state = 'deleted'"
        )
        .all(workbookId)
    },

    listActive(workbookId: string) {
      return db
        .prepare(
          "select * from workbook_items where workbook_id = ? and state = 'active'"
        )
        .all(workbookId)
    },

    listEdited(workbookId: string) {
      return db
        .prepare(
          `
            select *
            from workbook_items
            where workbook_id = ?
              and state = 'active'
              and generated_snapshot_json != current_snapshot_json
          `
        )
        .all(workbookId)
    }
  }
}
