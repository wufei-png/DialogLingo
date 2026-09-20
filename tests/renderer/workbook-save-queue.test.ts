import { describe, expect, it, vi } from 'vitest'
import {
  WorkbookSaveQueue,
  type WorkbookSaveResult
} from '../../src/renderer/src/features/workbook/workbookSaveQueue'

function snapshot(targetText: string) {
  return {
    sourceText: 'worktree',
    targetText,
    gloss: 'gloss',
    explanation: 'explanation',
    contextText: 'context',
    quizPrompt: 'quiz',
    quizAnswer: 'answer',
    tags: ['git']
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })
  return { promise, resolve, reject }
}

describe('WorkbookSaveQueue', () => {
  it('serializes rapid edits and only confirms the final local draft', async () => {
    const first = deferred<WorkbookSaveResult>()
    const save = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({
        status: 'saved',
        currentSnapshot: snapshot('second'),
        editVersion: 2
      })
    const queue = new WorkbookSaveQueue(save, () => {})
    queue.syncServer([{ id: 'item', currentSnapshot: snapshot('initial'), editVersion: 0 }])

    queue.setDraft('item', snapshot('first'))
    const completed = queue.requestSave('item')
    queue.setDraft('item', snapshot('second'))
    queue.syncServer([{ id: 'item', currentSnapshot: snapshot('refresh'), editVersion: 1 }])
    first.resolve({ status: 'saved', currentSnapshot: snapshot('first'), editVersion: 1 })
    await completed

    expect(save).toHaveBeenNthCalledWith(1, {
      itemId: 'item',
      currentSnapshot: snapshot('first'),
      baseVersion: 0
    })
    expect(save).toHaveBeenNthCalledWith(2, {
      itemId: 'item',
      currentSnapshot: snapshot('second'),
      baseVersion: 1
    })
    expect(queue.get('item')).toMatchObject({
      confirmedSnapshot: snapshot('second'),
      draftSnapshot: snapshot('second'),
      editVersion: 2,
      status: 'saved'
    })
  })

  it('keeps failed and conflicted drafts available for an explicit retry', async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        status: 'conflict',
        currentSnapshot: snapshot('server'),
        editVersion: 4
      })
      .mockResolvedValueOnce({
        status: 'saved',
        currentSnapshot: snapshot('local'),
        editVersion: 5
      })
    const queue = new WorkbookSaveQueue(save, () => {})
    queue.syncServer([{ id: 'item', currentSnapshot: snapshot('initial'), editVersion: 0 }])
    queue.setDraft('item', snapshot('local'))

    await expect(queue.requestSave('item')).rejects.toThrow('offline')
    expect(queue.get('item')).toMatchObject({
      draftSnapshot: snapshot('local'),
      confirmedSnapshot: snapshot('initial'),
      status: 'error'
    })
    await expect(queue.requestSave('item')).rejects.toThrow('conflict')
    expect(queue.get('item')).toMatchObject({
      draftSnapshot: snapshot('local'),
      confirmedSnapshot: snapshot('server'),
      editVersion: 4,
      status: 'conflict'
    })
    await queue.requestSave('item')
    expect(queue.get('item')).toMatchObject({
      draftSnapshot: snapshot('local'),
      confirmedSnapshot: snapshot('local'),
      editVersion: 5,
      status: 'saved'
    })
  })

  it('does not let a query refresh replace an unconfirmed local draft', () => {
    const queue = new WorkbookSaveQueue(async () => {
      throw new Error('not used')
    }, () => {})
    queue.syncServer([{ id: 'item', currentSnapshot: snapshot('initial'), editVersion: 0 }])
    queue.setDraft('item', snapshot('local'))
    queue.syncServer([{ id: 'item', currentSnapshot: snapshot('refresh'), editVersion: 1 }])

    expect(queue.get('item')).toMatchObject({
      confirmedSnapshot: snapshot('initial'),
      draftSnapshot: snapshot('local'),
      editVersion: 0
    })
  })
})
