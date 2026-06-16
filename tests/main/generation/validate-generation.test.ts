import { describe, expect, it } from 'vitest'
import { validateGenerationRequest } from '../../../src/main/generation/validateGeneration'

describe('validateGenerationRequest', () => {
  it('rejects empty selections and missing LiteLLM provider config before a job starts', () => {
    expect(() =>
      validateGenerationRequest({
        sessionIds: [],
        settings: {
          provider: {
            baseUrl: 'http://localhost:4000',
            apiKey: 'sk-test',
            defaultModel: 'gpt-4o-mini'
          }
        }
      })
    ).toThrow('Select at least one session')

    expect(() =>
      validateGenerationRequest({
        sessionIds: ['s1'],
        settings: {
          provider: {
            baseUrl: '',
            apiKey: '',
            defaultModel: ''
          }
        }
      })
    ).toThrow('Configure LiteLLM')
  })
})
