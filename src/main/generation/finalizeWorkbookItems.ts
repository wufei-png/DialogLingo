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

  for (const item of items) {
    if (
      item.itemType === 'Expression' &&
      isTrivialExpressionSourceText(item.generatedSnapshot.sourceText)
    ) {
      continue
    }

    const key = itemKey(item)
    const existing = byKey.get(key)
    if (existing) {
      existing.sourceRefs = mergeSourceRefs(existing.sourceRefs, item.sourceRefs)
      continue
    }

    byKey.set(key, {
      ...item,
      sourceRefs: [...item.sourceRefs]
    })
  }

  return [...byKey.values()]
}
