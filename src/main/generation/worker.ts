import { parentPort } from 'node:worker_threads'
import type { Settings } from '../../shared/schemas/settings'
import { mineCandidateGroups } from './candidates'
import {
  type EnrichmentBatchRequestArtifact,
  type GenerationCheckpointEvent,
  type PersistedCandidate,
  type ResumeCheckpointPayload
} from './checkpointEvents'
import { enrichCandidateBatch } from './enrichCandidateBatch'
import { finalizeWorkbookItems } from './finalizeWorkbookItems'
import { ModelAdapterError, type LearningItemDraft } from './modelAdapter'
import { createMockLearningItemDrafts, isMockLlmEnabled } from './mockLlm'
import { precleanTurns } from './preclean'
import { collectGenerationPromptCandidates } from './promptPreview'
import { buildGenerationPrompt } from './prompts'
import { rankWorkbookItems } from './ranking'

type WorkerTurn = {
  role: 'user' | 'assistant'
  text: string
  sourceSpanRef: string
  isToolNoise?: boolean
}

type WorkerSession = {
  sessionId: string
  title: string
  turns: WorkerTurn[]
}

type WorkerItem = {
  id: string
  itemType: 'Expression' | 'Sentence'
  generatedSnapshot: LearningItemDraft
  currentSnapshot: LearningItemDraft
  sourceRefs: Array<{
    sessionId: string
    sourceSpanRef: string
    excerpt: string
  }>
}

type StartMessage = {
  type: 'start'
  jobId: string
  sessions: WorkerSession[]
  provider: Settings['provider']
  modelBackend: Settings['modelBackend']
  generation: {
    expressionDifficulty: Settings['generation']['expressionDifficulty']
    batchSize: number
    maxItemsPerSession: number
    typeBalanceProfile: Settings['generation']['typeBalanceProfile']
  }
  promptOverride?: string | null
  resumeCheckpoint?: ResumeCheckpointPayload | null
}

let cancelled = false

function emit(input: {
  kind: 'snapshot' | 'phase' | 'warning' | 'failure' | 'completed'
  jobId: string
  status:
    | 'pending'
    | 'normalizing'
    | 'mining'
    | 'enriching'
    | 'ranking'
    | 'materializing'
    | 'completed'
    | 'failed'
    | 'cancelled'
  totalSelectedSessionCount: number
  processedSessionCount: number
  createdItemCount: number
  warningCount: number
  failureCount: number
  currentSessionTitle: string | null
  currentBatchLabel: string | null
  failedBatchCount?: number
  failureReason?:
    | 'provider-timeout'
    | 'model-request-failure'
    | 'invalid-structured-payload'
}) {
  parentPort?.postMessage(input)
}

function emitCheckpoint(event: GenerationCheckpointEvent) {
  parentPort?.postMessage(event)
}

type CandidateWithSession = PersistedCandidate & {
  session: WorkerSession
}

function candidateArtifactId(input: {
  jobId: string
  sessionIndex: number
  candidateIndex: number
}) {
  return `candidate-${input.jobId}-${input.sessionIndex}-${input.candidateIndex}`
}

function toPersistedCandidate(input: {
  jobId: string
  session: WorkerSession
  sessionIndex: number
  candidateIndex: number
  sourceSpanRef: string
  promptText: string
  role?: 'user' | 'assistant'
}): CandidateWithSession {
  return {
    id: candidateArtifactId({
      jobId: input.jobId,
      sessionIndex: input.sessionIndex,
      candidateIndex: input.candidateIndex
    }),
    sessionId: input.session.sessionId,
    sessionTitle: input.session.title,
    sourceSpanRef: input.sourceSpanRef,
    promptText: input.promptText,
    ...(input.role ? { role: input.role } : {}),
    status: 'pending',
    session: input.session
  }
}

