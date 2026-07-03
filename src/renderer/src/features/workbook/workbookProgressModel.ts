export type WorkbookProgressSnapshot = {
  status?: string | null
  selectedSessionCount?: number
  processedSessionCount?: number
  totalBatchCount?: number
  completedBatchCount?: number
}

const BATCH_PROGRESS_STATUSES = new Set([
  'enriching',
  'ranking',
  'materializing',
  'completed'
])

export function getProgressPercent(processed: number, total: number) {
  if (total <= 0) {
    return 0
  }

  return Math.max(0, Math.min(100, Math.round((processed / total) * 100)))
}

export function getWorkbookProgressPercent(snapshot: WorkbookProgressSnapshot | null) {
  if (
    snapshot?.status &&
    BATCH_PROGRESS_STATUSES.has(snapshot.status) &&
    (snapshot.totalBatchCount ?? 0) > 0
  ) {
    return getProgressPercent(
      snapshot.completedBatchCount ?? 0,
      snapshot.totalBatchCount ?? 0
    )
  }

  return getProgressPercent(
    snapshot?.processedSessionCount ?? 0,
    snapshot?.selectedSessionCount ?? 0
  )
}

export function getWorkbookActiveProgressPercent(
  snapshot: WorkbookProgressSnapshot & { currentBatchIndex?: number | null } | null
) {
  if (
    snapshot?.status &&
    BATCH_PROGRESS_STATUSES.has(snapshot.status) &&
    (snapshot.totalBatchCount ?? 0) > 0 &&
    typeof snapshot.currentBatchIndex === 'number'
  ) {
    return getProgressPercent(
      Math.max(snapshot.completedBatchCount ?? 0, snapshot.currentBatchIndex + 1),
      snapshot.totalBatchCount ?? 0
    )
  }

  return getWorkbookProgressPercent(snapshot)
}
