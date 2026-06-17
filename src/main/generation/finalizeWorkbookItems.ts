import type { LearningItemDraft } from './modelAdapter'
import {
  isTrivialExpressionSourceText,
  normalizeLearningItemSourceText
} from './expressionFilters'

export type FinalizableWorkbookItem = {
  id: string
  itemType: 'Expression' | 'Sentence'
  generatedSnapshot: LearningItemDraft
  currentSnapshot: LearningItemDraft
  sourceRefs: Array<{
    sessionId: string
    sourceSpanRef: string
    excerpt: string
  }>
}

function itemKey(item: FinalizableWorkbookItem) {
  return [
    item.itemType,
    normalizeLearningItemSourceText(item.generatedSnapshot.sourceText)
  ].join(':')
}

function canonicalNearDuplicateText(value: string) {
  return normalizeLearningItemSourceText(value)
    .replace(/\bthere's\b/g, 'there is')
    .replace(/\bit's\b/g, 'it is')
    .replace(/\b(can't|cannot)\b/g, 'can not')
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .split(/\s+/)
    .filter((token) => token && !['a', 'an', 'the'].includes(token))
    .join(' ')
    .trim()
}

function tokenSet(value: string) {
  return new Set(value.split(/\s+/).filter(Boolean))
}

function tokenOverlap(left: string, right: string) {
  const leftTokens = tokenSet(left)
  const rightTokens = tokenSet(right)
  const smaller = leftTokens.size <= rightTokens.size ? leftTokens : rightTokens
  const larger = smaller === leftTokens ? rightTokens : leftTokens

  if (smaller.size === 0) {
    return 0
  }

  let shared = 0
  for (const token of smaller) {
    if (larger.has(token)) {
      shared += 1
    }
  }

  return shared / smaller.size
}

function editDistance(left: string, right: string) {
  if (left === right) {
    return 0
  }

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  const current = Array.from({ length: right.length + 1 }, () => 0)

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost =
        left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1
      current[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        previous[rightIndex - 1] + substitutionCost
      )
    }

    for (let index = 0; index < previous.length; index += 1) {
      previous[index] = current[index]
    }
  }

  return previous[right.length]
}

function editSimilarity(left: string, right: string) {
  const maxLength = Math.max(left.length, right.length)
  if (maxLength === 0) {
    return 1
  }

  return 1 - editDistance(left, right) / maxLength
}

function lengthDifferenceRatio(left: string, right: string) {
  const maxLength = Math.max(left.length, right.length)
  if (maxLength === 0) {
    return 0
  }

  return Math.abs(left.length - right.length) / maxLength
}

function areNearDuplicateItems(
  left: FinalizableWorkbookItem,
  right: FinalizableWorkbookItem
) {
  if (left.itemType !== right.itemType) {
    return false
  }

  const leftText = canonicalNearDuplicateText(left.generatedSnapshot.sourceText)
  const rightText = canonicalNearDuplicateText(right.generatedSnapshot.sourceText)
  const shorterLength = Math.min(leftText.length, rightText.length)

  if (shorterLength < 8 || lengthDifferenceRatio(leftText, rightText) > 0.25) {
    return false
  }

  if (leftText === rightText) {
    return true
  }

  const overlap = tokenOverlap(leftText, rightText)
  const similarity = editSimilarity(leftText, rightText)

  if (left.itemType === 'Expression') {
    return overlap >= 0.85 && similarity >= 0.9
  }

  return shorterLength >= 24 && overlap >= 0.85 && similarity >= 0.92
}

function findNearDuplicate<T extends FinalizableWorkbookItem>(
  items: T[],
  item: T
) {
  return items.find((candidate) => areNearDuplicateItems(candidate, item))
}

function sourceRefKey(ref: FinalizableWorkbookItem['sourceRefs'][number]) {
  return [ref.sessionId, ref.sourceSpanRef].join('\u0000')
}

function mergeSourceRefs(
  left: FinalizableWorkbookItem['sourceRefs'],
  right: FinalizableWorkbookItem['sourceRefs']
) {
  const seen = new Set(left.map(sourceRefKey))
  const merged = [...left]

  for (const ref of right) {
    const key = sourceRefKey(ref)
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    merged.push(ref)
  }

  return merged
}

export function finalizeWorkbookItems<T extends FinalizableWorkbookItem>(items: T[]) {
  const byKey = new Map<string, T>()
  const finalizedItems: T[] = []

  for (const item of items) {
    if (
      item.itemType === 'Expression' &&
      isTrivialExpressionSourceText(item.generatedSnapshot.sourceText)
    ) {
      continue
    }

    const key = itemKey(item)
    const existing = byKey.get(key) ?? findNearDuplicate(finalizedItems, item)
    if (existing) {
      existing.sourceRefs = mergeSourceRefs(existing.sourceRefs, item.sourceRefs)
      continue
    }

    const finalizedItem = {
      ...item,
      sourceRefs: [...item.sourceRefs]
    }
    byKey.set(key, finalizedItem)
    finalizedItems.push(finalizedItem)
  }

  return finalizedItems
}