function rebaseCheckpointCandidates(input: {
  jobId: string
  sessions: WorkerSession[]
  candidates: PersistedCandidate[]
}): CandidateWithSession[] {
  const sessionIndexById = new Map(
    input.sessions.map((session, index) => [session.sessionId, index])
  )
  const nextCandidateIndexBySession = new Map<string, number>()

  return input.candidates.flatMap((candidate, index) => {
    const session = input.sessions.find((row) => row.sessionId === candidate.sessionId)
    if (!session) {
      return []
    }
    const candidateIndex =
      nextCandidateIndexBySession.get(candidate.sessionId) ?? 0
    nextCandidateIndexBySession.set(candidate.sessionId, candidateIndex + 1)

    return [
      {
        ...candidate,
        id: candidateArtifactId({
          jobId: input.jobId,
          sessionIndex: sessionIndexById.get(session.sessionId) ?? index,
          candidateIndex
        }),
        sessionTitle: session.title,
        session
      }
    ]
  })
}

function toRequestCandidate(candidate: CandidateWithSession): PersistedCandidate {
  const { session: _session, ...persisted } = candidate
  return persisted
}

function toWorkerItem(input: {
  jobId: string
  session: WorkerSession
  draft: LearningItemDraft
  itemIndex: number
  sourceSpanRef: string
  excerpt: string
}): WorkerItem {
  const itemType = input.draft.itemType
  const prefix = itemType === 'Expression' ? 'expr' : 'sent'
  return {
    id: `${prefix}-${input.jobId}-${input.itemIndex}`,
    itemType,
    generatedSnapshot: input.draft,
    currentSnapshot: input.draft,
    sourceRefs: [
      {
        sessionId: input.session.sessionId,
        sourceSpanRef: input.sourceSpanRef,
        excerpt: input.excerpt
      }
    ]
  }
}

function buildBatchRequest(input: {
  batchIndex: number
  prompt: string
  candidates: CandidateWithSession[]
}): EnrichmentBatchRequestArtifact {
  return {
    batchIndex: input.batchIndex,
    prompt: input.prompt,
    candidates: input.candidates.map(toRequestCandidate)
  }
}

function itemsFromDrafts(input: {
  jobId: string
  batch: CandidateWithSession[]
  drafts: LearningItemDraft[]
  startIndex: number
}) {
  return input.drafts.map((draft, draftIndex) => {
    const sourceCandidate = input.batch[draftIndex % Math.max(input.batch.length, 1)]
    const fallbackSession =
      sourceCandidate?.session ??
      ({
        sessionId: 'checkpoint',
        title: 'Checkpoint',
        turns: []
      } satisfies WorkerSession)

    return toWorkerItem({
      jobId: input.jobId,
      session: fallbackSession,
      draft,
      itemIndex: input.startIndex + draftIndex,
      sourceSpanRef: sourceCandidate?.sourceSpanRef ?? 'checkpoint',
      excerpt: sourceCandidate?.promptText ?? ''
    })
  })
}

function rebasePersistedOrder(input: {
  orderedIds: string[]
  sourceJobId: string
  jobId: string
}) {
  return input.orderedIds.map((id) =>
    id.replace(`-${input.sourceJobId}-`, `-${input.jobId}-`)
  )
}

function applyPersistedOrder<T extends WorkerItem>(input: {
  items: T[]
  orderedIds: string[]
  dropUnordered?: boolean
}) {
  if (input.orderedIds.length === 0) {
    return input.dropUnordered ? [] : input.items
  }

  const orderById = new Map(input.orderedIds.map((id, index) => [id, index]))
  const sourceItems = input.dropUnordered
    ? input.items.filter((item) => orderById.has(item.id))
    : input.items
  const ordered = [...sourceItems].sort((left, right) => {
    const leftOrder = orderById.get(left.id) ?? Number.MAX_SAFE_INTEGER
    const rightOrder = orderById.get(right.id) ?? Number.MAX_SAFE_INTEGER
    return leftOrder - rightOrder
  })

  return ordered
}

function mockSourceForSession(input: {
  session: WorkerSession
  itemIndex: number
}): { sourceSpanRef: string; excerpt: string } {
  const turn = input.session.turns[input.itemIndex % Math.max(input.session.turns.length, 1)]
  return {
    sourceSpanRef: turn?.sourceSpanRef ?? `mock-source-${input.itemIndex + 1}`,
    excerpt:
      turn?.text ??
      'Mock DialogLingo generation source. Select this card to inspect provenance.'
  }
}

