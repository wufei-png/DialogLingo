import { describe, expect, it } from 'vitest'
import type { JobEvent } from '../../src/shared/ipc/events'
import { mergeJobSnapshotEvent } from '../../src/renderer/src/lib/jobSubscriptionModel'

const inputBatches = [
  {
    batchIndex: 0,
    excerpts: [
      {
        id: 'candidate-1',
        sessionTitle: 'Session one',
        role: 'assistant' as const,
        promptText: 'We can ship it today.'
      }
    ]
  }
]

function createEvent(overrides: Partial<JobEvent> = {}): JobEvent {
  return {
    kind: 'phase',
    jobId: 'job-1',
    status: 'enriching',
    totalSelectedSessionCount: 1,
    processedSessionCount: 1,
    createdItemCount: 0,
    warningCount: 0,
    failureCount: 0,
    currentSessionTitle: null,
    currentBatchLabel: 'llm batch 1 / 1',
    currentBatchIndex: 0,
    completedBatchCount: 0,
    totalBatchCount: 1,
    candidateCount: 1,
    batchSize: 1,
    lastCheckpoint: null,
    canResume: false,
    resumeBlockedReason: null,
    failedBatchCount: 0,
    failureReason: null,
    ...overrides
  }
}

describe('mergeJobSnapshotEvent', () => {
  it('keeps first input batch payload when later events omit it', () => {
    const first = mergeJobSnapshotEvent(
      undefined,
      createEvent({ inputBatches })
    )
    const second = mergeJobSnapshotEvent(
      first,
      createEvent({
        currentBatchLabel: 'llm batch 1 / 1 complete',
        completedBatchCount: 1
      })
    )

    expect(first.inputBatches).toEqual(inputBatches)
    expect(second.inputBatches).toEqual(inputBatches)
    expect(second.completedBatchCount).toBe(1)
  })
})
