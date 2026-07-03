import type { JobEvent } from '../../../shared/ipc/events'

export type CachedJobSnapshot = Record<string, unknown>

export function mergeJobSnapshotEvent(
  previous: CachedJobSnapshot | undefined,
  event: JobEvent
) {
  return {
    ...previous,
    id: event.jobId,
    status: event.status,
    selectedSessionCount: event.totalSelectedSessionCount,
    processedSessionCount: event.processedSessionCount,
    createdItemCount: event.createdItemCount,
    warningCount: event.warningCount,
    failureCount: event.failureCount,
    currentSessionTitle: event.currentSessionTitle,
    currentBatchLabel: event.currentBatchLabel,
    currentBatchIndex:
      'currentBatchIndex' in event
        ? event.currentBatchIndex ?? null
        : previous?.currentBatchIndex ?? null,
    completedBatchCount:
      event.completedBatchCount ?? previous?.completedBatchCount ?? 0,
    totalBatchCount: event.totalBatchCount ?? previous?.totalBatchCount ?? 0,
    candidateCount: event.candidateCount ?? previous?.candidateCount ?? 0,
    batchSize: event.batchSize ?? previous?.batchSize,
    inputBatches: event.inputBatches ?? previous?.inputBatches ?? [],
    lastCheckpoint: event.lastCheckpoint ?? null,
    failedBatchCount: event.failedBatchCount ?? 0,
    failureReason: event.failureReason ?? null,
    canResume: event.canResume ?? false,
    resumeBlockedReason: event.resumeBlockedReason ?? null,
    workbookId: previous?.workbookId ?? null
  }
}
