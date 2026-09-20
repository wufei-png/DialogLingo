import crypto from 'node:crypto'
import { createDb } from '../db/client'
import {
  workbookSnapshotSchema,
  type WorkbookSnapshot
} from '../../shared/schemas/workbook'

type DraftItemInput = {
  workbookId: string
  itemType: 'Expression' | 'Sentence'
  generatedSnapshot: unknown
  currentSnapshot: unknown
  sourceRefs: unknown
}

export function createWorkbookService(
  filename: string,
  options?: { runMigrations?: boolean }
) {
  const { sqlite: db } = createDb(filename)

  if (options?.runMigrations) {
    db.exec(`
      create table if not exists workbook_items (
        id text primary key,
        workbook_id text not null,
        item_type text not null,
        generated_snapshot_json text not null,
        current_snapshot_json text not null,
        source_refs_json text not null,
        state text not null,
        edit_version integer not null default 0
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
    close() {
      db.close()
    },
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

    saveCurrentSnapshot(id: string, nextSnapshot: WorkbookSnapshot, baseVersion: number) {
      return db.transaction(() => {
        const row = db
          .prepare(
            `
              select current_snapshot_json, edit_version, state
              from workbook_items
              where id = ?
            `
          )
          .get(id) as
          | {
              current_snapshot_json: string
              edit_version: number
              state: 'active' | 'deleted'
            }
          | undefined

        if (!row) {
          throw new Error(`Workbook item not found: ${id}`)
        }

        const previousSnapshot = JSON.parse(row.current_snapshot_json) as Record<string, unknown>
        const persistedSnapshot = workbookSnapshotSchema.parse({
          ...nextSnapshot,
          sourceText: previousSnapshot.sourceText,
          ...(typeof previousSnapshot.flagged === 'boolean'
            ? { flagged: previousSnapshot.flagged }
            : {})
        })

        if (row.edit_version !== baseVersion || row.state !== 'active') {
          return {
            status: 'conflict' as const,
            currentSnapshot: previousSnapshot,
            editVersion: row.edit_version
          }
        }

        const nextSnapshotJson = JSON.stringify(persistedSnapshot)
        const update = db
          .prepare(
            `
              update workbook_items
              set current_snapshot_json = ?, edit_version = edit_version + 1
              where id = ? and edit_version = ? and state = 'active'
            `
          )
          .run(nextSnapshotJson, id, baseVersion)

        if (update.changes !== 1) {
          const current = db
            .prepare(
              'select current_snapshot_json, edit_version from workbook_items where id = ?'
            )
            .get(id) as { current_snapshot_json: string; edit_version: number } | undefined
          if (!current) {
            throw new Error(`Workbook item not found: ${id}`)
          }
          return {
            status: 'conflict' as const,
            currentSnapshot: JSON.parse(current.current_snapshot_json) as Record<string, unknown>,
            editVersion: current.edit_version
          }
        }

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
          nextSnapshotJson,
          new Date().toISOString()
        )

        return {
          status: 'saved' as const,
          currentSnapshot: persistedSnapshot,
          editVersion: baseVersion + 1
        }
      })()
    },

    revertItem(id: string, baseVersion: number) {
      return db.transaction(() => {
        const row = db
          .prepare(
            `
              select generated_snapshot_json, current_snapshot_json, edit_version, state
              from workbook_items
              where id = ?
            `
          )
          .get(id) as
          | {
              generated_snapshot_json: string
              current_snapshot_json: string
              edit_version: number
              state: 'active' | 'deleted'
            }
          | undefined
        if (!row) {
          throw new Error(`Workbook item not found: ${id}`)
        }
        if (row.edit_version !== baseVersion || row.state !== 'active') {
          return {
            status: 'conflict' as const,
            currentSnapshot: JSON.parse(row.current_snapshot_json) as Record<string, unknown>,
            editVersion: row.edit_version
          }
        }

        const update = db
          .prepare(
            `
              update workbook_items
              set current_snapshot_json = ?, edit_version = edit_version + 1
              where id = ? and edit_version = ? and state = 'active'
            `
          )
          .run(row.generated_snapshot_json, id, baseVersion)
        if (update.changes !== 1) {
          throw new Error(`Workbook item changed while reverting: ${id}`)
        }
        return {
          status: 'saved' as const,
          currentSnapshot: JSON.parse(row.generated_snapshot_json) as Record<string, unknown>,
          editVersion: baseVersion + 1
        }
      })()
    },

    deleteItem(id: string) {
      return db
        .prepare("update workbook_items set state = 'deleted', edit_version = edit_version + 1 where id = ?")
        .run(id)
    },

    restoreItem(id: string) {
      return db
        .prepare("update workbook_items set state = 'active', edit_version = edit_version + 1 where id = ?")
        .run(id)
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
