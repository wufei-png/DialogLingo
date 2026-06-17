export type CandidateGroup = {
  id: string
  sourceSpanRef: string
  promptText: string
  role?: 'user' | 'assistant'
  status: 'pending'
}

export function mineCandidateGroups(
  turns: Array<{ text: string; sourceSpanRef?: string; role?: 'user' | 'assistant' }>
): CandidateGroup[] {
  return turns
    .map((turn) => ({
      turn,
      text: turn.text.trim()
    }))
    .filter((row) => row.text.length > 0)
    .map(({ turn, text }, index) => ({
      id: `candidate-${index}`,
      sourceSpanRef: turn.sourceSpanRef ?? `span-${index}`,
      promptText: text,
      ...(turn.role ? { role: turn.role } : {}),
      status: 'pending' as const
    }))
}
