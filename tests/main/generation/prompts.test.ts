import { describe, expect, it } from 'vitest'
import {
  AVERAGE_EXPRESSION_DIFFICULTY_PROMPT,
  EASY_EXPRESSION_DIFFICULTY_PROMPT,
  HARD_EXPRESSION_DIFFICULTY_PROMPT,
  INPUT_BATCH_PLACEHOLDER,
  STRUCTURED_OUTPUT_REMINDER,
  buildGenerationPromptTemplate,
  buildInputExcerptsBlock,
  renderGenerationPromptTemplate
} from '../../../src/main/generation/prompts'
import type { ExpressionDifficulty } from '../../../src/shared/schemas/settings'

const difficultyCases: Array<{
  difficulty: ExpressionDifficulty
  expectedPrompt: string
}> = [
  {
    difficulty: 'easy',
    expectedPrompt: EASY_EXPRESSION_DIFFICULTY_PROMPT
  },
  {
    difficulty: 'average',
    expectedPrompt: AVERAGE_EXPRESSION_DIFFICULTY_PROMPT
  },
  {
    difficulty: 'hard',
    expectedPrompt: HARD_EXPRESSION_DIFFICULTY_PROMPT
  }
]

describe('buildGenerationPromptTemplate', () => {
  it.each(difficultyCases)('injects the $difficulty difficulty instruction', (testCase) => {
    const prompt = buildGenerationPromptTemplate({
      expressionDifficulty: testCase.difficulty
    })

    expect(prompt).toContain(testCase.expectedPrompt)
    expect(prompt).toContain(INPUT_BATCH_PLACEHOLDER)
    expect(prompt).toContain(STRUCTURED_OUTPUT_REMINDER)
    expect(prompt.split(STRUCTURED_OUTPUT_REMINDER)).toHaveLength(2)
  })

  it('keeps preview templates free of real excerpts and source refs', () => {
    const prompt = buildGenerationPromptTemplate({
      expressionDifficulty: 'average'
    })

    expect(prompt).not.toContain('This should be more useful')
    expect(prompt).not.toContain('span-a')
    expect(prompt).not.toContain('sourceSpanRef')
    expect(prompt).toContain('excuse me')
    expect(prompt).toContain('excerptResults')
  })
})

describe('input excerpt rendering', () => {
  const excerpts = [
    {
      sourceSpanRef: 'span-a',
      sessionTitle: 'Greeting cleanup',
      role: 'assistant' as const,
      promptText: 'This should be more useful than an obvious greeting.'
    },
    {
      sourceSpanRef: 'span-b',
      sessionTitle: 'Release flow',
      role: 'user' as const,
      promptText: '发版前先跑一遍冒烟测试。'
    }
  ]

  it('renders a flat input excerpts block without internal source refs', () => {
    const block = buildInputExcerptsBlock({ excerpts })

    expect(block).toContain('# Input Excerpts')
    expect(block).toContain('excerpt 1')
    expect(block).toContain('session: Greeting cleanup')
    expect(block).toContain('role: assistant')
    expect(block).toContain('This should be more useful')
    expect(block).not.toContain('span-a')
    expect(block).not.toContain('sourceSpanRef')
  })

  it('replaces the first input placeholder', () => {
    const rendered = renderGenerationPromptTemplate({
      template: `before\n${INPUT_BATCH_PLACEHOLDER}\nafter`,
      excerpts
    })

    expect(rendered.warnings).toEqual([])
    expect(rendered.prompt).toContain('before')
    expect(rendered.prompt).toContain('# Input Excerpts')
    expect(rendered.prompt).toContain('after')
  })

  it('appends input and warns when the placeholder is missing', () => {
    const rendered = renderGenerationPromptTemplate({
      template: 'template without placeholder',
      excerpts
    })

    expect(rendered.warnings).toEqual(['missing_input_placeholder'])
    expect(rendered.prompt).toContain('template without placeholder')
    expect(rendered.prompt).toContain('# Input Excerpts')
  })

  it('removes duplicate placeholders after the first one', () => {
    const rendered = renderGenerationPromptTemplate({
      template: `${INPUT_BATCH_PLACEHOLDER}\nagain ${INPUT_BATCH_PLACEHOLDER}`,
      excerpts
    })

    expect(rendered.warnings).toEqual(['duplicate_input_placeholder'])
    expect(rendered.prompt.match(/# Input Excerpts/g)).toHaveLength(1)
    expect(rendered.prompt).not.toContain(INPUT_BATCH_PLACEHOLDER)
  })
})
