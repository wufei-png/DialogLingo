import { describe, expect, it } from 'vitest'
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
})
