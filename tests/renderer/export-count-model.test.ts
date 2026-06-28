import { describe, expect, it } from 'vitest'
import {
  countExportableItems,
  type ExportCountItem
} from '../../src/renderer/src/features/workbook/exportCountModel'

const items: ExportCountItem[] = [
  {
    itemType: 'Expression',
    state: 'active',
    currentSnapshot: { flagged: false }
  },
  {
    itemType: 'Expression',
    state: 'active',
    currentSnapshot: { flagged: true }
  },
  {
    itemType: 'Sentence',
    state: 'active',
    currentSnapshot: { flagged: false }
  },
  {
    itemType: 'Sentence',
    state: 'deleted',
    currentSnapshot: { flagged: false }
  }
]

describe('countExportableItems', () => {
  it('matches the default export policy by excluding flagged and deleted items', () => {
    expect(
      countExportableItems(items, {
        includeExpressions: true,
        includeSentences: true,
        keepFlaggedItems: false,
        flaggedItemExportPolicy: 'warn'
      })
    ).toEqual({
      expressions: 1,
      sentences: 1
    })
  })

  it('keeps flagged items only when warn policy and explicit opt-in are both active', () => {
    expect(
      countExportableItems(items, {
        includeExpressions: true,
        includeSentences: true,
        keepFlaggedItems: true,
        flaggedItemExportPolicy: 'warn'
      })
    ).toEqual({
      expressions: 2,
      sentences: 1
    })

    expect(
      countExportableItems(items, {
        includeExpressions: true,
        includeSentences: true,
        keepFlaggedItems: true,
        flaggedItemExportPolicy: 'block'
      })
    ).toEqual({
      expressions: 1,
      sentences: 1
    })
  })

  it('respects include item type toggles', () => {
    expect(
      countExportableItems(items, {
        includeExpressions: false,
        includeSentences: true,
        keepFlaggedItems: true,
        flaggedItemExportPolicy: 'warn'
      })
    ).toEqual({
      expressions: 0,
      sentences: 1
    })
  })
})
