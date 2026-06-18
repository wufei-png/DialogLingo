import {
  ModelAdapterError,
  learningItemJsonSchema,
  parseLearningItemContent
} from './modelAdapter'
import { logger } from '../logging'

export function normalizeOpenAiChatCompletionsUrl(baseUrl: string) {
  const trimmed = baseUrl.trim()
  if (!trimmed) {
    throw new ModelAdapterError(
      'OpenAI-compatible base URL is required.',
      'model-request-failure'
    )
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
      throw new ModelAdapterError(
        `OpenAI-compatible request failed with HTTP ${response.status}.`,
        'model-request-failure'
      )
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    return json.choices?.[0]?.message?.content ?? ''
  } catch (error) {
    if (error instanceof ModelAdapterError) {
      throw error
    }
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ModelAdapterError('OpenAI-compatible request timed out.', 'provider-timeout')
    }
    throw new ModelAdapterError(
      error instanceof Error ? error.message : 'OpenAI-compatible request failed.',
      'model-request-failure'
    )
  } finally {
    clearTimeout(timeout)
  }
}

export async function enrichOpenAiCompatibleCandidateBatch(input: {
  baseUrl: string
  apiKey: string
  model: string
  prompt: string
  timeoutMs?: number
}) {
  const url = normalizeOpenAiChatCompletionsUrl(input.baseUrl)
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
    return parseLearningItemContent(content)
  } catch (error) {
    if (
      error instanceof ModelAdapterError &&
      error.reason !== 'model-request-failure'
    ) {
      throw error
    }

    // Some OpenAI-compatible gateways reject strict json_schema even when they
    // support JSON mode. Retry once with a looser contract before failing.
    logger.debug('generation-openai', 'retrying with json_object response format', {
      model: input.model,
      reason: error instanceof ModelAdapterError ? error.reason : 'unknown'
    })
    const content = await requestCompletion({
      url,
      apiKey: input.apiKey,
      model: input.model,
      prompt: `${input.prompt}\n\nReturn JSON in this exact shape: {"items":[{"itemType":"Expression","sourceText":"...","targetText":"...","gloss":"...","contextText":"...","explanation":"...","quizPrompt":"...","quizAnswer":"...","tags":["..."]}]}`,
      timeoutMs,
      responseFormat: { type: 'json_object' }
    })
    return parseLearningItemContent(content)
  }
}
