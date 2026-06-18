export type WorkbookStoppedJob = {
  status?: string | null
  lastCheckpoint?: string | null
  failedBatchCount?: number | null
  failureReason?: string | null
  canResume?: boolean | null
  resumeBlockedReason?: string | null
}

export function getWorkbookStoppedState(
  job: WorkbookStoppedJob | null | undefined,
  labels = {
    statusLabel: 'stopped',
    failureText: 'No workbook was created.',
    lastCheckpoint: 'none'
  }
) {
  return {
    statusLabel: job?.status ?? labels.statusLabel,
    failureText: job?.failureReason ?? labels.failureText,
    lastCheckpoint: job?.lastCheckpoint ?? labels.lastCheckpoint,
    failedBatchCount: job?.failedBatchCount ?? 0,
    canResume: Boolean(job?.canResume),
    resumeBlockedReason: job?.resumeBlockedReason ?? null
  }
}
