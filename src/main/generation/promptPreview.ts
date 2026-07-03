import type { ExpressionDifficulty } from '../../shared/schemas/settings'
import { mineCandidateGroups } from './candidates'
import { precleanTurns } from './preclean'
import { buildGenerationPromptTemplate } from './prompts'

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
}) {
  const candidates = collectGenerationPromptCandidates({
    sessions: input.sessions,
    maxItemsPerSession: input.maxItemsPerSession
  })

  return {
    candidateCount: candidates.length,
    prompt: buildGenerationPromptTemplate({
      expressionDifficulty: input.expressionDifficulty
    })
  }
}
