import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createDb } from '../../../src/main/db/client'
import { runMigrations } from '../../../src/main/db/migrate'
import { createSettingsService } from '../../../src/main/settings/service'
import { createWorkbookService } from '../../../src/main/workbook/service'

describe('createWorkbookService', () => {
  it('persists edit revisions, supports revert, and restores deleted items', () => {
    const service = createWorkbookService(':memory:', {
      runMigrations: true
    })

    const item = service.insertDraftItem({
      workbookId: 'w1',
      itemType: 'Expression',
      generatedSnapshot: { sourceText: 'worktree', targetText: '工作树' },
      currentSnapshot: { sourceText: 'worktree', targetText: '工作树' },
      sourceRefs: [
        {
          sessionId: 's1',
          sourceSpanRef: 'span-1',
          excerpt: 'Use a worktree for isolated changes.'
        }
      ]
    })

    service.saveCurrentSnapshot(item.id, {
      sourceText: 'worktree',
      targetText: '工作区'
    })
    expect(service.listEdited('w1')).toHaveLength(1)

    service.revertItem(item.id)
    expect(service.listEdited('w1')).toHaveLength(0)

    service.deleteItem(item.id)
    expect(service.listDeleted('w1')).toHaveLength(1)

    service.restoreItem(item.id)
    expect(service.listActive('w1')).toHaveLength(1)
  })

  it('enforces workbook references and cascades deletes across app connections', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dialoglingo-fk-'))
    const filename = path.join(root, 'app.db')
    const { sqlite: main } = createDb(filename)
    let settings: ReturnType<typeof createSettingsService> | undefined
    let workbook: ReturnType<typeof createWorkbookService> | undefined

    try {
      runMigrations(main)
      expect(main.pragma('foreign_keys', { simple: true })).toBe(1)

      settings = createSettingsService(filename, { runMigrations: true })
      settings.save(settings.get())
      expect(settings.get()).toBeDefined()

      const service = createWorkbookService(filename, { runMigrations: true })
      workbook = service
      const draft = {
        workbookId: 'missing',
        itemType: 'Expression' as const,
        generatedSnapshot: { sourceText: 'sample' },
        currentSnapshot: { sourceText: 'sample' },
        sourceRefs: []
      }
      expect(() => service.insertDraftItem(draft)).toThrow('FOREIGN KEY constraint failed')

      main.prepare(
        `insert into generation_jobs (id, created_at, status, selected_filters_json, selected_session_count, progress_json)
         values ('job', '2026-01-01', 'completed', '{}', 0, '{}')`
      ).run()
      main.prepare(
        "insert into workbooks (id, job_id, created_at, status) values ('book', 'job', '2026-01-01', 'ready')"
      ).run()
      const item = service.insertDraftItem({ ...draft, workbookId: 'book' })
      expect(service.listActive('book')).toHaveLength(1)

      main.prepare("delete from generation_jobs where id = 'job'").run()
      expect(service.listActive('book')).toHaveLength(0)
      expect(main.prepare('select id from workbook_items where id = ?').get(item.id)).toBeUndefined()
    } finally {
      workbook?.close()
      settings?.close()
      main.close()
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})
