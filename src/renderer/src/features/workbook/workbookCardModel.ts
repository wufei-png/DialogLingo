export type WorkbookCardDraft = {
  sourceText: string
  targetText: string
  gloss: string
  explanation: string
  contextText: string
  quizPrompt: string
  quizAnswer: string
  tags: string[]
}

export function hasUnconfirmedWorkbookCardDraft(
  draft: WorkbookCardDraft,
  confirmed: WorkbookCardDraft
) {
  return (
    draft.sourceText !== confirmed.sourceText ||
    draft.targetText !== confirmed.targetText ||
    draft.gloss !== confirmed.gloss ||
    draft.explanation !== confirmed.explanation ||
    draft.contextText !== confirmed.contextText ||
    draft.quizPrompt !== confirmed.quizPrompt ||
    draft.quizAnswer !== confirmed.quizAnswer ||
    draft.tags.join('\u0000') !== confirmed.tags.join('\u0000')
  )
}
