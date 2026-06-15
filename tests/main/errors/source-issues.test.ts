import { describe, expect, it } from 'vitest'
import { summarizeSourceIssue } from '../../../src/main/errors/sourceIssues'

describe('summarizeSourceIssue', () => {
  it('classifies missing paths into user-visible source issue summaries', () => {
    expect(
      summarizeSourceIssue({ kind: 'missing-path', source: 'codex' })
    ).toMatchObject({
      severity: 'warning',
      source: 'codex'
    })
  })

  it('classifies unreadable local sources separately from missing paths', () => {
    expect(
      summarizeSourceIssue({ kind: 'unreadable-source', source: 'claude' }).message
    ).toBe('unreadable-source')
  })
})
