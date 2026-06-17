import { describe, expect, it } from 'vitest'
import { redactTurns } from '../../../src/main/generation/redaction'

describe('redactTurns', () => {
  it('redacts obvious secret-like strings before remote generation', () => {
    const output = redactTurns([
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

  it('drops pure code and preserves natural-language turns', () => {
    const result = redactTurns([
      { role: 'assistant', text: 'Use Zustand for local UI state.', isToolNoise: false },
      { role: 'assistant', text: '```ts\nconst x = 1\n```', isToolNoise: false }
    ])

    expect(result).toHaveLength(1)
    expect(result[0]?.text).toContain('Use Zustand')
  })

  it('strips noisy blocks from mixed natural-language turns', () => {
    const result = redactTurns([
      {
        role: 'assistant',
        text: [
          'Use bounded concurrency so generation does not overload the provider.',
          '```ts',
          'const limit = pLimit(3)',
          '```',
          'Keep failed batches visible for retry diagnostics.'
        ].join('\n')
      }
    ])

    expect(result).toHaveLength(1)
    expect(result[0]?.text).toContain('Use bounded concurrency')
    expect(result[0]?.text).toContain('Keep failed batches')
    expect(result[0]?.text).not.toContain('pLimit')
  })

  it('drops explicit tool-noise and pure log output', () => {
    const result = redactTurns([
      { role: 'assistant', text: 'This session needs better candidate mining.' },
      { role: 'assistant', text: '<local-command-stdout>\nDone\n</local-command-stdout>' },
      { role: 'assistant', text: 'npm ERR! code E401\nnpm ERR! auth failed\nnpm ERR! fix token' },
      { role: 'assistant', text: 'Adapter-marked tool output', isToolNoise: true }
    ])

    expect(result).toEqual([
      expect.objectContaining({
        text: 'This session needs better candidate mining.'
      })
    ])
  })
})
