export type FlaggedItemExportPolicy = 'block' | 'warn'

export type ExportCountItem = {
  itemType: 'Expression' | 'Sentence'
  state: 'active' | 'deleted'
  currentSnapshot: Record<string, unknown>
}

export type ExportCountPolicy = {
  includeExpressions: boolean
  includeSentences: boolean
  keepFlaggedItems: boolean
  flaggedItemExportPolicy: FlaggedItemExportPolicy
}

export type ExportItemCounts = {
  expressions: number
  sentences: number
}

function isFlagged(item: ExportCountItem) {
  return item.currentSnapshot.flagged === true
}

function isIncludedType(item: ExportCountItem, policy: ExportCountPolicy) {
  return (
    (item.itemType === 'Expression' && policy.includeExpressions) ||
    (item.itemType === 'Sentence' && policy.includeSentences)
  )
}

function isExportable(item: ExportCountItem, policy: ExportCountPolicy) {
  if (item.state !== 'active' || !isIncludedType(item, policy)) {
    return false
  }

  if (isFlagged(item)) {
    return policy.flaggedItemExportPolicy !== 'block' && policy.keepFlaggedItems
  }

  return true
}

export function countExportableItems(
  items: ExportCountItem[],
  policy: ExportCountPolicy
): ExportItemCounts {
  return items.reduce(
    (counts, item) => {
      if (!isExportable(item, policy)) {
        return counts
      }

      if (item.itemType === 'Expression') {
        counts.expressions += 1
      } else {
        counts.sentences += 1
      }

      return counts
    },
    {
      expressions: 0,
      sentences: 0
    }
  )
}
