import { describe, expect, it } from 'vitest'
import { getWorkbookStoppedState } from '../../src/renderer/src/features/workbook/workbookStoppedModel'

describe('getWorkbookStoppedState', () => {
  it('enables resume when the stopped job has a valid checkpoint', () => {
    expect(
      getWorkbookStoppedState({
        status: 'failed',
        failureReason: 'model-request-failure',
        lastCheckpoint: 'enrichment_batches',
        failedBatchCount: 1,
        canResume: true
      })
    ).toEqual({
      statusLabel: 'failed',
      failureText: 'model-request-failure',
      lastCheckpoint: 'enrichment_batches',
      failedBatchCount: 1,
      canResume: true,
      resumeBlockedReason: null
    })
  })

  it('keeps resume disabled with the backend-provided block reason', () => {
    expect(
      getWorkbookStoppedState({
        status: 'cancelled',
        lastCheckpoint: 'generation_job_sessions',
        canResume: false,
        resumeBlockedReason: 'Session s1 changed since this generation started.'
      })
    ).toMatchObject({
      statusLabel: 'cancelled',
      canResume: false,
      resumeBlockedReason: 'Session s1 changed since this generation started.'
    })
  })
})
