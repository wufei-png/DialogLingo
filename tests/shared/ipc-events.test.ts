import { describe, expect, it } from 'vitest'
import { jobEventSchema, launchScanStatusSchema } from '../../src/shared/ipc/events'

describe('jobEventSchema', () => {
  it('accepts enriched job events without a failure reason', () => {
    const parsed = jobEventSchema.parse({
      kind: 'phase',
      jobId: 'job-1',
      status: 'normalizing',
      totalSelectedSessionCount: 1,
      processedSessionCount: 0,
      createdItemCount: 0,
      warningCount: 0,
      failureCount: 0,
      currentSessionTitle: 'hi',
      currentBatchLabel: 'mock llm startup',
      lastCheckpoint: null,
      canResume: false,
      resumeBlockedReason: null,
      failedBatchCount: 0,
      failureReason: null
    })

    expect(parsed.failureReason).toBeNull()
  })
})

describe('launchScanStatusSchema', () => {
  it('accepts cached-index availability for background launch scans', () => {
    const parsed = launchScanStatusSchema.parse({
      phase: 'scanning',
      scanOnLaunch: true,
      hasIndexedSessions: true,
      failureMessage: null,
      launchPlan: null
    })

    expect(parsed.hasIndexedSessions).toBe(true)
  })
})