function emitTerminalPhases(input: {
  jobId: string
  totalSelectedSessionCount: number
  createdItemCount: number
  failedBatchCount: number
}) {
  emit({
    kind: 'phase',
    jobId: input.jobId,
    status: 'ranking',
    totalSelectedSessionCount: input.totalSelectedSessionCount,
    processedSessionCount: input.totalSelectedSessionCount,
    createdItemCount: input.createdItemCount,
    warningCount: 0,
    failureCount: input.failedBatchCount,
    currentSessionTitle: null,
    currentBatchLabel: 'dedup + type-balance rerank'
  })

  emit({
    kind: 'phase',
    jobId: input.jobId,
    status: 'materializing',
    totalSelectedSessionCount: input.totalSelectedSessionCount,
    processedSessionCount: input.totalSelectedSessionCount,
    createdItemCount: input.createdItemCount,
    warningCount: 0,
    failureCount: input.failedBatchCount,
    currentSessionTitle: null,
    currentBatchLabel: 'write workbook items'
  })
}

function finalizeAndRankItems(items: WorkerItem[], generation: StartMessage['generation']) {
  return rankWorkbookItems(
    finalizeWorkbookItems(items),
    generation.typeBalanceProfile
  )
}

async function runMockStart(message: StartMessage) {
  const session =
    message.sessions[0] ??
    ({
      sessionId: 'mock-session',
      title: 'Mock generation',
      turns: []
    } satisfies WorkerSession)
  const drafts = createMockLearningItemDrafts()
  const mockCandidates = drafts.map((draft, itemIndex) => {
    const source = mockSourceForSession({ session, itemIndex })
    return toPersistedCandidate({
      jobId: message.jobId,
      session,
      sessionIndex: 0,
      candidateIndex: itemIndex,
      sourceSpanRef: source.sourceSpanRef,
      promptText: source.excerpt,
      role: 'assistant'
    })
  })
  const items = finalizeAndRankItems(
    drafts.map((draft, itemIndex) => {
      const source = mockSourceForSession({ session, itemIndex })
      return toWorkerItem({
        jobId: message.jobId,
        session,
        draft,
        itemIndex: itemIndex + 1,
        sourceSpanRef: source.sourceSpanRef,
        excerpt: source.excerpt
      })
    }),
    message.generation
  )

  emitCheckpoint({
    kind: 'checkpoint',
    jobId: message.jobId,
    checkpoint: 'candidate_groups',
    candidates: mockCandidates.map(toRequestCandidate)
  })

  emit({
    kind: 'phase',
    jobId: message.jobId,
    status: 'normalizing',
    totalSelectedSessionCount: message.sessions.length,
    processedSessionCount: 0,
    createdItemCount: 0,
    warningCount: 0,
    failureCount: 0,
    currentSessionTitle: session.title,
    currentBatchLabel: 'mock llm'
  })

  emit({
    kind: 'phase',
    jobId: message.jobId,
    status: 'enriching',
    totalSelectedSessionCount: message.sessions.length,
    processedSessionCount: message.sessions.length,
    createdItemCount: items.length,
    warningCount: 0,
    failureCount: 0,
    currentSessionTitle: session.title,
    currentBatchLabel: 'mock llm'
  })

  emitCheckpoint({
    kind: 'checkpoint',
    jobId: message.jobId,
    checkpoint: 'enrichment_batch_completed',
    batchIndex: 0,
    request: {
      batchIndex: 0,
      prompt: 'mock llm',
      candidates: mockCandidates.map(toRequestCandidate)
    },
    response: {
      drafts,
      items
    }
  })
  emitCheckpoint({
    kind: 'checkpoint',
    jobId: message.jobId,
    checkpoint: 'ranked_orders',
    rankProfile: message.generation.typeBalanceProfile,
    orderedIds: items.map((item) => item.id)
  })

  emitTerminalPhases({
    jobId: message.jobId,
    totalSelectedSessionCount: message.sessions.length,
    createdItemCount: items.length,
    failedBatchCount: 0
  })

  parentPort?.postMessage({
    kind: 'completed',
    jobId: message.jobId,
    status: 'completed',
    totalSelectedSessionCount: message.sessions.length,
    processedSessionCount: message.sessions.length,
    createdItemCount: items.length,
    warningCount: 0,
    failureCount: 0,
    currentSessionTitle: null,
    currentBatchLabel: null,
    items
  })
}

