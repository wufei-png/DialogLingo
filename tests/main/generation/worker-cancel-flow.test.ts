import { describe, expect, it } from 'vitest'
import type { GenerationCheckpointEvent } from '../../../src/main/generation/checkpointEvents'
import type {
  BatchEnrichmentResult,
  LearningItemDraft
} from '../../../src/main/generation/modelAdapter'
import {
  runEnrichmentFromCandidates,
  runMockStart,
  type CandidateWithSession,
  type StartMessage,
  type WorkerRuntime,
  type WorkerSession
} from '../../../src/main/generation/worker'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve
    reject = innerReject
  })

  return {
    promise,
    resolve,
    reject
  }
}

const session: WorkerSession = {
  sessionId: 'session-1',
  title: 'Session one',
  turns: []
}

const draft: LearningItemDraft = {
  itemType: 'Expression',
  sourceText: 'ship it',
  targetText: 'release it',
  gloss: 'ship',
  contextText: 'We can ship it today.',
  explanation: 'A common product phrase.',
  quizPrompt: 'What does ship it mean?',
  quizAnswer: 'Release it.',
  tags: ['product']
}

function createStartMessage(): StartMessage {
  return {
    type: 'start',
    jobId: 'job-1',
    sessions: [session],
    provider: {
      baseUrl: '',
      apiKey: '',
      defaultModel: ''
    },
    modelBackend: {
      kind: 'openai-compatible',
      cli: {
        codex: {
          executablePath: '',
          model: ''
        },
        claude: {
          executablePath: '',
          model: ''
        },
        opencode: {
          executablePath: '',
          model: ''
        },
        timeoutMs: 1_000
      }
    },
    privacy: { redactBeforeRemoteSend: true },
    generation: {
      expressionDifficulty: 'average',
      batchSize: 1,
      maxItemsPerSession: 10,
      typeBalanceProfile: {
        targetExpression: 0.5,
        targetSentence: 0.5,
        lambda: 0.2
      }
    },
    promptOverride: null,
    resumeCheckpoint: null
  }
}

function createCandidate(): CandidateWithSession {
  return {
    id: 'candidate-1',
    sessionId: session.sessionId,
    sessionTitle: session.title,
    sourceSpanRef: 'span-1',
    promptText: 'We can ship it today.',
    role: 'assistant',
    status: 'pending',
    session
  }
}

function createCandidateWithSource(input: {
  id: string
  sourceSpanRef: string
  promptText: string
}): CandidateWithSession {
  return {
    id: input.id,
    sessionId: session.sessionId,
    sessionTitle: session.title,
    sourceSpanRef: input.sourceSpanRef,
    promptText: input.promptText,
    role: 'assistant',
    status: 'pending',
    session
  }
}

function resultWithExcerptItems(
  excerptItems: LearningItemDraft[][]
): BatchEnrichmentResult {
  return {
    excerptResults: excerptItems.map((items) => ({ items }))
  }
}

function createRuntime(input: {
  isCancelled: () => boolean
  enrichCandidateBatch: WorkerRuntime['enrichCandidateBatch']
  onCheckpoint?: (event: GenerationCheckpointEvent) => void
}) {
  const jobMessages: Array<Record<string, unknown> & {
    status?: string
    kind?: string
    items?: unknown[]
  }> = []
  const checkpoints: GenerationCheckpointEvent[] = []
  const runtime: Partial<WorkerRuntime> = {
    isCancelled: input.isCancelled,
    emit: (event) => {
      jobMessages.push(event)
    },
    emitCheckpoint: (event) => {
      checkpoints.push(event)
      input.onCheckpoint?.(event)
    },
    postJobMessage: (message) => {
      jobMessages.push(message)
    },
    enrichCandidateBatch: input.enrichCandidateBatch
  }

  return {
    runtime,
    jobMessages,
    checkpoints
  }
}

