export function reduceJobEvent(
  state: {
    status: string
    lastCheckpoint: string | null
    failedBatchCount?: number
    failureReason?: string | null
  },
  event: {
    kind: string
    status: string
    lastCheckpoint?: string | null
    failedBatchCount?: number
    failureReason?:
      | 'invalid-structured-payload'
      | 'provider-timeout'
      | 'model-request-failure'
  }
) {
  return {
    ...state,
    status: event.status,
    lastCheckpoint: event.lastCheckpoint ?? state.lastCheckpoint,
    failedBatchCount: event.failedBatchCount ?? state.failedBatchCount ?? 0,
    failureReason: event.failureReason ?? state.failureReason ?? null
  }
}
