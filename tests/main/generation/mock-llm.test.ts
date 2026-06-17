import { afterEach, describe, expect, it } from 'vitest'
import {
  createMockLearningItemDrafts,
  isMockLlmEnabled
} from '../../../src/main/generation/mockLlm'
import { validateGenerationRequest } from '../../../src/main/generation/validateGeneration'

describe('mock llm generation', () => {
  const previous = process.env.DIALOGLINGO_MOCK_LLM

  afterEach(() => {
    if (previous == null) {
      delete process.env.DIALOGLINGO_MOCK_LLM
    } else {
      process.env.DIALOGLINGO_MOCK_LLM = previous
    }
  })

  it('returns two expression and two sentence drafts', () => {
    const drafts = createMockLearningItemDrafts()

    expect(drafts.filter((draft) => draft.itemType === 'Expression')).toHaveLength(2)
    expect(drafts.filter((draft) => draft.itemType === 'Sentence')).toHaveLength(2)
    expect(drafts.map((draft) => draft.sourceText)).not.toContain('hi')
  })

  it('skips API provider validation when enabled', () => {
    process.env.DIALOGLINGO_MOCK_LLM = '1'

    expect(isMockLlmEnabled()).toBe(true)
    expect(() =>
      validateGenerationRequest({
        sessionIds: ['s1'],
        settings: {
          provider: {
            baseUrl: '',
            apiKey: '',
            defaultModel: ''
          },
          modelBackend: {
            kind: 'openai-compatible',
            cli: {
              codex: { executablePath: '', model: '' },
              claude: { executablePath: '', model: '' },
              opencode: { executablePath: '', model: '' },
              timeoutMs: 120000
            }
          }
        }
      })
    ).not.toThrow()
  })
})
