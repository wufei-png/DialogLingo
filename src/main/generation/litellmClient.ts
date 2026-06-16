import { z } from 'zod'

const learningItemDraftSchema = z.object({
  itemType: z.enum(['Expression', 'Sentence']),
  sourceText: z.string(),
  targetText: z.string(),
  gloss: z.string(),
  contextText: z.string(),
  explanation: z.string(),
  quizPrompt: z.string(),
  quizAnswer: z.string(),
  tags: z.array(z.string())
})

const responsePayloadSchema = z.union([
  z.array(learningItemDraftSchema),
  z.object({ items: z.array(learningItemDraftSchema) }).transform((value) => value.items)
])

export type LearningItemDraft = z.infer<typeof learningItemDraftSchema>

export class LiteLlmClientError extends Error {
  constructor(
    message: string,
    readonly reason:
      | 'provider-timeout'
      | 'litellm-request-failure'
      | 'invalid-structured-payload'
  ) {
    super(message)
    this.name = 'LiteLlmClientError'
  }
}

export function normalizeLiteLlmChatCompletionsUrl(baseUrl: string) {
  const trimmed = baseUrl.trim()
  if (!trimmed) {
    throw new LiteLlmClientError('LiteLLM base URL is required.', 'litellm-request-failure')
  }

  const url = new URL(trimmed)
  const normalizedPath = url.pathname.replace(/\/+$/, '')
  if (normalizedPath.endsWith('/chat/completions')) {
    url.pathname = normalizedPath
    return url.toString()
  }

  if (normalizedPath.endsWith('/v1')) {
    url.pathname = `${normalizedPath}/chat/completions`
    return url.toString()
  }

  url.pathname = `${normalizedPath}/v1/chat/completions`.replace(/^\/?/, '/')
  return url.toString()
}

function learningItemJsonSchema() {
  const itemProperties = {
    itemType: { type: 'string', enum: ['Expression', 'Sentence'] },
    sourceText: { type: 'string' },
    targetText: { type: 'string' },
    gloss: { type: 'string' },
    contextText: { type: 'string' },
    explanation: { type: 'string' },
    quizPrompt: { type: 'string' },
    quizAnswer: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } }
  }

  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      items: {
        type: 'array',
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

function parseContent(content: string) {
  try {
    return responsePayloadSchema.parse(JSON.parse(content))
  } catch (error) {
    throw new LiteLlmClientError(
      error instanceof Error ? error.message : 'Invalid structured payload.',
      'invalid-structured-payload'
    )
  }
}

async function requestCompletion(input: {
  url: string
  apiKey: string
  model: string
  prompt: string
  responseFormat: Record<string, unknown>
  timeoutMs: number
}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs)

  try {
    const response = await fetch(input.url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${input.apiKey}`
      },
      body: JSON.stringify({
        model: input.model,
        messages: [
          {
            role: 'system',
            content:
              'You generate bilingual learning workbook items. Return only JSON matching the requested schema.'
          },
          { role: 'user', content: input.prompt }
        ],
        response_format: input.responseFormat,
        temperature: 0.2
      })
    })

    if (!response.ok) {
      throw new LiteLlmClientError(
        `LiteLLM request failed with HTTP ${response.status}.`,
        'litellm-request-failure'
      )
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    return json.choices?.[0]?.message?.content ?? ''
  } catch (error) {
    if (error instanceof LiteLlmClientError) {
      throw error
    }
    if (error instanceof Error && error.name === 'AbortError') {
      throw new LiteLlmClientError('LiteLLM request timed out.', 'provider-timeout')
    }
    throw new LiteLlmClientError(
      error instanceof Error ? error.message : 'LiteLLM request failed.',
      'litellm-request-failure'
    )
  } finally {
    clearTimeout(timeout)
  }
}

export async function enrichCandidateBatch(input: {
  baseUrl: string
  apiKey: string
  model: string
  prompt: string
  timeoutMs?: number
}) {
  const url = normalizeLiteLlmChatCompletionsUrl(input.baseUrl)
  const timeoutMs = input.timeoutMs ?? 60_000

  try {
    const content = await requestCompletion({
      url,
      apiKey: input.apiKey,
      model: input.model,
      prompt: input.prompt,
      timeoutMs,
      responseFormat: {
        type: 'json_schema',
        json_schema: {
          name: 'dialoglingo_learning_items',
          schema: learningItemJsonSchema(),
          strict: true
        }
      }
    })
    return parseContent(content)
  } catch (error) {
    if (
      error instanceof LiteLlmClientError &&
      error.reason !== 'litellm-request-failure'
    ) {
      throw error
    }

    const content = await requestCompletion({
      url,
      apiKey: input.apiKey,
      model: input.model,
      prompt: `${input.prompt}\n\nReturn JSON in this exact shape: {"items":[{"itemType":"Expression","sourceText":"...","targetText":"...","gloss":"...","contextText":"...","explanation":"...","quizPrompt":"...","quizAnswer":"...","tags":["..."]}]}`,
      timeoutMs,
      responseFormat: { type: 'json_object' }
    })
    return parseContent(content)
  }
}
