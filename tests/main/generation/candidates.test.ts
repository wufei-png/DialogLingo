import { describe, expect, it } from 'vitest'
import { mineCandidateGroups } from '../../../src/main/generation/candidates'

describe('mineCandidateGroups', () => {
  it('splits useful natural-language turns and filters pure fragments', () => {
    const candidates = mineCandidateGroups([
      {
        role: 'assistant',
        sourceSpanRef: 'turn-1',
        text: [
          'Candidate mining should keep reusable technical explanations.',
          'Search preview code blocks should be handled in a separate follow-up.',
          '/Users/example/project/src/main/index.ts',
          'npm run test'
        ].join('\n')
      }
    ])

    expect(candidates.map((candidate) => candidate.promptText)).toEqual([
      'Candidate mining should keep reusable technical explanations. Search preview code blocks should be handled in a separate follow-up.'
    ])
    expect(candidates[0]).toMatchObject({
      sourceSpanRef: 'turn-1',
      role: 'assistant',
      status: 'pending'
    })
  })

  it('drops short trivial text, pure tool noise, and near duplicates', () => {
    const candidates = mineCandidateGroups([
      { role: 'user', sourceSpanRef: 'short', text: 'hi' },
      {
        role: 'assistant',
        sourceSpanRef: 'code',
        text: '```ts\nconst value = 1\n```'
      },
      {
        role: 'assistant',
        sourceSpanRef: 'first',
        text: 'The export manifest should include workbook provenance for trust.'
      },
      {
        role: 'assistant',
        sourceSpanRef: 'second',
        text: 'Export manifest should include workbook provenance for trust!'
      }
    ])

    expect(candidates).toHaveLength(1)
    expect(candidates[0]?.promptText).toBe(
      'The export manifest should include workbook provenance for trust.'
    )
  })

  it('keeps compact mixed-language learning candidates', () => {
    const candidates = mineCandidateGroups([
      {
        role: 'user',
        sourceSpanRef: 'mixed',
        text: '这个 rerank 接入需要修复，否则 workbook ordering 会误导用户。'
      }
    ])

    expect(candidates).toEqual([
      expect.objectContaining({
        promptText: '这个 rerank 接入需要修复，否则 workbook ordering 会误导用户。',
        role: 'user',
        sourceSpanRef: 'mixed'
      })
    ])
  })
})
