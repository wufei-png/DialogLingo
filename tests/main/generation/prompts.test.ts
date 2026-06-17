import { describe, expect, it } from 'vitest'
import {
  AVERAGE_EXPRESSION_DIFFICULTY_PROMPT,
  EASY_EXPRESSION_DIFFICULTY_PROMPT,
  HARD_EXPRESSION_DIFFICULTY_PROMPT,
  buildGenerationPrompt
} from '../../../src/main/generation/prompts'
import type { ExpressionDifficulty } from '../../../src/shared/schemas/settings'

const difficultyCases: Array<{
  difficulty: ExpressionDifficulty
  expectedPrompt: string
}> = [
  {
    difficulty: 'easy',
    expectedPrompt: EASY_EXPRESSION_DIFFICULTY_PROMPT
  },
  {
    difficulty: 'average',
    expectedPrompt: AVERAGE_EXPRESSION_DIFFICULTY_PROMPT
  },
  {
    difficulty: 'hard',
    expectedPrompt: HARD_EXPRESSION_DIFFICULTY_PROMPT
  }
]

describe('buildGenerationPrompt', () => {
  it.each(difficultyCases)('injects the $difficulty difficulty instruction', (testCase) => {
    const prompt = buildGenerationPrompt({
      sessionTitle: 'Model setup',
      expressionDifficulty: testCase.difficulty,
      candidates: [
        {
          sourceSpanRef: 'turn-1',
          promptText: 'We need to set up the local model before running generation.'
        }
      ]
    })

    expect(prompt).toContain(testCase.expectedPrompt)
  })

  it('preserves candidates and rejects trivial expression examples', () => {
    const prompt = buildGenerationPrompt({
      sessionTitle: 'Greeting cleanup',
      expressionDifficulty: 'average',
      candidates: [
        {
          sourceSpanRef: 'span-a',
          promptText: 'hi'
        },
        {
          sourceSpanRef: 'span-b',
          promptText: 'This should be more useful than an obvious greeting.'
        }
      ]
    })

    expect(prompt).toContain('source_span_ref=span-a')
    expect(prompt).toContain('source_span_ref=span-b')
    expect(prompt).toContain('hi')
    expect(prompt).toContain('excuse me')
    expect(prompt).toContain('Do not return duplicate items')
  })
})
