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

export const INPUT_BATCH_PLACEHOLDER = '{{INPUT_BATCH}}'
export const STRUCTURED_OUTPUT_REMINDER =
  'Return JSON matching the provided schema.'

export type GenerationPromptExcerpt = {
  sourceSpanRef?: string
  promptText: string
  role?: 'user' | 'assistant'
  sessionTitle?: string
}

export type PromptRenderWarning =
  | 'missing_input_placeholder'
  | 'duplicate_input_placeholder'

export function buildGenerationPromptTemplate(input: {
  expressionDifficulty: ExpressionDifficulty
}) {
  const trivialExamples = TRIVIAL_EXPRESSION_SOURCE_TEXTS.join(', ')

  return [
    '# Role',
    'You are an expert ESL (English as a Second Language) teacher and curriculum designer.',
    '',
    '# Task',
    'Create English-learning workbook items from each excerpt in the input batch.',
    '',
    '# Rules',
    `- Target audience: ${EXPRESSION_DIFFICULTY_PROMPTS[input.expressionDifficulty]}`,
    '- Prefer useful English expressions, collocations, and sentence patterns.',
    '- If an excerpt is Chinese, create a natural English study text for the learner.',
    `- Skip trivial greetings, fillers, or ultra-basic expressions such as: ${trivialExamples}.`,
    '- Return exactly one excerptResults entry for each excerpt, in the same order.',
    '- Each excerptResult.items array contains 0 to 2 learning items.',
    '',
    '# Output Contract',
    STRUCTURED_OUTPUT_REMINDER,
    '',
    INPUT_BATCH_PLACEHOLDER
  ].join('\n')
}

export function buildInputExcerptsBlock(input: {
  excerpts: GenerationPromptExcerpt[]
}) {
  return [
    '# Input Excerpts',
    '',
    ...input.excerpts.map((excerpt, index) =>
      [
        `excerpt ${index + 1}`,
        `session: ${formatPromptLine(excerpt.sessionTitle ?? 'Selected session')}`,
        `role: ${excerpt.role ?? 'assistant'}`,
        'text:',
        excerpt.promptText
      ].join('\n')
    )
  ].join('\n\n')
}

export function renderGenerationPromptTemplate(input: {
  template: string
  excerpts: GenerationPromptExcerpt[]
}) {
  const inputBlock = buildInputExcerptsBlock({ excerpts: input.excerpts })
  const firstPlaceholderIndex = input.template.indexOf(INPUT_BATCH_PLACEHOLDER)
  const warnings: PromptRenderWarning[] = []

  if (firstPlaceholderIndex < 0) {
    warnings.push('missing_input_placeholder')
    return {
      prompt: [input.template.trimEnd(), inputBlock].join('\n\n'),
      warnings
    }
  }

  const before = input.template.slice(0, firstPlaceholderIndex)
  const after = input.template.slice(
    firstPlaceholderIndex + INPUT_BATCH_PLACEHOLDER.length
  )
  if (after.includes(INPUT_BATCH_PLACEHOLDER)) {
    warnings.push('duplicate_input_placeholder')
  }

  return {
    prompt: before + inputBlock + after.replaceAll(INPUT_BATCH_PLACEHOLDER, ''),
    warnings
  }
}

function formatPromptLine(value: string) {
  return value
    .replace(/\s+/g, ' ')
    .trim()
}
