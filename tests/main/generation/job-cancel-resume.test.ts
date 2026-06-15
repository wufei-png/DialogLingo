import { describe, expect, it } from 'vitest'
import { reduceJobEvent } from '../../../src/main/errors/jobIssues'

describe('reduceJobEvent', () => {
  it('keeps cancelled jobs resumable from persisted checkpoints', () => {
    const next = reduceJobEvent(
      {
        status: 'materializing',
        lastCheckpoint: 'ranked_orders'
      },
      {
        kind: 'snapshot',
        status: 'cancelled'
      }
    )

    expect(next.status).toBe('cancelled')
    expect(next.lastCheckpoint).toBe('ranked_orders')
  })
})
