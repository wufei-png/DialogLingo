import { describe, expect, it } from 'vitest'
import { mergeGenerationProgressEvent } from '../../../src/main/generation/jobProgress'

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

function createEvent(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'phase' as const,
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
    ...overrides
  }
}

describe('mergeGenerationProgressEvent', () => {
  it('keeps input batches for in-memory snapshots without persisting them', () => {
    const first = mergeGenerationProgressEvent({
      event: createEvent({ inputBatches }),
      previousProgress: {},
      previousInputBatches: [],
      resumeStatus: {
        checkpoint: null,
        canResume: false,
        resumeBlockedReason: null
      }
    })

    expect(first.enrichedEvent.inputBatches).toEqual(inputBatches)
    expect(first.inputBatchesForSnapshot).toEqual(inputBatches)
    expect(first.persistedProgress).not.toHaveProperty('inputBatches')

    const second = mergeGenerationProgressEvent({
      event: createEvent({
        currentBatchLabel: 'llm batch 1 / 1 complete',
        completedBatchCount: 1
      }),
      previousProgress: first.persistedProgress,
      previousInputBatches: first.inputBatchesForSnapshot,
      resumeStatus: {
        checkpoint: null,
        canResume: false,
        resumeBlockedReason: null
      }
    })

    expect(second.enrichedEvent).not.toHaveProperty('inputBatches')
    expect(second.inputBatchesForSnapshot).toEqual(inputBatches)
    expect(second.persistedProgress).not.toHaveProperty('inputBatches')
  })
})
