import type { ExpressionDifficulty } from '../../shared/schemas/settings'
import { mineCandidateGroups } from './candidates'
import { precleanTurns } from './preclean'
import { buildGenerationPromptTemplate, renderGenerationPromptTemplate } from './prompts'
import { sanitizeModelPrompt } from './sanitizeModelPrompt'

export type GenerationPromptSession = {
  sessionId: string
  title: string
  turns: Array<{
    role: 'user' | 'assistant'
    text: string
    sourceSpanRef: string
    isToolNoise?: boolean
  }>
}

export type GenerationPromptCandidate = {
  sessionId: string
  sessionTitle: string
  sourceSpanRef: string
  promptText: string
  role?: 'user' | 'assistant'
}

export function collectGenerationPromptCandidates(input: {
  sessions: GenerationPromptSession[]
  maxItemsPerSession: number
}) {
  return input.sessions.flatMap((session) =>
    mineCandidateGroups(precleanTurns(session.turns))
      .slice(0, input.maxItemsPerSession)
      .map((candidate) => ({
        sessionId: session.sessionId,
        sessionTitle: session.title,
        sourceSpanRef: candidate.sourceSpanRef,
        promptText: candidate.promptText,
        ...(candidate.role ? { role: candidate.role } : {})
      }))
  )
}

export function buildGenerationPromptPreview(input: {
  sessions: GenerationPromptSession[]
  expressionDifficulty: ExpressionDifficulty
  maxItemsPerSession: number
  batchSize: number
  promptOverride?: string | null
  redactBeforeRemoteSend: boolean
}) {
  const candidates = collectGenerationPromptCandidates({
    sessions: input.sessions,
    maxItemsPerSession: input.maxItemsPerSession
  })

  const prompt = buildGenerationPromptTemplate({
    expressionDifficulty: input.expressionDifficulty
  })
  const exampleBatch = candidates.slice(0, input.batchSize)

  return {
    candidateCount: candidates.length,
    prompt,
    examplePrompt:
      exampleBatch.length > 0
        ? sanitizeModelPrompt(
            renderGenerationPromptTemplate({
              template: input.promptOverride?.trim() ? input.promptOverride : prompt,
              excerpts: exampleBatch
            }).prompt,
            input.redactBeforeRemoteSend
          )
        : null,
    redactBeforeRemoteSend: input.redactBeforeRemoteSend
  }
}
