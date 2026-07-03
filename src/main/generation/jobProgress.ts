import type { GenerationInputBatch } from '../../shared/schemas/jobs'

export type GenerationProgressEvent = {
  kind: 'snapshot' | 'phase' | 'warning' | 'failure' | 'completed'
  jobId: string
  status: string
  totalSelectedSessionCount: number
  processedSessionCount: number
  createdItemCount: number
  warningCount: number
  failureCount: number
  currentSessionTitle: string | null
  currentBatchLabel: string | null
  currentBatchIndex?: number | null
  completedBatchCount?: number
  totalBatchCount?: number
  candidateCount?: number
  batchSize?: number
  inputBatches?: GenerationInputBatch[]
  failedBatchCount?: number
  failureReason?: string | null
}

export type GenerationResumeProgress = {
  checkpoint: string | null
  canResume: boolean
  resumeBlockedReason: string | null
}

export type PersistedGenerationProgress = Record<string, unknown>

export function mergeGenerationProgressEvent(input: {
  event: GenerationProgressEvent
  previousProgress: PersistedGenerationProgress
  previousInputBatches?: GenerationInputBatch[]
  resumeStatus: GenerationResumeProgress
}) {
  const previousCurrentBatchIndex =
    typeof input.previousProgress.currentBatchIndex === 'number'
      ? input.previousProgress.currentBatchIndex
      : null
  const currentBatchIndex =
    'currentBatchIndex' in input.event
      ? input.event.currentBatchIndex ?? null
      : previousCurrentBatchIndex
  const previousBatchSize =
    typeof input.previousProgress.batchSize === 'number'
      ? input.previousProgress.batchSize
      : undefined
  const inputBatchesForSnapshot =
    input.event.inputBatches ?? input.previousInputBatches ?? []
  const enrichedEvent = {
    ...input.event,
    lastCheckpoint:
      input.resumeStatus.checkpoint ??
      input.previousProgress.lastCheckpoint ??
      null,
    failedBatchCount:
      input.event.failedBatchCount ??
      input.previousProgress.failedBatchCount ??
      0,
    currentBatchIndex,
    completedBatchCount:
      input.event.completedBatchCount ??
      input.previousProgress.completedBatchCount ??
      0,
    totalBatchCount:
      input.event.totalBatchCount ??
      input.previousProgress.totalBatchCount ??
      0,
    candidateCount:
      input.event.candidateCount ??
      input.previousProgress.candidateCount ??
      0,
    batchSize: input.event.batchSize ?? previousBatchSize,
    failureReason:
      input.event.failureReason ??
      input.previousProgress.failureReason ??
      null,
    canResume: input.resumeStatus.canResume,
    resumeBlockedReason: input.resumeStatus.resumeBlockedReason,
    ...(input.event.inputBatches ? { inputBatches: input.event.inputBatches } : {})
  }
  const persistedProgress = { ...enrichedEvent }
  delete (persistedProgress as { inputBatches?: unknown }).inputBatches

  return {
    enrichedEvent,
    persistedProgress,
    inputBatchesForSnapshot
  }
}
