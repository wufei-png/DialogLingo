import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { JobEvent } from '../../../shared/ipc/events'

export function useJobSubscription() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const unsubscribe = window.dialoglingoJobs?.subscribe((event: JobEvent) => {
      queryClient.setQueryData(['job', event.jobId], event)
      queryClient.setQueryData(['job-snapshot', event.jobId], {
        id: event.jobId,
        status: event.status,
        selectedSessionCount: event.totalSelectedSessionCount,
        processedSessionCount: event.processedSessionCount,
        createdItemCount: event.createdItemCount,
        warningCount: event.warningCount,
        failureCount: event.failureCount,
        currentSessionTitle: event.currentSessionTitle,
        currentBatchLabel: event.currentBatchLabel,
        failureReason: event.failureReason ?? null,
        workbookId: null
      })
    })

    return unsubscribe
  }, [queryClient])
}
