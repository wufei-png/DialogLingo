import { describe, expect, it } from 'vitest'
import { precleanTurns } from '../../../src/main/generation/preclean'

describe('precleanTurns redaction', () => {
  it('redacts obvious secret-like strings before remote generation', () => {
    const output = precleanTurns([
      {
        role: 'assistant',
        text: 'Use a local environment variable instead of sending sk-live-abcdef123456 to the model.',
        isToolNoise: false
      }
    ])

    expect(output).toHaveLength(1)
    expect(output[0]?.text).not.toContain('sk-live-abcdef123456')
    expect(output[0]?.text).toContain('[redacted-secret]')
  })
})
