import { describe, expect, it } from 'vitest'
import {
  closeWorkbookSource,
  getInitialWorkbookSourceMode,
  moveWorkbookSelection,
  openWorkbookSource,
  pinWorkbookSource,
  reconcileWorkbookSelection,
  selectAfterWorkbookRemoval,
  unpinWorkbookSource
} from '../../src/renderer/src/features/workbook/workbookModel'

const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

describe('workbookModel', () => {
  it('maps persisted pin state to the initial source mode', () => {
    expect(getInitialWorkbookSourceMode(false)).toBe('focus')
    expect(getInitialWorkbookSourceMode(true)).toBe('pinned')
    expect(openWorkbookSource(false)).toBe('drawer')
    expect(openWorkbookSource(true)).toBe('pinned')
    expect(closeWorkbookSource()).toBe('focus')
    expect(pinWorkbookSource()).toBe('pinned')
    expect(unpinWorkbookSource()).toBe('focus')
  })

  it('reconciles selection when rows change', () => {
    expect(reconcileWorkbookSelection(rows, 'b')).toBe('b')
    expect(reconcileWorkbookSelection(rows, 'missing')).toBeNull()
    expect(reconcileWorkbookSelection(rows, null)).toBeNull()
  })

  it('moves selection without walking past list boundaries', () => {
    expect(moveWorkbookSelection(rows, null, 1)).toBe('a')
    expect(moveWorkbookSelection(rows, null, -1)).toBe('c')
    expect(moveWorkbookSelection(rows, 'a', -1)).toBe('a')
    expect(moveWorkbookSelection(rows, 'a', 1)).toBe('b')
    expect(moveWorkbookSelection(rows, 'c', 1)).toBe('c')
  })

  it('selects the next available item after removing the selected row', () => {
    expect(selectAfterWorkbookRemoval(rows, 'b', 'b')).toBe('c')
    expect(selectAfterWorkbookRemoval(rows, 'c', 'c')).toBe('b')
    expect(selectAfterWorkbookRemoval(rows, 'b', 'a')).toBe('a')
    expect(selectAfterWorkbookRemoval([{ id: 'a' }], 'a', 'a')).toBeNull()
  })
})