async function runEnrichmentFromCandidates(input: {
  message: StartMessage
  candidates: CandidateWithSession[]
  customPrompt?: string | null
  completedBatches?: ResumeCheckpointPayload['completedBatches']
  rankedOrderIds?: string[]
  sourceJobId?: string | null
}) {
  const items: WorkerItem[] = []
  const completedByIndex = new Map(
    (input.completedBatches ?? []).map((batch) => [batch.batchIndex, batch])
  )
  let failedBatchCount = 0
  const batchSize = input.customPrompt
    ? Math.max(input.candidates.length, 1)
    : input.message.generation.batchSize
  const batchCount =
    input.customPrompt
      ? 1
      : input.candidates.length === 0
        ? 0
        : Math.ceil(input.candidates.length / batchSize)

  for (let batchIndex = 0; batchIndex < batchCount; batchIndex += 1) {
    const batchStart = batchIndex * batchSize
    const batch = input.candidates.slice(batchStart, batchStart + batchSize)
    const batchLabel = input.customPrompt
      ? 'custom prompt'
      : `llm batch ${batchIndex + 1}`
    const prompt =
      input.customPrompt ??
      buildGenerationPrompt({
        sessionTitle:
          input.message.sessions.length === 1
            ? input.message.sessions[0]?.title ?? 'Selected session'
            : `${input.message.sessions.length} selected sessions`,
        expressionDifficulty: input.message.generation.expressionDifficulty,
        candidates: batch
      })
    const request = buildBatchRequest({
      batchIndex,
      prompt,
      candidates: batch
    })

    if (cancelled) {
      parentPort?.postMessage({
        kind: 'snapshot',
        jobId: input.message.jobId,
        status: 'cancelled',
        totalSelectedSessionCount: input.message.sessions.length,
        processedSessionCount: input.message.sessions.length,
        createdItemCount: items.length,
        warningCount: 0,
        failureCount: failedBatchCount,
        currentSessionTitle: null,
        currentBatchLabel: batchLabel,
        items
      })
      return
    }

    emit({
      kind: 'phase',
      jobId: input.message.jobId,
      status: 'enriching',
      totalSelectedSessionCount: input.message.sessions.length,
      processedSessionCount: input.message.sessions.length,
      createdItemCount: items.length,
      warningCount: 0,
      failureCount: failedBatchCount,
      currentSessionTitle: null,
      currentBatchLabel: batchLabel
    })

    const completed = completedByIndex.get(batchIndex)
    if (completed) {
      const reusedItems = itemsFromDrafts({
        jobId: input.message.jobId,
        batch,
        drafts: completed.response.drafts,
        startIndex: items.length + 1
      })
      items.push(...reusedItems)
      emitCheckpoint({
        kind: 'checkpoint',
        jobId: input.message.jobId,
        checkpoint: 'enrichment_batch_completed',
        batchIndex,
        request,
        response: {
          drafts: completed.response.drafts,
          items: reusedItems,
          reusedFromJobId: input.sourceJobId ?? undefined
        }
      })
      continue
    }

    emitCheckpoint({
      kind: 'checkpoint',
      jobId: input.message.jobId,
      checkpoint: 'enrichment_batch_started',
      batchIndex,
      request
    })

    try {
      const drafts = await enrichCandidateBatch({
        provider: input.message.provider,
        modelBackend: input.message.modelBackend,
        prompt
      })
      const batchItems = itemsFromDrafts({
        jobId: input.message.jobId,
        batch,
        drafts,
        startIndex: items.length + 1
      })

      items.push(...batchItems)
      emitCheckpoint({
        kind: 'checkpoint',
        jobId: input.message.jobId,
        checkpoint: 'enrichment_batch_completed',
        batchIndex,
        request,
        response: {
          drafts,
          items: batchItems
        }
      })
    } catch (error) {
      failedBatchCount += 1
      const reason =
        error instanceof ModelAdapterError
          ? error.reason
          : 'model-request-failure'
      const message =
        error instanceof Error ? error.message : 'Model request failed.'

      emitCheckpoint({
        kind: 'checkpoint',
        jobId: input.message.jobId,
        checkpoint: 'enrichment_batch_failed',
        batchIndex,
        request,
        error: {
          reason,
          message
        }
      })
      emit({
        kind: 'failure',
        jobId: input.message.jobId,
        status: 'failed',
        totalSelectedSessionCount: input.message.sessions.length,
        processedSessionCount: input.message.sessions.length,
        createdItemCount: items.length,
        warningCount: 0,
        failureCount: failedBatchCount,
        failedBatchCount,
        failureReason: reason,
        currentSessionTitle: null,
        currentBatchLabel: batchLabel
      })
      return
    }
  }

  const completedItems = input.rankedOrderIds
    ? applyPersistedOrder({
        items,
        orderedIds: rebasePersistedOrder({
          orderedIds: input.rankedOrderIds,
          sourceJobId: input.sourceJobId ?? input.message.jobId,
          jobId: input.message.jobId
        }),
        dropUnordered: true
      })
    : rankWorkbookItems(
        finalizeWorkbookItems(items),
        input.message.generation.typeBalanceProfile
      )

  emitCheckpoint({
    kind: 'checkpoint',
    jobId: input.message.jobId,
    checkpoint: 'ranked_orders',
    rankProfile: input.message.generation.typeBalanceProfile,
    orderedIds: completedItems.map((item) => item.id)
  })

  emitTerminalPhases({
    jobId: input.message.jobId,
    totalSelectedSessionCount: input.message.sessions.length,
    createdItemCount: completedItems.length,
    failedBatchCount
  })

  parentPort?.postMessage({
    kind: 'completed',
    jobId: input.message.jobId,
    status: 'completed',
    totalSelectedSessionCount: input.message.sessions.length,
    processedSessionCount: input.message.sessions.length,
    createdItemCount: completedItems.length,
    warningCount: 0,
    failureCount: failedBatchCount,
    currentSessionTitle: null,
    currentBatchLabel: null,
    items: completedItems
  })
}

