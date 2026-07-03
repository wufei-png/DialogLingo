import { describe, expect, it } from 'vitest'
import {
  learningItemJsonSchema,
  parseLearningItemPayload
} from '../../../src/main/generation/modelAdapter'

const item = {
  itemType: 'Expression',
  sourceText: 'ship it',
  targetText: '发布它',
  gloss: 'release something',
  contextText: 'We can ship it today.',
  explanation: '一个常见的软件发布表达。',
  quizPrompt: '“发布它”用英语怎么说？',
  quizAnswer: 'ship it',
  tags: ['release']
}

describe('model adapter structured output contract', () => {
  it('accepts per-excerpt results', () => {
    expect(
      parseLearningItemPayload(
        {
          excerptResults: [
            { items: [] },
            { items: [item] }
          ]
        },
        { excerptCount: 2 }
      )
    ).toMatchObject({
      excerptResults: [
        { items: [] },
        { items: [item] }
      ]
    })
  })

  it('rejects old flat item payloads', () => {
    expect(() =>
      parseLearningItemPayload({ items: [item] }, { excerptCount: 1 })
    ).toThrow('excerptResults')
  })

  it('rejects mixed old and new top-level payloads', () => {
    expect(() =>
      parseLearningItemPayload(
        {
          excerptResults: [{ items: [] }],
          items: [item]
        },
        { excerptCount: 1 }
      )
    ).toThrow('Unrecognized key')
  })

  it('rejects excerpt count mismatches', () => {
    expect(() =>
      parseLearningItemPayload({ excerptResults: [{ items: [] }] }, { excerptCount: 2 })
    ).toThrow('Expected 2 excerptResults')
  })

  it('rejects more than two items per excerpt', () => {
    expect(() =>
      parseLearningItemPayload(
        {
          excerptResults: [
            {
              items: [item, item, item]
            }
          ]
        },
        { excerptCount: 1 }
      )
    ).toThrow()
  })

  it('rejects empty or too many tags', () => {
    expect(() =>
      parseLearningItemPayload(
        {
          excerptResults: [{ items: [{ ...item, tags: [] }] }]
        },
        { excerptCount: 1 }
      )
    ).toThrow()

    expect(() =>
      parseLearningItemPayload(
        {
          excerptResults: [
            { items: [{ ...item, tags: ['one', 'two', 'three', 'four'] }] }
          ]
        },
        { excerptCount: 1 }
      )
    ).toThrow()
  })

  it('describes English-first field semantics in the JSON schema', () => {
    const schema = learningItemJsonSchema({ excerptCount: 2 }) as {
      properties: {
        excerptResults: {
          minItems?: number
          maxItems?: number
          items: {
            properties: {
              items: {
                maxItems?: number
                items: {
                  properties: Record<string, { description?: string }>
                }
              }
            }
          }
        }
      }
    }
    const itemProperties =
      schema.properties.excerptResults.items.properties.items.items.properties

    expect(schema.properties.excerptResults.minItems).toBe(2)
    expect(schema.properties.excerptResults.maxItems).toBe(2)
    expect(schema.properties.excerptResults.items.properties.items.maxItems).toBe(2)
    expect(itemProperties.sourceText.description).toContain('English expression')
    expect(itemProperties.targetText.description).toContain('Chinese meaning')
    expect(itemProperties.gloss.description).toContain('English definition')
  })
})
