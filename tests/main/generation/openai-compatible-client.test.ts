import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  enrichOpenAiCompatibleCandidateBatch,
  normalizeOpenAiChatCompletionsUrl
} from '../../../src/main/generation/openAiCompatibleClient'
import { ModelAdapterError } from '../../../src/main/generation/modelAdapter'
import { STRUCTURED_OUTPUT_REMINDER } from '../../../src/main/generation/prompts'

const samplePayload = {
  excerptResults: [
    {
      items: [
        {
          itemType: 'Expression',
          sourceText: 'ship it',
          targetText: '发布它',
          gloss: 'release something',
          contextText: 'We can ship it today.',
          explanation: '一个常见的软件发布表达。',
          quizPrompt: '“发布它”用英语怎么说？',
          quizAnswer: 'ship it',
          tags: ['product']
        }
      ]
    }
  ]
}

describe('normalizeOpenAiChatCompletionsUrl', () => {
  it('accepts proxy root, v1 base, and full chat completions URLs', () => {
    expect(normalizeOpenAiChatCompletionsUrl('http://localhost:4000')).toBe(
      'http://localhost:4000/v1/chat/completions'
    )
    expect(normalizeOpenAiChatCompletionsUrl('http://localhost:4000/v1')).toBe(
      'http://localhost:4000/v1/chat/completions'
    )
    expect(
      normalizeOpenAiChatCompletionsUrl(
        'http://localhost:4000/v1/chat/completions'
      )
    ).toBe('http://localhost:4000/v1/chat/completions')
  })
})

describe('enrichOpenAiCompatibleCandidateBatch', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('parses structured OpenAI-compatible JSON responses', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify(samplePayload)
              }
            }
          ]
        }),
        { status: 200 }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    const items = await enrichOpenAiCompatibleCandidateBatch({
      baseUrl: 'http://localhost:4000',
      apiKey: 'sk-test',
      model: 'gpt-4o-mini',
      prompt: 'candidate',
      excerptCount: 1
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/v1/chat/completions',
      expect.any(Object)
    )
    expect(items.excerptResults).toHaveLength(1)
    expect(items.excerptResults[0]?.items[0]?.itemType).toBe('Expression')
  })

  it('retries with json_object using the shared structured-output reminder', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('unsupported schema', { status: 400 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(samplePayload) } }]
          }),
          { status: 200 }
        )
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      enrichOpenAiCompatibleCandidateBatch({
        baseUrl: 'http://localhost:4000',
        apiKey: 'sk-test',
        model: 'gpt-4o-mini',
        prompt: 'candidate',
        excerptCount: 1
      })
    ).resolves.toMatchObject(samplePayload)

    const secondRequest = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string)
    expect(secondRequest.response_format).toEqual({ type: 'json_object' })
    expect(secondRequest.messages[1].content).toContain(STRUCTURED_OUTPUT_REMINDER)
  })

  it('classifies invalid structured payloads', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"items":[{"itemType":"Expression"}]}' } }]
          }),
          { status: 200 }
        )
      )
    )

    await expect(
      enrichOpenAiCompatibleCandidateBatch({
        baseUrl: 'http://localhost:4000',
        apiKey: 'sk-test',
        model: 'gpt-4o-mini',
        prompt: 'candidate',
        excerptCount: 1
      })
    ).rejects.toMatchObject({
      reason: 'invalid-structured-payload'
    } satisfies Partial<ModelAdapterError>)
  })
})
