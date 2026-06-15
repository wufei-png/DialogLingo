import { describe, expect, it } from 'vitest'
import { precleanTurns } from '../../../src/main/generation/preclean'

describe('precleanTurns redaction', () => {
  it('redacts obvious secret-like strings before remote generation', () => {
    const output = precleanTurns([
      { role: 'assistant', text: 'API_KEY=sk-live-abcdef123456', isToolNoise: false }
    ])

    expect(output[0]?.text).not.toContain('sk-live-abcdef123456')
  })
})
