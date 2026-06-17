import { describe, expect, it } from 'vitest'
import {
  finalizeWorkbookItems,
  type FinalizableWorkbookItem
} from '../../../src/main/generation/finalizeWorkbookItems'
import type { LearningItemDraft } from '../../../src/main/generation/modelAdapter'

function draft(input: Partial<LearningItemDraft> & { sourceText: string }): LearningItemDraft {
  return {
    itemType: input.itemType ?? 'Expression',
    sourceText: input.sourceText,
    targetText: input.targetText ?? 'target',
    gloss: input.gloss ?? 'gloss',
    contextText: input.contextText ?? 'context',
    explanation: input.explanation ?? 'explanation',
    quizPrompt: input.quizPrompt ?? 'quiz',
    quizAnswer: input.quizAnswer ?? input.sourceText,
    tags: input.tags ?? ['tag']
  }
}

function item(input: {
  id: string
  itemType?: 'Expression' | 'Sentence'
  sourceText: string
  sessionId?: string
  sourceSpanRef?: string
}): FinalizableWorkbookItem {
  const itemType = input.itemType ?? 'Expression'
  const generatedSnapshot = draft({
    itemType,
    sourceText: input.sourceText
  })

  return {
    id: input.id,
    itemType,
    generatedSnapshot,
    currentSnapshot: generatedSnapshot,
    sourceRefs: [
      {
        sessionId: input.sessionId ?? 's1',
        sourceSpanRef: input.sourceSpanRef ?? input.id,
        excerpt: `excerpt ${input.id}`
      }
    ]
  }
}

describe('finalizeWorkbookItems', () => {
  it('collapses duplicate non-trivial expressions and merges unique provenance refs', () => {
    const finalized = finalizeWorkbookItems([
      item({ id: 'a', sourceText: 'set up', sourceSpanRef: 'span-1' }),
      item({ id: 'b', sourceText: ' Set up! ', sourceSpanRef: 'span-2' }),
      item({ id: 'c', sourceText: 'set up', sourceSpanRef: 'span-1' })
    ])

    expect(finalized).toHaveLength(1)
    expect(finalized[0].id).toBe('a')
    expect(finalized[0].sourceRefs).toHaveLength(2)
    expect(finalized[0].sourceRefs.map((ref) => ref.sourceSpanRef)).toEqual([
      'span-1',
      'span-2'
    ])
  })

  it('drops trivial expression drafts', () => {
    const finalized = finalizeWorkbookItems([
      item({ id: 'hi', sourceText: ' "Hi!" ' }),
      item({ id: 'excuse-me', sourceText: 'Excuse me.' }),
      item({ id: 'useful', sourceText: 'carry over' })
    ])

    expect(finalized.map((entry) => entry.id)).toEqual(['useful'])
  })

  it('dedupes sentences separately from expressions', () => {
    const finalized = finalizeWorkbookItems([
      item({ id: 'expr', itemType: 'Expression', sourceText: 'set up' }),
      item({ id: 'sent', itemType: 'Sentence', sourceText: 'set up' }),
      item({ id: 'sent-dup', itemType: 'Sentence', sourceText: 'Set up.' })
    ])

    expect(finalized.map((entry) => entry.id)).toEqual(['expr', 'sent'])
  })
})
