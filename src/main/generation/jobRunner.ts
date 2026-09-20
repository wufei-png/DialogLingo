import { jobEventSchema } from '../../shared/ipc/events'
import type { Settings } from '../../shared/schemas/settings'
import { logger } from '../logging'
import {
  isGenerationCheckpointEvent,
  type GenerationCheckpointEvent,
  type ResumeCheckpointPayload
} from './checkpointEvents'
import { spawnGenerationWorker } from './spawnGenerationWorker'

function elapsedMs(startedAt: number) {
  return Date.now() - startedAt
}

function summarizeSessions(
  sessions: Parameters<typeof runGenerationJob>[0]['sessions']
) {
  return sessions.reduce(
    (summary, session) => {
      summary.turnCount += session.turns.length
      summary.textChars += session.turns.reduce(
        (count, turn) => count + turn.text.length,
        0
      )
      return summary
    },
    {
      sessionCount: sessions.length,
      turnCount: 0,
      textChars: 0
    }
  )
}

export async function runGenerationJob(input: {
  jobId: string
  sessions: Array<{
    sessionId: string
    title: string
    turns: Array<{
      role: 'user' | 'assistant'
      text: string
      sourceSpanRef: string
      isToolNoise?: boolean
    }>
  }>
  settings: Pick<Settings, 'modelBackend'> & {
    provider: Settings['provider']
    privacy: Pick<Settings['privacy'], 'redactBeforeRemoteSend'>
    generation: {
      expressionDifficulty: Settings['generation']['expressionDifficulty']
      batchSize: number
      maxItemsPerSession: number
      typeBalanceProfile: Settings['generation']['typeBalanceProfile']
    }
  }
  promptOverride?: string
  resumeCheckpoint?: ResumeCheckpointPayload | null
  emit: (event: unknown) => void
  onCheckpoint?: (event: GenerationCheckpointEvent) => void
  onCompletedItems: (
    items: Array<{
      id: string
      itemType: 'Expression' | 'Sentence'
      generatedSnapshot: unknown
      currentSnapshot: unknown
      sourceRefs: Array<{
        sessionId: string
        sourceSpanRef: string
        excerpt: string
      }>
    }>
  ) => void
}) {
  const startedAt = Date.now()
  logger.debug('generation-worker', 'spawn start', {
    jobId: input.jobId,
    ...summarizeSessions(input.sessions)
  })
  const worker = spawnGenerationWorker((event) => {
    if (isGenerationCheckpointEvent(event)) {
      logger.debug('generation-worker', 'checkpoint received from worker', {
        jobId: input.jobId,
        checkpoint: event.checkpoint,
        batchIndex: 'batchIndex' in event ? event.batchIndex : undefined,
        elapsedSinceSpawnMs: elapsedMs(startedAt)
      })
      input.onCheckpoint?.(event)
      return
    }

    const payload = event as {
      kind?: string
      status?: string
      processedSessionCount?: number
      totalSelectedSessionCount?: number
      currentBatchLabel?: string | null
      items?: Parameters<typeof input.onCompletedItems>[0]
    }
    logger.debug('generation-worker', 'event received from worker', {
      jobId: input.jobId,
      kind: payload.kind,
      status: payload.status,
      processedSessionCount: payload.processedSessionCount,
      totalSelectedSessionCount: payload.totalSelectedSessionCount,
      currentBatchLabel: payload.currentBatchLabel,
      elapsedSinceSpawnMs: elapsedMs(startedAt)
    })
    if (Array.isArray(payload.items)) {
      input.onCompletedItems(payload.items)
    }

    input.emit(jobEventSchema.parse(event))
  })
  logger.debug('generation-worker', 'spawn complete', {
    jobId: input.jobId,
    durationMs: elapsedMs(startedAt)
  })
  worker.once('online', () => {
    logger.debug('generation-worker', 'worker online', {
      jobId: input.jobId,
      elapsedSinceSpawnMs: elapsedMs(startedAt)
    })
  })
  worker.once('exit', (code) => {
    const payload = {
      jobId: input.jobId,
      code,
      elapsedSinceSpawnMs: elapsedMs(startedAt)
    }
    if (code === 0) {
      logger.debug('generation-worker', 'worker exit', payload)
      return
    }

    logger.warn('generation-worker', 'worker exit', payload)
  })

  worker.on('error', (error) => {
    logger.error('generation-worker', 'worker error', {
      jobId: input.jobId,
      errorName: error.name,
      elapsedSinceSpawnMs: elapsedMs(startedAt)
    })
    input.emit(
      jobEventSchema.parse({
        kind: 'failure',
        jobId: input.jobId,
        status: 'failed',
        totalSelectedSessionCount: input.sessions.length,
        processedSessionCount: 0,
        createdItemCount: 0,
        warningCount: 0,
        failureCount: 1,
        failedBatchCount: 1,
        failureReason: 'model-request-failure',
        currentSessionTitle: null,
        currentBatchLabel: 'Generation worker failed.'
      })
    )
  })

  const postStartedAt = Date.now()
  logger.debug('generation-worker', 'post start message begin', {
    jobId: input.jobId,
    ...summarizeSessions(input.sessions),
    elapsedSinceSpawnMs: elapsedMs(startedAt)
  })
  worker.postMessage({
    type: 'start',
    jobId: input.jobId,
    sessions: input.sessions,
    provider: input.settings.provider,
    modelBackend: input.settings.modelBackend,
    generation: input.settings.generation,
    privacy: input.settings.privacy,
    promptOverride: input.promptOverride,
    resumeCheckpoint: input.resumeCheckpoint ?? null
  })
  logger.debug('generation-worker', 'post start message complete', {
    jobId: input.jobId,
    durationMs: elapsedMs(postStartedAt),
    elapsedSinceSpawnMs: elapsedMs(startedAt)
  })

  return worker
}
