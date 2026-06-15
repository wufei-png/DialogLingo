import { describe, expect, it } from 'vitest'
import { applyTypeBalanceRerank } from '../../../src/main/generation/ranking'

describe('applyTypeBalanceRerank', () => {
  it('softly interleaves expression and sentence items toward the target ratio', () => {
    const output = applyTypeBalanceRerank({
      expressionItems: [
        { id: 'e1', rawBaseScore: 0.9 },
        { id: 'e2', rawBaseScore: 0.8 }
      ],
      sentenceItems: [
        { id: 's1', rawBaseScore: 0.85 },
        { id: 's2', rawBaseScore: 0.75 }
      ],
      targetExpression: 0.6,
      targetSentence: 0.4,
      lambda: 0.1
    })

    expect(output.map((item) => item.id)).toEqual(['e1', 's1', 'e2', 's2'])
  })
})