describe('runEnrichmentFromCandidates cancellation', () => {
  it('completes empty candidate sets without calling the model', async () => {
    let called = false
    const { runtime, jobMessages, checkpoints } = createRuntime({
      isCancelled: () => false,
      enrichCandidateBatch: async () => {
        called = true
        return resultWithExcerptItems([])
      }
    })

    await runEnrichmentFromCandidates({
      message: createStartMessage(),
      candidates: [],
      runtime
    })

    expect(called).toBe(false)
    expect(
      checkpoints.some(
        (event) => event.checkpoint === 'enrichment_batch_started'
      )
    ).toBe(false)
    expect(jobMessages.find((event) => event.status === 'completed')?.items).toEqual([])
  })

  it('emits cancelled instead of pushing drafts or completing when cancel arrives during enrichment await', async () => {
    let cancelled = false
    const enrichStarted = deferred<void>()
    const enrichResult = deferred<BatchEnrichmentResult>()
    const { runtime, jobMessages, checkpoints } = createRuntime({
      isCancelled: () => cancelled,
      enrichCandidateBatch: async () => {
        enrichStarted.resolve()
        return await enrichResult.promise
      }
    })

    const run = runEnrichmentFromCandidates({
      message: createStartMessage(),
      candidates: [createCandidate()],
      runtime
    })

    await enrichStarted.promise
    cancelled = true
    enrichResult.resolve(resultWithExcerptItems([[draft]]))
    await run

    expect(jobMessages.some((event) => event.status === 'completed')).toBe(false)
    expect(jobMessages.some((event) => event.status === 'cancelled')).toBe(true)
    expect(
      checkpoints.some(
        (event) => event.checkpoint === 'enrichment_batch_completed'
      )
    ).toBe(false)
    expect(checkpoints.some((event) => event.checkpoint === 'ranked_orders')).toBe(
      false
    )
    expect(
      jobMessages.find((event) => event.status === 'cancelled')?.items
    ).toEqual([])
  })

  it('does not rank or complete when cancel is observed after a completed batch', async () => {
    let cancelled = false
    const { runtime, jobMessages, checkpoints } = createRuntime({
      isCancelled: () => cancelled,
      enrichCandidateBatch: async () => resultWithExcerptItems([[draft]]),
      onCheckpoint: (event) => {
        if (event.checkpoint === 'enrichment_batch_completed') {
          cancelled = true
        }
      }
    })

    await runEnrichmentFromCandidates({
      message: createStartMessage(),
      candidates: [createCandidate()],
      runtime
    })

    expect(jobMessages.some((event) => event.status === 'completed')).toBe(false)
    expect(jobMessages.some((event) => event.status === 'cancelled')).toBe(true)
    expect(checkpoints.some((event) => event.checkpoint === 'ranked_orders')).toBe(
      false
    )
    expect(
      jobMessages.find((event) => event.status === 'cancelled')?.items
    ).toHaveLength(1)
  })

  it('maps returned excerpt items back to the matching candidate source refs', async () => {
    const firstCandidate = createCandidateWithSource({
      id: 'candidate-1',
      sourceSpanRef: 'span-empty',
      promptText: 'This excerpt is not useful enough.'
    })
    const secondCandidate = createCandidateWithSource({
      id: 'candidate-2',
      sourceSpanRef: 'span-rich',
      promptText: 'We can ship it today after smoke testing.'
    })
    const sentenceDraft: LearningItemDraft = {
      ...draft,
      itemType: 'Sentence',
      sourceText: 'We can ship it today after smoke testing.'
    }
    const { runtime, jobMessages } = createRuntime({
      isCancelled: () => false,
      enrichCandidateBatch: async () =>
        resultWithExcerptItems([
          [],
          [draft, sentenceDraft]
        ])
    })

    await runEnrichmentFromCandidates({
      message: {
        ...createStartMessage(),
        generation: {
          ...createStartMessage().generation,
          batchSize: 2
        }
      },
      candidates: [firstCandidate, secondCandidate],
      runtime
    })

    const completed = jobMessages.find((event) => event.status === 'completed')
    const items = completed?.items as Array<{
      sourceRefs: Array<{ sourceSpanRef: string; excerpt: string }>
    }>
    expect(items).toHaveLength(2)
    expect(items.map((item) => item.sourceRefs[0]?.sourceSpanRef)).toEqual([
      'span-rich',
      'span-rich'
    ])
    expect(items.map((item) => item.sourceRefs[0]?.excerpt)).toEqual([
      secondCandidate.promptText,
      secondCandidate.promptText
    ])
  })

  it('emits batch progress and input batch previews during enrichment', async () => {
    const firstCandidate = createCandidateWithSource({
      id: 'candidate-1',
      sourceSpanRef: 'span-1',
      promptText: 'First excerpt.'
    })
    const secondCandidate = createCandidateWithSource({
      id: 'candidate-2',
      sourceSpanRef: 'span-2',
      promptText: 'Second excerpt.'
    })
    const { runtime, jobMessages } = createRuntime({
      isCancelled: () => false,
      enrichCandidateBatch: async () => resultWithExcerptItems([[draft]])
    })

    await runEnrichmentFromCandidates({
      message: createStartMessage(),
      candidates: [firstCandidate, secondCandidate],
      runtime
    })

    const enrichmentEvents = jobMessages.filter(
      (event) => event.status === 'enriching'
    )
    expect(enrichmentEvents.map((event) => event.completedBatchCount)).toEqual([
      0,
      1,
      1,
      2
    ])
    expect(enrichmentEvents.at(0)?.totalBatchCount).toBe(2)
    expect(enrichmentEvents.at(0)?.candidateCount).toBe(2)
    expect(enrichmentEvents.slice(1).some((event) => 'inputBatches' in event)).toBe(
      false
    )
    expect(enrichmentEvents.at(0)?.inputBatches).toEqual([
      {
        batchIndex: 0,
        excerpts: [
          {
            id: firstCandidate.id,
            sessionTitle: firstCandidate.sessionTitle,
            role: firstCandidate.role,
            promptText: firstCandidate.promptText
          }
        ]
      },
      {
        batchIndex: 1,
        excerpts: [
          {
            id: secondCandidate.id,
            sessionTitle: secondCandidate.sessionTitle,
            role: secondCandidate.role,
            promptText: secondCandidate.promptText
          }
        ]
      }
    ])
  })

  it('uses configured batch size for mock LLM batch progress', async () => {
    const { runtime, jobMessages, checkpoints } = createRuntime({
      isCancelled: () => false,
      enrichCandidateBatch: async () => resultWithExcerptItems([[draft]])
    })

    await runMockStart(
      {
        ...createStartMessage(),
        generation: {
          ...createStartMessage().generation,
          batchSize: 2
        }
      },
      runtime
    )

    const enrichmentEvents = jobMessages.filter(
      (event) => event.status === 'enriching'
    )
    const completedBatchCheckpoints = checkpoints.filter(
      (event) => event.checkpoint === 'enrichment_batch_completed'
    )

    expect(enrichmentEvents.map((event) => event.completedBatchCount)).toEqual([
      0,
      1,
      1,
      2
    ])
    expect(enrichmentEvents.at(0)?.totalBatchCount).toBe(2)
    expect(enrichmentEvents.at(0)?.batchSize).toBe(2)
    expect(enrichmentEvents.at(0)?.inputBatches).toHaveLength(2)
    expect(enrichmentEvents.slice(1).some((event) => 'inputBatches' in event)).toBe(
      false
    )
    expect(
      completedBatchCheckpoints.map((event) =>
        'request' in event ? event.request.candidates.length : 0
      )
    ).toEqual([2, 2])
  })
})
