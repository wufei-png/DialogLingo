import type { ExpressionDifficulty } from '../../shared/schemas/settings'
import { TRIVIAL_EXPRESSION_SOURCE_TEXTS } from './expressionFilters'

export const EASY_EXPRESSION_DIFFICULTY_PROMPT =
  'The learner is a beginner. Focus on beginner-friendly, common, reusable phrases that are useful in everyday technical conversations, while still avoiding obvious one-word greetings and fillers.'

export const AVERAGE_EXPRESSION_DIFFICULTY_PROMPT =
  'The learner is an intermediate English learner. Focus on moderately useful grammar patterns, reusable phrases, natural collocations, and domain-specific vocabulary from the user conversation.'

export const HARD_EXPRESSION_DIFFICULTY_PROMPT =
  'The learner is advanced. Focus on nuanced expressions, dense professional phrasing, long or complex sentence patterns, idiomatic usage, and subtle distinctions that would improve precise communication.'

const EXPRESSION_DIFFICULTY_PROMPTS: Record<ExpressionDifficulty, string> = {
  easy: EASY_EXPRESSION_DIFFICULTY_PROMPT,
  average: AVERAGE_EXPRESSION_DIFFICULTY_PROMPT,
  hard: HARD_EXPRESSION_DIFFICULTY_PROMPT
}

export function buildGenerationPrompt(input: {
  sessionTitle: string
  expressionDifficulty: ExpressionDifficulty
  candidates: Array<{ sourceSpanRef: string; promptText: string }>
}) {
  const candidateText = input.candidates
    .map(
      (candidate, index) =>
        `${index + 1}. source_span_ref=${candidate.sourceSpanRef}\n${candidate.promptText}`
    )
    .join('\n\n')
  const trivialExamples = TRIVIAL_EXPRESSION_SOURCE_TEXTS.join(', ')

  return [
    `Create English-learning workbook items from the session "${input.sessionTitle}".`,
    'Use Expression for reusable terms/phrases and Sentence for useful full sentences.',
    EXPRESSION_DIFFICULTY_PROMPTS[input.expressionDifficulty],
    'If source text is Chinese, generate useful English-side learning material; if source text is English, generate Chinese support.',
    `Do not generate trivial Expression items for obvious greetings, fillers, or ultra-basic words such as: ${trivialExamples}.`,
    'Do not return duplicate items with the same item type and sourceText.',
    'Return only JSON matching the requested schema.',
    '',
    candidateText
  ].join('\n')
}
