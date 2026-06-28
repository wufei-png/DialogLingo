import { describe, expect, it } from 'vitest'
import type { GenerationCheckpointEvent } from '../../../src/main/generation/checkpointEvents'
import type { LearningItemDraft } from '../../../src/main/generation/modelAdapter'
import {
  runEnrichmentFromCandidates,
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

function createRuntime(input: {
  isCancelled: () => boolean
  enrichCandidateBatch: WorkerRuntime['enrichCandidateBatch']
  onCheckpoint?: (event: GenerationCheckpointEvent) => void
}) {
  const jobMessages: Array<{ status?: string; kind?: string; items?: unknown[] }> = []
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
  it('emits cancelled instead of pushing drafts or completing when cancel arrives during enrichment await', async () => {
    let cancelled = false
    const enrichStarted = deferred<void>()
    const enrichResult = deferred<LearningItemDraft[]>()
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
    enrichResult.resolve([draft])
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
      enrichCandidateBatch: async () => [draft],
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
})
