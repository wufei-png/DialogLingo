export type CandidateGroup = {
  id: string
  sourceSpanRef: string
  promptText: string
  status: 'pending'
}

export function mineCandidateGroups(
  turns: Array<{ text: string; sourceSpanRef?: string }>
): CandidateGroup[] {
  return turns
    .map((turn) => turn.text.trim())
    .filter(Boolean)
    .map((text, index) => ({
      id: `candidate-${index}`,
      sourceSpanRef: turns[index]?.sourceSpanRef ?? `span-${index}`,
      promptText: text,
      status: 'pending' as const
    }))
}