async function runResumeStart(
  message: StartMessage,
  checkpoint: ResumeCheckpointPayload
) {
  if (checkpoint.checkpoint === 'generation_job_sessions') {
    await (message.promptOverride?.trim()
      ? runPromptOverrideStart(message, message.promptOverride)
      : runFreshStart(message))
    return
  }

  const candidates = rebaseCheckpointCandidates({
    jobId: message.jobId,
    sessions: message.sessions,
    candidates: checkpoint.candidates
  })

  emitCheckpoint({
    kind: 'checkpoint',
    jobId: message.jobId,
    checkpoint: 'candidate_groups',
    candidates: candidates.map(toRequestCandidate)
  })

  emit({
    kind: 'phase',
    jobId: message.jobId,
    status: 'mining',
    totalSelectedSessionCount: message.sessions.length,
    processedSessionCount: message.sessions.length,
    createdItemCount: 0,
    warningCount: 0,
    failureCount: 0,
    currentSessionTitle: null,
    currentBatchLabel: `${candidates.length} checkpoint candidates`
  })

  await runEnrichmentFromCandidates({
    message,
    candidates,
    customPrompt: message.promptOverride,
    completedBatches:
      checkpoint.checkpoint === 'enrichment_batches' ||
      checkpoint.checkpoint === 'ranked_orders'
        ? checkpoint.completedBatches
        : [],
    rankedOrderIds:
      checkpoint.checkpoint === 'ranked_orders'
        ? checkpoint.rankedOrderIds
        : undefined,
    sourceJobId: checkpoint.sourceJobId
  })
}

async function runStart(message: StartMessage) {
  if (isMockLlmEnabled()) {
    await runMockStart(message)
    return
  }

  if (message.resumeCheckpoint) {
    await runResumeStart(message, message.resumeCheckpoint)
    return
  }

  if (message.promptOverride?.trim()) {
    await runPromptOverrideStart(message, message.promptOverride)
    return
  }

  await runFreshStart(message)
}

