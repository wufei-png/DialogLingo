import { describe, expect, it } from 'vitest'
import { hasUnconfirmedWorkbookCardDraft } from '../../src/renderer/src/features/workbook/workbookCardModel'

const confirmed = {
  sourceText: 'worktree',
  targetText: '工作树',
  gloss: 'an isolated checkout',
  explanation: 'Use one for independent changes.',
  contextText: 'Use a worktree for isolated changes.',
  quizPrompt: 'What isolates a checkout?',
  quizAnswer: 'A worktree.',
  tags: ['git']
}

describe('hasUnconfirmedWorkbookCardDraft', () => {
  it('compares the edit buffer with the last confirmed snapshot, not the displayed draft', () => {
    expect(hasUnconfirmedWorkbookCardDraft({ ...confirmed, targetText: '工作区' }, confirmed)).toBe(true)
    expect(hasUnconfirmedWorkbookCardDraft(confirmed, confirmed)).toBe(false)
  })
})
