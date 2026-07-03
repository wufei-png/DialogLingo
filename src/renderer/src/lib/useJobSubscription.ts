import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { JobEvent } from '../../../shared/ipc/events'
import { mergeJobSnapshotEvent } from './jobSubscriptionModel'

export function useJobSubscription() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const unsubscribe = window.dialoglingoJobs?.subscribe((event: JobEvent) => {
      queryClient.setQueryData(['job', event.jobId], event)
      queryClient.setQueryData(
        ['job-snapshot', event.jobId],
        (previous: Record<string, unknown> | undefined) =>
          mergeJobSnapshotEvent(previous, event)
      )
    })

    return unsubscribe
  }, [queryClient])
}