async function runFreshStart(message: StartMessage) {
  const promptCandidates: CandidateWithSession[] = []

  for (let index = 0; index < message.sessions.length; index += 1) {
    const session = message.sessions[index]
    if (cancelled) {
      parentPort?.postMessage({
        kind: 'snapshot',
        jobId: message.jobId,
        status: 'cancelled',
        totalSelectedSessionCount: message.sessions.length,
        processedSessionCount: index,
        createdItemCount: 0,
        warningCount: 0,
        failureCount: 0,
        currentSessionTitle: session.title,
        currentBatchLabel: null,
        items: []
      })
      return
    }

    emit({
      kind: 'phase',
      jobId: message.jobId,
      status: 'normalizing',
      totalSelectedSessionCount: message.sessions.length,
      processedSessionCount: index,
      createdItemCount: 0,
      warningCount: 0,
      failureCount: 0,
      currentSessionTitle: session.title,
      currentBatchLabel: null
    })

    const cleanedTurns = precleanTurns(session.turns)
    const candidates = mineCandidateGroups(cleanedTurns).slice(
      0,
      message.generation.maxItemsPerSession
    )
    promptCandidates.push(
      ...candidates.map((candidate, candidateIndex) =>
        toPersistedCandidate({
          jobId: message.jobId,
          session,
          sessionIndex: index,
          candidateIndex,
          sourceSpanRef: candidate.sourceSpanRef,
          promptText: candidate.promptText,
          ...(candidate.role ? { role: candidate.role } : {})
        })
      )
    )

    emit({
      kind: 'phase',
      jobId: message.jobId,
      status: 'mining',
      totalSelectedSessionCount: message.sessions.length,
      processedSessionCount: index + 1,
      createdItemCount: 0,
      warningCount: 0,
      failureCount: 0,
      currentSessionTitle: session.title,
      currentBatchLabel: `${candidates.length} candidates`
    })
  }

  emitCheckpoint({
    kind: 'checkpoint',
    jobId: message.jobId,
    checkpoint: 'candidate_groups',
    candidates: promptCandidates.map(toRequestCandidate)
  })

  await runEnrichmentFromCandidates({
    message,
    candidates: promptCandidates
  })
}

async function runPromptOverrideStart(message: StartMessage, promptOverride: string) {
  const promptCandidates: CandidateWithSession[] = []

  for (let index = 0; index < message.sessions.length; index += 1) {
    const session = message.sessions[index]

    if (cancelled) {
      parentPort?.postMessage({
        kind: 'snapshot',
        jobId: message.jobId,
        status: 'cancelled',
        totalSelectedSessionCount: message.sessions.length,
        processedSessionCount: index,
        createdItemCount: 0,
        warningCount: 0,
        failureCount: 0,
        currentSessionTitle: session.title,
        currentBatchLabel: null,
        items: []
      })
      return
    }

    emit({
      kind: 'phase',
      jobId: message.jobId,
      status: 'normalizing',
      totalSelectedSessionCount: message.sessions.length,
      processedSessionCount: index,
      createdItemCount: 0,
      warningCount: 0,
      failureCount: 0,
      currentSessionTitle: session.title,
      currentBatchLabel: 'custom prompt'
    })

    const sessionCandidates = collectGenerationPromptCandidates({
      sessions: [session],
      maxItemsPerSession: message.generation.maxItemsPerSession
    })
    promptCandidates.push(
      ...sessionCandidates.map((candidate, candidateIndex) =>
        toPersistedCandidate({
          jobId: message.jobId,
          session,
          sessionIndex: index,
          candidateIndex,
          sourceSpanRef: candidate.sourceSpanRef,
          promptText: candidate.promptText,
          ...(candidate.role ? { role: candidate.role } : {})
        })
      )
    )

    emit({
      kind: 'phase',
      jobId: message.jobId,
      status: 'mining',
      totalSelectedSessionCount: message.sessions.length,
      processedSessionCount: index + 1,
      createdItemCount: 0,
      warningCount: 0,
      failureCount: 0,
      currentSessionTitle: session.title,
      currentBatchLabel: `${sessionCandidates.length} candidates`
    })
  }

  emitCheckpoint({
    kind: 'checkpoint',
    jobId: message.jobId,
    checkpoint: 'candidate_groups',
    candidates: promptCandidates.map(toRequestCandidate)
  })

  await runEnrichmentFromCandidates({
    message,
    candidates: promptCandidates,
    customPrompt: promptOverride
  })
}

parentPort?.on(
  'message',
  (message: StartMessage | { type: 'cancel'; jobId: string }) => {
    if (message.type === 'cancel') {
      cancelled = true
      return
    }

    void runStart(message)
  }
)
