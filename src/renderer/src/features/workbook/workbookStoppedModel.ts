export type WorkbookStoppedJob = {
  status?: string | null
  lastCheckpoint?: string | null
  failedBatchCount?: number | null
  failureReason?: string | null
  canResume?: boolean | null
  resumeBlockedReason?: string | null
}

export function getWorkbookStoppedState(job: WorkbookStoppedJob | null | undefined) {
  return {
    statusLabel: job?.status ?? 'stopped',
    failureText: job?.failureReason ?? 'No workbook was created.',
    lastCheckpoint: job?.lastCheckpoint ?? 'none',
    failedBatchCount: job?.failedBatchCount ?? 0,
    canResume: Boolean(job?.canResume),
    resumeBlockedReason: job?.resumeBlockedReason ?? null
  }
}
