import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createDb } from '../../../src/main/db/client'
import { runMigrations } from '../../../src/main/db/migrate'
import { createSettingsService } from '../../../src/main/settings/service'
import { createWorkbookService } from '../../../src/main/workbook/service'

function snapshot(overrides: Partial<{
  sourceText: string
  targetText: string
  gloss: string
  explanation: string
  contextText: string
  quizPrompt: string
  quizAnswer: string
  tags: string[]
  flagged: boolean
}> = {}) {
  return {
    sourceText: 'worktree',
    targetText: '工作树',
    gloss: 'an isolated checkout',
    explanation: 'Use one for independent changes.',
    contextText: 'Use a worktree for isolated changes.',
    quizPrompt: 'What isolates a checkout?',
    quizAnswer: 'A worktree.',
    tags: ['git'],
    ...overrides
  }
}

describe('createWorkbookService', () => {
  it('persists edit revisions, supports revert, and restores deleted items', () => {
    const service = createWorkbookService(':memory:', {
      runMigrations: true
    })

    const item = service.insertDraftItem({
      workbookId: 'w1',
      itemType: 'Expression',
      generatedSnapshot: snapshot(),
      currentSnapshot: snapshot(),
      sourceRefs: [
        {
          sessionId: 's1',
          sourceSpanRef: 'span-1',
          excerpt: 'Use a worktree for isolated changes.'
        }
      ]
    })

    expect(service.saveCurrentSnapshot(item.id, snapshot({ targetText: '工作区' }), 0)).toMatchObject({
      status: 'saved',
      editVersion: 1
    })
    expect(service.listEdited('w1')).toHaveLength(1)

    expect(service.revertItem(item.id, 1)).toMatchObject({ status: 'saved', editVersion: 2 })
    expect(service.listEdited('w1')).toHaveLength(0)

    service.deleteItem(item.id)
    expect(service.listDeleted('w1')).toHaveLength(1)

    service.restoreItem(item.id)
    expect(service.listActive('w1')).toHaveLength(1)
  })

  it('uses compare-and-swap versions and preserves the original source and flag', () => {
    const service = createWorkbookService(':memory:', { runMigrations: true })
    const item = service.insertDraftItem({
      workbookId: 'w1',
      itemType: 'Expression',
      generatedSnapshot: snapshot({ flagged: true }),
      currentSnapshot: snapshot({ flagged: true }),
      sourceRefs: []
    })

    const saved = service.saveCurrentSnapshot(
      item.id,
      snapshot({ sourceText: 'untrusted replacement', targetText: '工作区', flagged: false }),
      0
    )
    expect(saved).toEqual({
      status: 'saved',
      currentSnapshot: snapshot({ targetText: '工作区', flagged: true }),
      editVersion: 1
    })

    expect(service.saveCurrentSnapshot(item.id, snapshot({ targetText: 'stale' }), 0)).toEqual({
      status: 'conflict',
      currentSnapshot: snapshot({ targetText: '工作区', flagged: true }),
      editVersion: 1
    })
    expect(service.revertItem(item.id, 1)).toMatchObject({ status: 'saved', editVersion: 2 })
    expect(service.saveCurrentSnapshot(item.id, snapshot({ targetText: 'old in flight' }), 1)).toMatchObject({
      status: 'conflict',
      currentSnapshot: snapshot({ flagged: true }),
      editVersion: 2
    })
    service.close()
  })

  it('rolls back the snapshot and version when revision insertion fails', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dialoglingo-workbook-'))
    const filename = path.join(root, 'app.db')
    const { sqlite } = createDb(filename)
    let service: ReturnType<typeof createWorkbookService> | undefined

    try {
      runMigrations(sqlite)
      sqlite.exec(`
        insert into generation_jobs values ('job', '2026-01-01', 'completed', '{}', 0, '{}');
        insert into workbooks values ('book', 'job', '2026-01-01', 'ready');
      `)
      service = createWorkbookService(filename)
      const item = service.insertDraftItem({
        workbookId: 'book',
        itemType: 'Expression',
        generatedSnapshot: snapshot(),
        currentSnapshot: snapshot(),
        sourceRefs: []
      })
      sqlite.exec(`
        create trigger fail_workbook_revision before insert on workbook_item_revisions
        begin
          select raise(abort, 'revision insert failed');
        end;
      `)

      expect(() => service!.saveCurrentSnapshot(item.id, snapshot({ targetText: '工作区' }), 0)).toThrow(
        'revision insert failed'
      )
      expect(
        sqlite
          .prepare('select current_snapshot_json, edit_version from workbook_items where id = ?')
          .get(item.id)
      ).toEqual({ current_snapshot_json: JSON.stringify(snapshot()), edit_version: 0 })
      expect(
        sqlite.prepare('select count(*) as count from workbook_item_revisions').get()
      ).toEqual({ count: 0 })
    } finally {
      service?.close()
      sqlite.close()
      fs.rmSync(root, { recursive: true, force: true })
    }
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
        generatedSnapshot: snapshot({ sourceText: 'sample' }),
        currentSnapshot: snapshot({ sourceText: 'sample' }),
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
