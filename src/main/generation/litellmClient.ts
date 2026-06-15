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

const responsePayloadSchema = z.array(learningItemDraftSchema)

export type LearningItemDraft = z.infer<typeof learningItemDraftSchema>

export async function enrichCandidateBatch(input: {
  baseUrl: string
  apiKey: string
  model: string
  prompt: string
}) {
  const response = await fetch(`${input.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${input.apiKey}`
    },
    body: JSON.stringify({
      model: input.model,
      messages: [{ role: 'user', content: input.prompt }],
      response_format: { type: 'json_object' }
    })
  })

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = json.choices?.[0]?.message?.content ?? '[]'

  return responsePayloadSchema.parse(JSON.parse(content))
}
