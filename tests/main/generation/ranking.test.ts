import { describe, expect, it } from 'vitest'
import {
  rankWorkbookItems,
  rankExpressionItems,
  rankSentenceItems
} from '../../../src/main/generation/ranking'

describe('rankExpressionItems', () => {
  it('prefers recurrent domain expressions over noisy one-offs', () => {
    const ranked = rankExpressionItems([
      {
        id: 'a',
        recurrenceScore: 1,
        domainScore: 1,
        contextScore: 0.8,
        languageGapScore: 0.7,
        usefulnessScore: 0.8,
        sourceQualityScore: 0.9,
        noisePenalty: 0,
        dupPenalty: 0
      },
      {
        id: 'b',
        recurrenceScore: 0.1,
        domainScore: 0.1,
        contextScore: 0.3,
        languageGapScore: 0.1,
        usefulnessScore: 0.2,
        sourceQualityScore: 0.2,
        noisePenalty: 0.6,
        dupPenalty: 0.3
      }
    ])

    expect(ranked[0]?.id).toBe('a')
  })
})

describe('rankSentenceItems', () => {
  it('prefers context-rich bilingual sentences', () => {
    const ranked = rankSentenceItems([
      {
        id: 'a',
        recurrenceScore: 0.5,
        domainScore: 0.4,
        contextScore: 1,
        languageGapScore: 0.9,
        usefulnessScore: 0.8,
        sourceQualityScore: 0.7,
        noisePenalty: 0,
        dupPenalty: 0
      },
      {
        id: 'b',
        recurrenceScore: 0.5,
        domainScore: 0.4,
        contextScore: 0.2,
        languageGapScore: 0.2,
        usefulnessScore: 0.3,
        sourceQualityScore: 0.5,
        noisePenalty: 0.1,
        dupPenalty: 0
      }
    ])

    expect(ranked[0]?.id).toBe('a')
  })
})

describe('rankWorkbookItems', () => {
  function workbookItem(input: {
    id: string
    itemType: 'Expression' | 'Sentence'
    sourceText: string
  }) {
    return {
      id: input.id,
      itemType: input.itemType,
      generatedSnapshot: {
        sourceText: input.sourceText,
        targetText: '中文支持',
        contextText: 'A useful software workflow context with enough surrounding detail.',
        explanation: 'A reusable phrase from a product or software conversation.',
        tags: ['software']
      },
      sourceRefs: [
        {
          excerpt: 'A useful software workflow context with enough surrounding detail.'
        }
      ]
    }
  }

  it('applies type-balance rerank to the final workbook item order', () => {
    const ordered = rankWorkbookItems(
      [
        workbookItem({ id: 'e1', itemType: 'Expression', sourceText: 'selected model' }),
        workbookItem({ id: 'e2', itemType: 'Expression', sourceText: 'type balance' }),
        workbookItem({
          id: 's1',
          itemType: 'Sentence',
          sourceText: 'There is an issue with the selected model.'
        }),
        workbookItem({
          id: 's2',
          itemType: 'Sentence',
          sourceText: 'Use a soft type balance rerank.'
        })
      ],
      {
        targetExpression: 0.6,
        targetSentence: 0.4,
        lambda: 10
      }
    )

    expect(ordered.map((item) => item.id)).toEqual(['e1', 's1', 'e2', 's2'])
  })
})
