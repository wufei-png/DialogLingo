import { jobEventSchema } from '../../shared/ipc/events'
import type { Settings } from '../../shared/schemas/settings'
import { spawnGenerationWorker } from './spawnGenerationWorker'

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
    generation: {
      expressionDifficulty: Settings['generation']['expressionDifficulty']
      batchSize: number
      maxItemsPerSession: number
    }
  }
  promptOverride?: string
  emit: (event: unknown) => void
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
  const worker = spawnGenerationWorker((event) => {
    const payload = event as {
      items?: Parameters<typeof input.onCompletedItems>[0]
    }
    if (Array.isArray(payload.items)) {
      input.onCompletedItems(payload.items)
    }

    input.emit(jobEventSchema.parse(event))
  })

  worker.on('error', (error) => {
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
        currentBatchLabel: error.message
      })
    )
  })

  worker.postMessage({
    type: 'start',
    jobId: input.jobId,
    sessions: input.sessions,
    provider: input.settings.provider,
    modelBackend: input.settings.modelBackend,
    generation: input.settings.generation,
    promptOverride: input.promptOverride
  })

  return worker
}
