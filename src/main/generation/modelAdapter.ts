import { z } from 'zod'

export type ModelAdapterFailureReason =
  | 'provider-timeout'
  | 'model-request-failure'
  | 'invalid-structured-payload'

const learningItemDraftSchema = z.object({
  itemType: z.enum(['Expression', 'Sentence']),
  sourceText: z.string(),
  targetText: z.string(),
  gloss: z.string(),
  contextText: z.string(),
  explanation: z.string(),
  quizPrompt: z.string(),
  quizAnswer: z.string(),
  tags: z.array(z.string().regex(/^[a-z0-9][a-z0-9-]{0,31}$/)).min(1).max(3)
}).strict()

const excerptEnrichmentResultSchema = z.object({
  items: z.array(learningItemDraftSchema).max(2)
}).strict()

const responsePayloadSchema = z.object({
  excerptResults: z.array(excerptEnrichmentResultSchema)
}).strict()

export type LearningItemDraft = z.infer<typeof learningItemDraftSchema>
export type ExcerptEnrichmentResult = z.infer<typeof excerptEnrichmentResultSchema>
export type BatchEnrichmentResult = z.infer<typeof responsePayloadSchema>

export class ModelAdapterError extends Error {
  constructor(
    message: string,
    readonly reason: ModelAdapterFailureReason
  ) {
    super(message)
    this.name = 'ModelAdapterError'
  }
}

export function learningItemJsonSchema(input?: { excerptCount?: number }) {
  const itemProperties = {
    itemType: {
      type: 'string',
      enum: ['Expression', 'Sentence'],
      description:
        'Expression for reusable words or phrases; Sentence for full sentence patterns.'
    },
    sourceText: {
      type: 'string',
      description: 'English expression or sentence the learner should study.'
    },
    targetText: {
      type: 'string',
      description: 'Concise Chinese meaning or translation.'
    },
    gloss: {
      type: 'string',
      description: 'Short simple English definition or paraphrase.'
    },
    contextText: {
      type: 'string',
      description:
        'Short natural English context sentence or minimal excerpt showing sourceText in use.'
    },
    explanation: {
      type: 'string',
      description:
        'Chinese usage note, with English pattern or collocation if useful.'
    },
    quizPrompt: {
      type: 'string',
      description: 'Chinese cue asking the learner to recall the English.'
    },
    quizAnswer: {
      type: 'string',
      description: 'Expected English answer.'
    },
    tags: {
      type: 'array',
      description: 'One to three short lowercase English tags.',
      minItems: 1,
      maxItems: 3,
      items: {
        type: 'string',
        pattern: '^[a-z0-9][a-z0-9-]{0,31}$'
      }
    }
  }

  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      excerptResults: {
        type: 'array',
        ...(typeof input?.excerptCount === 'number'
          ? {
              minItems: input.excerptCount,
              maxItems: input.excerptCount
            }
          : {}),
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            items: {
              type: 'array',
              maxItems: 2,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: itemProperties,
                required: Object.keys(itemProperties)
              }
            }
          },
          required: ['items']
        }
      }
    },
    required: ['excerptResults']
  }
}

export function parseLearningItemPayload(
  payload: unknown,
  input?: { excerptCount?: number }
) {
  try {
    const parsed = responsePayloadSchema.parse(payload)
    if (
      typeof input?.excerptCount === 'number' &&
      parsed.excerptResults.length !== input.excerptCount
    ) {
      throw new Error(
        `Expected ${input.excerptCount} excerptResults, received ${parsed.excerptResults.length}.`
      )
    }

    return parsed
  } catch (error) {
    throw new ModelAdapterError(
      error instanceof Error ? error.message : 'Invalid structured payload.',
      'invalid-structured-payload'
    )
  }
}

export function parseLearningItemContent(
  content: string,
  input?: { excerptCount?: number }
) {
  try {
    return parseLearningItemPayload(JSON.parse(content), input)
  } catch (error) {
    if (error instanceof ModelAdapterError) {
      throw error
    }

    throw new ModelAdapterError(
      error instanceof Error ? error.message : 'Invalid structured payload.',
      'invalid-structured-payload'
    )
  }
}
