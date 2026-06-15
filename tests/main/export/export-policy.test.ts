import { describe, expect, it } from 'vitest'
import {
  EXPORT_FORMATS,
  filterExportableItems,
  type ExportPolicyItem
} from '../../../src/main/export/manifest'

describe('filterExportableItems', () => {
  it('keeps the primary v1 formats stable', () => {
    expect(EXPORT_FORMATS).toEqual([
      'anki-package',
      'anki-text-bundle',
      'generic-text-bundle'
    ])
  })

  it('blocks flagged items when policy is block', () => {
    const output = filterExportableItems(
      [
        { id: 'a', state: 'active', flagged: false },
        { id: 'b', state: 'active', flagged: true }
      ],
      { flaggedItemExportPolicy: 'block' }
    )

    expect(output.map((item) => item.id)).toEqual(['a'])
  })

  it('exports only active rows for selected item types', () => {
    const items: ExportPolicyItem[] = [
      { id: 'expr-active', itemType: 'Expression', state: 'active' },
      { id: 'sent-active', itemType: 'Sentence', state: 'active' },
      { id: 'expr-deleted', itemType: 'Expression', state: 'deleted' },
      { id: 'sent-filtered', itemType: 'Sentence', state: 'active' }
    ]

    const output = filterExportableItems(items, {
      includeExpressions: true,
      includeSentences: false,
      keepFlaggedItems: false,
      flaggedItemExportPolicy: 'warn'
    })

    expect(output.items.map((item) => item.id)).toEqual(['expr-active'])
    expect(output.excluded.inactive).toEqual(['expr-deleted'])
    expect(output.excluded.type).toEqual(['sent-active', 'sent-filtered'])
  })

  it('keeps flagged rows only after explicit opt-in under warn policy', () => {
    const items: ExportPolicyItem[] = [
      { id: 'flagged', itemType: 'Expression', state: 'active', isFlagged: true }
    ]

    const excluded = filterExportableItems(items, {
      keepFlaggedItems: false,
      flaggedItemExportPolicy: 'warn'
    })
    const included = filterExportableItems(items, {
      keepFlaggedItems: true,
      flaggedItemExportPolicy: 'warn'
    })

    expect(excluded.items).toEqual([])
    expect(excluded.excluded.flagged).toEqual(['flagged'])
    expect(included.items.map((item) => item.id)).toEqual(['flagged'])
    expect(included.warnings).toContain('1 flagged item is included in the export.')
  })
})
