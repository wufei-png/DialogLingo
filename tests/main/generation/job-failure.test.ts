import { describe, expect, it } from 'vitest'
import { reduceJobEvent } from '../../../src/main/errors/jobIssues'

describe('reduceJobEvent failures', () => {
  it('preserves failed-batch counters and restart diagnostics on invalid structured payload', () => {
    const next = reduceJobEvent(
      {
        status: 'enriching',
        lastCheckpoint: 'enrichment_batches',
        failedBatchCount: 0
      },
      {
        kind: 'failure',
        status: 'failed',
        failedBatchCount: 1
      }
    )

    expect(next.status).toBe('failed')
    expect(next.failedBatchCount).toBe(1)
  })

  it('captures provider timeout and LiteLLM request failure as restartable diagnostics', () => {
    const timeout = reduceJobEvent(
      {
        status: 'enriching',
        lastCheckpoint: 'enrichment_batches',
        failedBatchCount: 0
      },
      {
        kind: 'failure',
        status: 'failed',
        failedBatchCount: 1,
        failureReason: 'provider-timeout'
      }
    )

    const gateway = reduceJobEvent(
      {
        status: 'enriching',
        lastCheckpoint: 'enrichment_batches',
        failedBatchCount: 0
      },
      {
        kind: 'failure',
        status: 'failed',
        failedBatchCount: 1,
        failureReason: 'litellm-request-failure'
      }
    )

    expect(timeout.failureReason).toBe('provider-timeout')
    expect(gateway.failureReason).toBe('litellm-request-failure')
  })
})
