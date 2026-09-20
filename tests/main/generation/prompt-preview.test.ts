import { describe, expect, it } from 'vitest'
import { buildGenerationPromptPreview } from '../../../src/main/generation/promptPreview'
import { INPUT_BATCH_PLACEHOLDER } from '../../../src/main/generation/prompts'

describe('buildGenerationPromptPreview', () => {
  it('uses filtered candidates for candidate count but returns a reusable template', () => {
    const preview = buildGenerationPromptPreview({
      expressionDifficulty: 'average',
      maxItemsPerSession: 4,
      batchSize: 4,
      redactBeforeRemoteSend: true,
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
    expect(preview.prompt).toContain(INPUT_BATCH_PLACEHOLDER)
    expect(preview.prompt).not.toContain('Candidate mining should remove provider logs')
    expect(preview.prompt).not.toContain('const x')
    expect(preview.prompt).not.toContain('Adapter-marked tool output')
    expect(preview.examplePrompt).toContain('Candidate mining should remove provider logs')
  })

  it('applies maxItemsPerSession after filtering', () => {
    const preview = buildGenerationPromptPreview({
      expressionDifficulty: 'average',
      maxItemsPerSession: 1,
      batchSize: 4,
      redactBeforeRemoteSend: true,
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
    expect(preview.prompt).toContain(INPUT_BATCH_PLACEHOLDER)
    expect(preview.prompt).not.toContain('Candidate filtering should happen')
    expect(preview.prompt).not.toContain('Export manifest work')
    expect(preview.prompt).not.toContain('npm ERR')
  })

  it('renders one current-template sample with the same boundary policy as the worker', () => {
    const input = {
      expressionDifficulty: 'average' as const,
      maxItemsPerSession: 2,
      batchSize: 1,
      promptOverride: 'Review /home/synthetic-user/notes with sk-ant-abcdefghijklmnop\n{{INPUT_BATCH}}',
      sessions: [{
        sessionId: 's1', title: 'Authorization: Bearer sample-token-87654321',
        turns: [
          { role: 'assistant' as const, sourceSpanRef: 'one', text: 'Explain API_KEY=synthetic-value-12345 in a sentence.' },
          { role: 'user' as const, sourceSpanRef: 'two', text: 'A second useful excerpt should be in a later batch.' }
        ]
      }]
    }
    const on = buildGenerationPromptPreview({ ...input, redactBeforeRemoteSend: true })
    const off = buildGenerationPromptPreview({ ...input, redactBeforeRemoteSend: false })
    expect(on.candidateCount).toBe(2)
    expect(on.prompt).toContain(INPUT_BATCH_PLACEHOLDER)
    expect(on.examplePrompt).toContain('[redacted-home-path]')
    expect(on.examplePrompt).toContain('[redacted-secret]')
    for (const canary of ['synthetic-user', 'sk-ant-abcdefghijklmnop', 'sample-token-87654321', 'synthetic-value-12345']) {
      expect(on.examplePrompt).not.toContain(canary)
      expect(off.examplePrompt).toContain(canary)
    }
    expect(on.examplePrompt).not.toContain('A second useful excerpt')
    expect(on.redactBeforeRemoteSend).toBe(true)
    expect(off.redactBeforeRemoteSend).toBe(false)
  })
})
