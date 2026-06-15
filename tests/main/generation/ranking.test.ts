import { describe, expect, it } from 'vitest'
import {
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
