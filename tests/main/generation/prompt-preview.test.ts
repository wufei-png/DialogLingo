import { describe, expect, it } from 'vitest'
import { buildGenerationPromptPreview } from '../../../src/main/generation/promptPreview'

describe('buildGenerationPromptPreview', () => {
  it('uses filtered candidates for prompt text and candidate count', () => {
    const preview = buildGenerationPromptPreview({
      expressionDifficulty: 'average',
      maxItemsPerSession: 4,
      batchSize: 4,
      sessions: [
        {
          sessionId: 'session-1',
          title: 'Generation cleanup',
          turns: [
            {
              role: 'assistant',
              sourceSpanRef: 'noise',
              text: '```ts\nconst x = 1\n```'
            },
            {
              role: 'assistant',
              sourceSpanRef: 'flagged',
              text: 'Adapter-marked tool output should not be sent.',
              isToolNoise: true
            },
            {
              role: 'user',
              sourceSpanRef: 'useful',
              text: 'Candidate mining should remove provider logs before prompt construction.'
            }
          ]
        }
      ]
    })

    expect(preview.candidateCount).toBe(1)
    expect(preview.prompt).toContain(
      'Candidate mining should remove provider logs before prompt construction.'
    )
    expect(preview.prompt).not.toContain('const x')
    expect(preview.prompt).not.toContain('Adapter-marked tool output')
  })

  it('applies maxItemsPerSession after filtering', () => {
    const preview = buildGenerationPromptPreview({
      expressionDifficulty: 'average',
      maxItemsPerSession: 1,
      batchSize: 4,
      sessions: [
        {
          sessionId: 'session-1',
          title: 'Generation cleanup',
          turns: [
            {
              role: 'assistant',
              sourceSpanRef: 'noise',
              text: 'npm ERR! code E401\nnpm ERR! auth failed\nnpm ERR! fix token'
            },
            {
              role: 'assistant',
              sourceSpanRef: 'first',
              text: 'Candidate filtering should happen before the per-session item cap.'
            },
            {
              role: 'assistant',
              sourceSpanRef: 'second',
              text: 'Export manifest work should stay in the follow-up TODO plan.'
            }
          ]
        }
      ]
    })

    expect(preview.candidateCount).toBe(1)
    expect(preview.prompt).toContain(
      'Candidate filtering should happen before the per-session item cap.'
    )
    expect(preview.prompt).not.toContain('Export manifest work')
    expect(preview.prompt).not.toContain('npm ERR')
  })
})
