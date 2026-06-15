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
    failedBatchCount?: number
    failureReason?:
      | 'invalid-structured-payload'
      | 'provider-timeout'
      | 'litellm-request-failure'
  }
) {
  return {
    ...state,
    status: event.status,
    failedBatchCount: event.failedBatchCount ?? state.failedBatchCount ?? 0,
    failureReason: event.failureReason ?? state.failureReason ?? null
  }
}
