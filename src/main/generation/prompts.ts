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
  candidates: Array<{
    sourceSpanRef: string
    promptText: string
    role?: 'user' | 'assistant'
    sessionTitle?: string
  }>
}) {
  const candidateText = formatPromptSessions(input.sessionTitle, input.candidates)
  const trivialExamples = TRIVIAL_EXPRESSION_SOURCE_TEXTS.join(', ')

  return [
    '# Role',
    'You are an expert ESL (English as a Second Language) teacher and curriculum designer.',
    '',
    '# Task',
    'Create English-learning workbook items from the conversation excerpts provided in the <session> tags.',
    '',
    '# Rules',
    `1. Target audience: ${EXPRESSION_DIFFICULTY_PROMPTS[input.expressionDifficulty]}`,
    '2. Item types:',
    '   - Use Expression for reusable terms/phrases.',
    '   - Use Sentence for useful full sentences.',
    '3. Bilingual support:',
    '   - If source text is Chinese, generate useful English equivalents.',
    '   - If source text is English, generate Chinese translations and support.',
    '4. Exclusions:',
    `   - Do not generate trivial items for obvious greetings, fillers, or ultra-basic words such as: ${trivialExamples}.`,
    '   - Do not return duplicate items with the same itemType and sourceText.',
    '   - Ignore empty greetings, provider errors, and model/access-error messages unless they contain useful English worth learning.',
    '5. Empty state:',
    '   - If no content meets the learning criteria, return {"items":[]}.',
    '',
    '# Output Contract',
    'Return only a valid JSON object matching the externally provided schema.',
    'Do not output markdown fences, conversational text, or explanations outside the JSON.',
    'The top-level object must contain an items array.',
    '',
    '# Input Conversation',
    candidateText
  ].join('\n')
}

function formatPromptSessions(
  fallbackSessionTitle: string,
  candidates: Array<{
    promptText: string
    role?: 'user' | 'assistant'
    sessionTitle?: string
  }>
) {
  const groups: Array<{
    title: string
    turns: Array<{ role: 'user' | 'assistant'; text: string }>
  }> = []

  for (const candidate of candidates) {
    const title = candidate.sessionTitle ?? fallbackSessionTitle
    const lastGroup = groups[groups.length - 1]
    const group =
      lastGroup?.title === title
        ? lastGroup
        : {
          title,
          turns: []
        }

    if (group !== lastGroup) {
      groups.push(group)
    }

    group.turns.push({
      role: candidate.role ?? 'assistant',
      text: candidate.promptText
    })
  }

  return groups
    .map((group) =>
      [
        `<session title="${escapePromptAttribute(group.title)}">`,
        group.turns
          .map((turn) => `${turn.role}:\n${turn.text}`)
          .join('\n\n'),
        '</session>'
      ].join('\n')
    )
    .join('\n\n')
}

function escapePromptAttribute(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
