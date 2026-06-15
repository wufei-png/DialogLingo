import { describe, expect, it } from 'vitest'
import { precleanTurns } from '../../../src/main/generation/preclean'

describe('precleanTurns', () => {
  it('collapses code and preserves natural-language turns', () => {
    const result = precleanTurns([
      { role: 'assistant', text: 'Use Zustand for local UI state.', isToolNoise: false },
      { role: 'assistant', text: '```ts\nconst x = 1\n```', isToolNoise: false }
    ])

    expect(result[0]?.text).toContain('Use Zustand')
    expect(result[1]?.text).toContain('[collapsed code block]')
  })
})
