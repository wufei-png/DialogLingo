import { parentPort } from 'node:worker_threads'
import type { Settings } from '../../shared/schemas/settings'
import { logger } from '../logging'
import { mineCandidateGroups } from './candidates'
import {
  type EnrichmentBatchRequestArtifact,
  type GenerationCheckpointEvent,
  type PersistedCandidate,
  type ResumeCheckpointPayload
} from './checkpointEvents'
import { enrichCandidateBatch } from './enrichCandidateBatch'
import { finalizeWorkbookItems } from './finalizeWorkbookItems'
import {
  ModelAdapterError,
  type BatchEnrichmentResult,
  type LearningItemDraft
} from './modelAdapter'
import { createMockLearningItemDrafts, isMockLlmEnabled } from './mockLlm'
import { precleanTurns } from './preclean'
import { collectGenerationPromptCandidates } from './promptPreview'
import {
  buildGenerationPromptTemplate,
  renderGenerationPromptTemplate
} from './prompts'
import { rankWorkbookItems } from './ranking'

type WorkerTurn = {
  role: 'user' | 'assistant'
  text: string
  sourceSpanRef: string
  isToolNoise?: boolean
}

export type WorkerSession = {
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

export type StartMessage = {
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

logger.debug('generation-worker', 'worker module loaded', {
  pid: process.pid,
  mock: isMockLlmEnabled()
})

function elapsedMs(startedAt: number) {
  return Date.now() - startedAt
}

function summarizeWorkerSessions(sessions: WorkerSession[]) {
  return sessions.reduce(
    (summary, session) => {
      summary.turnCount += session.turns.length
      summary.textChars += session.turns.reduce(
        (count, turn) => count + turn.text.length,
        0
      )
      return summary
    },
    {
      sessionCount: sessions.length,
      turnCount: 0,
      textChars: 0
    }
  )
}

type WorkerJobEvent = {
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
  currentBatchIndex?: number | null
  completedBatchCount?: number
  totalBatchCount?: number
  candidateCount?: number
  batchSize?: number
  inputBatches?: WorkerInputBatchPreview[]
  failedBatchCount?: number
  failureReason?:
    | 'provider-timeout'
    | 'model-request-failure'
    | 'invalid-structured-payload'
}

type WorkerJobMessage = WorkerJobEvent & {
  items?: WorkerItem[]
}

type WorkerBatchExcerptPreview = {
  id: string
  sessionTitle: string
  role?: 'user' | 'assistant'
  promptText: string
}

type WorkerInputBatchPreview = {
  batchIndex: number
  excerpts: WorkerBatchExcerptPreview[]
}

type WorkerBatchProgress = Pick<
  WorkerJobEvent,
  | 'completedBatchCount'
  | 'totalBatchCount'
  | 'candidateCount'
  | 'batchSize'
  | 'inputBatches'
>

type WorkerBatchProgressBase = {
  totalBatchCount: number
  candidateCount: number
  batchSize: number
  inputBatches: WorkerInputBatchPreview[]
}

function buildBatchProgress(input: {
  base: WorkerBatchProgressBase
  completedBatchCount: number
  includeInputBatches?: boolean
}): WorkerBatchProgress {
  return {
    totalBatchCount: input.base.totalBatchCount,
    candidateCount: input.base.candidateCount,
    batchSize: input.base.batchSize,
    ...(input.includeInputBatches ? { inputBatches: input.base.inputBatches } : {}),
    completedBatchCount: input.completedBatchCount
  }
}

function emit(input: WorkerJobEvent) {
  logger.debug('generation-worker', 'post job event to main', {
    jobId: input.jobId,
    kind: input.kind,
    status: input.status,
    processedSessionCount: input.processedSessionCount,
    totalSelectedSessionCount: input.totalSelectedSessionCount,
    currentBatchLabel: input.currentBatchLabel,
    currentBatchIndex: input.currentBatchIndex,
    completedBatchCount: input.completedBatchCount,
    totalBatchCount: input.totalBatchCount
  })
  parentPort?.postMessage(input)
}

function postWorkerJobMessage(message: WorkerJobMessage) {
  parentPort?.postMessage(message)
}

function emitCheckpoint(event: GenerationCheckpointEvent) {
  logger.debug('generation-worker', 'post checkpoint to main', {
    jobId: event.jobId,
    checkpoint: event.checkpoint,
    candidateCount:
      'candidates' in event && Array.isArray(event.candidates)
        ? event.candidates.length
        : undefined,
    batchIndex: 'batchIndex' in event ? event.batchIndex : undefined
  })
  parentPort?.postMessage(event)
}

export type CandidateWithSession = PersistedCandidate & {
  session: WorkerSession
}

export type WorkerRuntime = {
  isCancelled: () => boolean
  emit: (event: WorkerJobEvent) => void
  emitCheckpoint: (event: GenerationCheckpointEvent) => void
  postJobMessage: (message: WorkerJobMessage) => void
  enrichCandidateBatch: typeof enrichCandidateBatch
}

const defaultWorkerRuntime: WorkerRuntime = {
  isCancelled: () => cancelled,
  emit,
  emitCheckpoint,
  postJobMessage: postWorkerJobMessage,
  enrichCandidateBatch
}

function resolveWorkerRuntime(overrides?: Partial<WorkerRuntime>): WorkerRuntime {
  return {
    ...defaultWorkerRuntime,
    ...overrides
  }
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

function toBatchExcerptPreview(candidate: CandidateWithSession): WorkerBatchExcerptPreview {
  return {
    id: candidate.id,
    sessionTitle: candidate.sessionTitle,
    ...(candidate.role ? { role: candidate.role } : {}),
    promptText: candidate.promptText
  }
}

function buildInputBatchPreviews(input: {
  candidates: CandidateWithSession[]
  batchSize: number
}): WorkerInputBatchPreview[] {
  const batches: WorkerInputBatchPreview[] = []
  for (
    let batchStart = 0;
    batchStart < input.candidates.length;
    batchStart += input.batchSize
  ) {
    batches.push({
      batchIndex: batches.length,
      excerpts: input.candidates
        .slice(batchStart, batchStart + input.batchSize)
        .map(toBatchExcerptPreview)
    })
  }

  return batches
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

function itemsFromBatchResult(input: {
  jobId: string
  batch: CandidateWithSession[]
  result: BatchEnrichmentResult
  startIndex: number
}) {
  if (input.result.excerptResults.length !== input.batch.length) {
    throw new ModelAdapterError(
      `Expected ${input.batch.length} excerptResults, received ${input.result.excerptResults.length}.`,
      'invalid-structured-payload'
    )
  }

  const items: WorkerItem[] = []
  for (const [excerptIndex, excerptResult] of input.result.excerptResults.entries()) {
    const sourceCandidate = input.batch[excerptIndex]!
    for (const draft of excerptResult.items) {
      items.push(toWorkerItem({
        jobId: input.jobId,
        session: sourceCandidate.session,
        draft,
        itemIndex: input.startIndex + items.length,
        sourceSpanRef: sourceCandidate.sourceSpanRef,
        excerpt: sourceCandidate.promptText
      }))
    }
  }

  return items
}

function batchResultFromDrafts(drafts: LearningItemDraft[]): BatchEnrichmentResult {
  return {
    excerptResults: drafts.map((draft) => ({
      items: [draft]
    }))
  }
}

function logPromptTemplateWarnings(input: {
  jobId: string
  batchIndex: number
  warnings: ReturnType<typeof renderGenerationPromptTemplate>['warnings']
}) {
  for (const warning of input.warnings) {
    logger.warn('generation-worker', 'prompt template rendered with warning', {
      jobId: input.jobId,
      batchIndex: input.batchIndex,
      warning,
      templateMissingInputPlaceholder: warning === 'missing_input_placeholder',
      templateDuplicateInputPlaceholder: warning === 'duplicate_input_placeholder'
    })
  }
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
  batchProgress?: WorkerBatchProgress
  emitEvent?: WorkerRuntime['emit']
}) {
  const emitEvent = input.emitEvent ?? emit
  emitEvent({
    kind: 'phase',
    jobId: input.jobId,
    status: 'ranking',
    totalSelectedSessionCount: input.totalSelectedSessionCount,
    processedSessionCount: input.totalSelectedSessionCount,
    createdItemCount: input.createdItemCount,
    warningCount: 0,
    failureCount: input.failedBatchCount,
    currentSessionTitle: null,
    currentBatchLabel: 'dedup + type-balance rerank',
    currentBatchIndex: null,
    ...input.batchProgress
  })

  emitEvent({
    kind: 'phase',
    jobId: input.jobId,
    status: 'materializing',
    totalSelectedSessionCount: input.totalSelectedSessionCount,
    processedSessionCount: input.totalSelectedSessionCount,
    createdItemCount: input.createdItemCount,
    warningCount: 0,
    failureCount: input.failedBatchCount,
    currentSessionTitle: null,
    currentBatchLabel: 'write workbook items',
    currentBatchIndex: null,
    ...input.batchProgress
  })
}

function emitCancelledSnapshot(input: {
  message: Pick<StartMessage, 'jobId' | 'sessions'>
  processedSessionCount: number
  createdItemCount: number
  failedBatchCount: number
  currentSessionTitle: string | null
  currentBatchLabel: string | null
  currentBatchIndex?: number | null
  batchProgress?: WorkerBatchProgress
  items: WorkerItem[]
  runtime: Pick<WorkerRuntime, 'postJobMessage'>
}) {
  input.runtime.postJobMessage({
    kind: 'snapshot',
    jobId: input.message.jobId,
    status: 'cancelled',
    totalSelectedSessionCount: input.message.sessions.length,
    processedSessionCount: input.processedSessionCount,
    createdItemCount: input.createdItemCount,
    warningCount: 0,
    failureCount: input.failedBatchCount,
    currentSessionTitle: input.currentSessionTitle,
    currentBatchLabel: input.currentBatchLabel,
    currentBatchIndex: input.currentBatchIndex,
    ...input.batchProgress,
    items: input.items
  })
}

function maybeEmitCancelledSnapshot(input: {
  message: Pick<StartMessage, 'jobId' | 'sessions'>
  processedSessionCount: number
  createdItemCount: number
  failedBatchCount: number
  currentSessionTitle: string | null
  currentBatchLabel: string | null
  currentBatchIndex?: number | null
  batchProgress?: WorkerBatchProgress
  items: WorkerItem[]
  runtime: Pick<WorkerRuntime, 'isCancelled' | 'postJobMessage'>
}) {
  if (!input.runtime.isCancelled()) {
    return false
  }

  emitCancelledSnapshot(input)
  return true
}

function finalizeAndRankItems(items: WorkerItem[], generation: StartMessage['generation']) {
  return rankWorkbookItems(
    finalizeWorkbookItems(items),
    generation.typeBalanceProfile
  )
}

export async function runMockStart(
  message: StartMessage,
  runtimeOverrides?: Partial<WorkerRuntime>
) {
  const runtime = resolveWorkerRuntime(runtimeOverrides)
  const startedAt = Date.now()
  logger.debug('generation-worker', 'mock start begin', {
    jobId: message.jobId,
    ...summarizeWorkerSessions(message.sessions)
  })
  const session =
    message.sessions[0] ??
    ({
      sessionId: 'mock-session',
      title: 'Mock generation',
      turns: []
    } satisfies WorkerSession)
  const drafts = createMockLearningItemDrafts()
  const mockCandidates = drafts.map((_, itemIndex) => {
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
  const inputBatches = buildInputBatchPreviews({
    candidates: mockCandidates,
    batchSize: message.generation.batchSize
  })
  const batchProgressBase: WorkerBatchProgressBase = {
    totalBatchCount: inputBatches.length,
    candidateCount: mockCandidates.length,
    batchSize: message.generation.batchSize,
    inputBatches
  }
  const rawItems = drafts.map((draft, itemIndex) => {
    const source = mockSourceForSession({ session, itemIndex })
    return toWorkerItem({
      jobId: message.jobId,
      session,
      draft,
      itemIndex: itemIndex + 1,
      sourceSpanRef: source.sourceSpanRef,
      excerpt: source.excerpt
    })
  })
  const items = finalizeAndRankItems(
    rawItems,
    message.generation
  )
  logger.debug('generation-worker', 'mock drafts ready', {
    jobId: message.jobId,
    draftCount: drafts.length,
    itemCount: items.length,
    durationMs: elapsedMs(startedAt)
  })

  runtime.emitCheckpoint({
    kind: 'checkpoint',
    jobId: message.jobId,
    checkpoint: 'candidate_groups',
    candidates: mockCandidates.map(toRequestCandidate)
  })

  runtime.emit({
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

  let completedBatchCount = 0
  for (const batch of inputBatches) {
    const batchLabel = `mock llm batch ${batch.batchIndex + 1} / ${inputBatches.length}`
    const batchStart = batch.batchIndex * message.generation.batchSize
    const batchCandidates = mockCandidates.slice(
      batchStart,
      batchStart + message.generation.batchSize
    )
    const batchDrafts = drafts.slice(
      batchStart,
      batchStart + message.generation.batchSize
    )
    const batchItems = rawItems.slice(
      batchStart,
      batchStart + message.generation.batchSize
    )
    const batchResult = batchResultFromDrafts(batchDrafts)

    runtime.emit({
      kind: 'phase',
      jobId: message.jobId,
      status: 'enriching',
      totalSelectedSessionCount: message.sessions.length,
      processedSessionCount: message.sessions.length,
      createdItemCount: batchStart,
      warningCount: 0,
      failureCount: 0,
      currentSessionTitle: session.title,
      currentBatchLabel: batchLabel,
      currentBatchIndex: batch.batchIndex,
      ...buildBatchProgress({
        base: batchProgressBase,
        completedBatchCount,
        includeInputBatches: batch.batchIndex === 0
      })
    })

    runtime.emitCheckpoint({
      kind: 'checkpoint',
      jobId: message.jobId,
      checkpoint: 'enrichment_batch_completed',
      batchIndex: batch.batchIndex,
      request: {
        batchIndex: batch.batchIndex,
        prompt: 'mock llm',
        candidates: batchCandidates.map(toRequestCandidate)
      },
      response: {
        result: batchResult,
        items: batchItems
      }
    })

    completedBatchCount += 1
    runtime.emit({
      kind: 'phase',
      jobId: message.jobId,
      status: 'enriching',
      totalSelectedSessionCount: message.sessions.length,
      processedSessionCount: message.sessions.length,
      createdItemCount: Math.min(
        batchStart + message.generation.batchSize,
        items.length
      ),
      warningCount: 0,
      failureCount: 0,
      currentSessionTitle: session.title,
      currentBatchLabel: `${batchLabel} complete`,
      currentBatchIndex: batch.batchIndex,
      ...buildBatchProgress({
        base: batchProgressBase,
        completedBatchCount
      })
    })
  }

  runtime.emitCheckpoint({
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
    failedBatchCount: 0,
    batchProgress: buildBatchProgress({
      base: batchProgressBase,
      completedBatchCount
    }),
    emitEvent: runtime.emit
  })

  runtime.postJobMessage({
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
    currentBatchIndex: null,
    ...buildBatchProgress({
      base: batchProgressBase,
      completedBatchCount
    }),
    items
  })
  logger.info('generation-worker', 'mock start complete', {
    jobId: message.jobId,
    itemCount: items.length,
    durationMs: elapsedMs(startedAt)
  })
}

export async function runEnrichmentFromCandidates(input: {
  message: StartMessage
  candidates: CandidateWithSession[]
  customPrompt?: string | null
  completedBatches?: ResumeCheckpointPayload['completedBatches']
  rankedOrderIds?: string[]
  sourceJobId?: string | null
  runtime?: Partial<WorkerRuntime>
}) {
  const runtime = resolveWorkerRuntime(input.runtime)
  const startedAt = Date.now()
  const items: WorkerItem[] = []
  const completedByIndex = new Map(
    (input.completedBatches ?? []).map((batch) => [batch.batchIndex, batch])
  )
  let failedBatchCount = 0
  const batchSize = input.message.generation.batchSize
  const batchCount =
    input.candidates.length === 0
      ? 0
      : Math.ceil(input.candidates.length / batchSize)
  const inputBatches = buildInputBatchPreviews({
    candidates: input.candidates,
    batchSize
  })
  const batchProgressBase: WorkerBatchProgressBase = {
    totalBatchCount: batchCount,
    candidateCount: input.candidates.length,
    batchSize,
    inputBatches
  }
  let completedBatchCount = 0
  const promptTemplate =
    input.customPrompt ??
    buildGenerationPromptTemplate({
      expressionDifficulty: input.message.generation.expressionDifficulty
    })
  logger.info('generation-worker', 'enrichment start', {
    jobId: input.message.jobId,
    candidateCount: input.candidates.length,
    batchSize,
    batchCount,
    customPromptTemplate: Boolean(input.customPrompt)
  })

  for (let batchIndex = 0; batchIndex < batchCount; batchIndex += 1) {
    const batchStartedAt = Date.now()
    const batchStart = batchIndex * batchSize
    const batch = input.candidates.slice(batchStart, batchStart + batchSize)
    const batchLabel = input.customPrompt
      ? `custom template batch ${batchIndex + 1} / ${batchCount}`
      : `llm batch ${batchIndex + 1} / ${batchCount}`
    const renderedPrompt = renderGenerationPromptTemplate({
      template: promptTemplate,
      excerpts: batch
    })
    logPromptTemplateWarnings({
      jobId: input.message.jobId,
      batchIndex,
      warnings: renderedPrompt.warnings
    })
    const prompt = renderedPrompt.prompt
    const request = buildBatchRequest({
      batchIndex,
      prompt,
      candidates: batch
    })

    if (
      maybeEmitCancelledSnapshot({
        message: input.message,
        processedSessionCount: input.message.sessions.length,
        createdItemCount: items.length,
        failedBatchCount,
        currentSessionTitle: null,
        currentBatchLabel: batchLabel,
        currentBatchIndex: batchIndex,
        batchProgress: buildBatchProgress({
          base: batchProgressBase,
          completedBatchCount,
          includeInputBatches: batchIndex === 0
        }),
        items,
        runtime
      })
    ) {
      return
    }

    runtime.emit({
      kind: 'phase',
      jobId: input.message.jobId,
      status: 'enriching',
      totalSelectedSessionCount: input.message.sessions.length,
      processedSessionCount: input.message.sessions.length,
      createdItemCount: items.length,
      warningCount: 0,
      failureCount: failedBatchCount,
      currentSessionTitle: null,
      currentBatchLabel: batchLabel,
      currentBatchIndex: batchIndex,
      ...buildBatchProgress({
        base: batchProgressBase,
        completedBatchCount,
        includeInputBatches: batchIndex === 0
      })
    })
    logger.info('generation-worker', 'enrichment batch start', {
      jobId: input.message.jobId,
      batchIndex,
      batchSize: batch.length,
      batchLabel,
      promptChars: prompt.length
    })

    const completed = completedByIndex.get(batchIndex)
    if (completed) {
      const reusedItems = itemsFromBatchResult({
        jobId: input.message.jobId,
        batch,
        result: completed.response.result,
        startIndex: items.length + 1
      })
      items.push(...reusedItems)
      runtime.emitCheckpoint({
        kind: 'checkpoint',
        jobId: input.message.jobId,
        checkpoint: 'enrichment_batch_completed',
        batchIndex,
        request,
        response: {
          result: completed.response.result,
          items: reusedItems,
          reusedFromJobId: input.sourceJobId ?? undefined
        }
      })
      logger.info('generation-worker', 'enrichment batch reused', {
        jobId: input.message.jobId,
        batchIndex,
        itemCount: reusedItems.length,
        durationMs: elapsedMs(batchStartedAt)
      })
      completedBatchCount += 1
      runtime.emit({
        kind: 'phase',
        jobId: input.message.jobId,
        status: 'enriching',
        totalSelectedSessionCount: input.message.sessions.length,
        processedSessionCount: input.message.sessions.length,
        createdItemCount: items.length,
        warningCount: 0,
        failureCount: failedBatchCount,
        currentSessionTitle: null,
        currentBatchLabel: `${batchLabel} complete`,
        currentBatchIndex: batchIndex,
        ...buildBatchProgress({
          base: batchProgressBase,
          completedBatchCount
        })
      })
      if (
        maybeEmitCancelledSnapshot({
          message: input.message,
          processedSessionCount: input.message.sessions.length,
          createdItemCount: items.length,
          failedBatchCount,
          currentSessionTitle: null,
          currentBatchLabel: batchLabel,
          currentBatchIndex: batchIndex,
          batchProgress: buildBatchProgress({
            base: batchProgressBase,
            completedBatchCount
          }),
          items,
          runtime
        })
      ) {
        return
      }
      continue
    }

    runtime.emitCheckpoint({
      kind: 'checkpoint',
      jobId: input.message.jobId,
      checkpoint: 'enrichment_batch_started',
      batchIndex,
      request
    })

    try {
      const result = await runtime.enrichCandidateBatch({
        provider: input.message.provider,
        modelBackend: input.message.modelBackend,
        prompt,
        excerptCount: batch.length
      })
      if (
        maybeEmitCancelledSnapshot({
          message: input.message,
          processedSessionCount: input.message.sessions.length,
          createdItemCount: items.length,
          failedBatchCount,
          currentSessionTitle: null,
          currentBatchLabel: batchLabel,
          currentBatchIndex: batchIndex,
          batchProgress: buildBatchProgress({
            base: batchProgressBase,
            completedBatchCount
          }),
          items,
          runtime
        })
      ) {
        return
      }
      const batchItems = itemsFromBatchResult({
        jobId: input.message.jobId,
        batch,
        result,
        startIndex: items.length + 1
      })

      items.push(...batchItems)
      runtime.emitCheckpoint({
        kind: 'checkpoint',
        jobId: input.message.jobId,
        checkpoint: 'enrichment_batch_completed',
        batchIndex,
        request,
        response: {
          result,
          items: batchItems
        }
      })
      completedBatchCount += 1
      runtime.emit({
        kind: 'phase',
        jobId: input.message.jobId,
        status: 'enriching',
        totalSelectedSessionCount: input.message.sessions.length,
        processedSessionCount: input.message.sessions.length,
        createdItemCount: items.length,
        warningCount: 0,
        failureCount: failedBatchCount,
        currentSessionTitle: null,
        currentBatchLabel: `${batchLabel} complete`,
        currentBatchIndex: batchIndex,
        ...buildBatchProgress({
          base: batchProgressBase,
          completedBatchCount
        })
      })
      logger.info('generation-worker', 'enrichment batch complete', {
        jobId: input.message.jobId,
        batchIndex,
        itemCount: batchItems.length,
        durationMs: elapsedMs(batchStartedAt)
      })
    } catch (error) {
      failedBatchCount += 1
      const reason =
        error instanceof ModelAdapterError
          ? error.reason
          : 'model-request-failure'
      const message =
        error instanceof Error ? error.message : 'Model request failed.'

      runtime.emitCheckpoint({
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
      runtime.emit({
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
        currentBatchLabel: batchLabel,
        currentBatchIndex: batchIndex,
        ...buildBatchProgress({
          base: batchProgressBase,
          completedBatchCount
        })
      })
      logger.error('generation-worker', 'enrichment batch failed', {
        jobId: input.message.jobId,
        batchIndex,
        reason,
        message,
        durationMs: elapsedMs(batchStartedAt)
      })
      return
    }
  }

  if (
    maybeEmitCancelledSnapshot({
      message: input.message,
      processedSessionCount: input.message.sessions.length,
      createdItemCount: items.length,
      failedBatchCount,
      currentSessionTitle: null,
      currentBatchLabel: 'dedup + type-balance rerank',
      currentBatchIndex: null,
      batchProgress: buildBatchProgress({
        base: batchProgressBase,
        completedBatchCount
      }),
      items,
      runtime
    })
  ) {
    return
  }

  const rankingStartedAt = Date.now()
  logger.debug('generation-worker', 'ranking start', {
    jobId: input.message.jobId,
    itemCount: items.length,
    rankedOrderIds: input.rankedOrderIds?.length ?? 0
  })
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
  logger.info('generation-worker', 'ranking complete', {
    jobId: input.message.jobId,
    itemCount: completedItems.length,
    durationMs: elapsedMs(rankingStartedAt),
    elapsedSinceEnrichmentStartMs: elapsedMs(startedAt)
  })

  runtime.emitCheckpoint({
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
    failedBatchCount,
    batchProgress: buildBatchProgress({
      base: batchProgressBase,
      completedBatchCount
    }),
    emitEvent: runtime.emit
  })

  runtime.postJobMessage({
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
    currentBatchIndex: null,
    ...buildBatchProgress({
      base: batchProgressBase,
      completedBatchCount
    }),
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
  const startedAt = Date.now()
  logger.info('generation-worker', 'fresh start begin', {
    jobId: message.jobId,
    ...summarizeWorkerSessions(message.sessions)
  })
  const promptCandidates: CandidateWithSession[] = []

  for (let index = 0; index < message.sessions.length; index += 1) {
    const session = message.sessions[index]
    const sessionStartedAt = Date.now()
    if (
      maybeEmitCancelledSnapshot({
        message,
        processedSessionCount: index,
        createdItemCount: 0,
        failedBatchCount: 0,
        currentSessionTitle: session.title,
        currentBatchLabel: null,
        items: [],
        runtime: defaultWorkerRuntime
      })
    ) {
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
    logger.debug('generation-worker', 'session normalizing start', {
      jobId: message.jobId,
      sessionIndex: index,
      sessionId: session.sessionId,
      title: session.title,
      turnCount: session.turns.length,
      textChars: session.turns.reduce((count, turn) => count + turn.text.length, 0)
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
    logger.debug('generation-worker', 'session mining complete', {
      jobId: message.jobId,
      sessionIndex: index,
      sessionId: session.sessionId,
      cleanedTurnCount: cleanedTurns.length,
      candidateCount: candidates.length,
      durationMs: elapsedMs(sessionStartedAt)
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
  logger.info('generation-worker', 'fresh start complete', {
    jobId: message.jobId,
    candidateCount: promptCandidates.length,
    durationMs: elapsedMs(startedAt)
  })
}

async function runPromptOverrideStart(message: StartMessage, promptOverride: string) {
  const startedAt = Date.now()
  logger.info('generation-worker', 'prompt override start begin', {
    jobId: message.jobId,
    promptChars: promptOverride.length,
    ...summarizeWorkerSessions(message.sessions)
  })
  const promptCandidates: CandidateWithSession[] = []

  for (let index = 0; index < message.sessions.length; index += 1) {
    const session = message.sessions[index]
    const sessionStartedAt = Date.now()

    if (
      maybeEmitCancelledSnapshot({
        message,
        processedSessionCount: index,
        createdItemCount: 0,
        failedBatchCount: 0,
        currentSessionTitle: session.title,
        currentBatchLabel: null,
        items: [],
        runtime: defaultWorkerRuntime
      })
    ) {
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
    logger.debug('generation-worker', 'custom prompt session start', {
      jobId: message.jobId,
      sessionIndex: index,
      sessionId: session.sessionId,
      title: session.title,
      turnCount: session.turns.length,
      textChars: session.turns.reduce((count, turn) => count + turn.text.length, 0)
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
    logger.debug('generation-worker', 'custom prompt session mining complete', {
      jobId: message.jobId,
      sessionIndex: index,
      sessionId: session.sessionId,
      candidateCount: sessionCandidates.length,
      durationMs: elapsedMs(sessionStartedAt)
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
  logger.info('generation-worker', 'prompt override start complete', {
    jobId: message.jobId,
    candidateCount: promptCandidates.length,
    durationMs: elapsedMs(startedAt)
  })
}

parentPort?.on(
  'message',
  (message: StartMessage | { type: 'cancel'; jobId: string }) => {
    if (message.type === 'cancel') {
      logger.info('generation-worker', 'cancel requested', {
        jobId: message.jobId
      })
      cancelled = true
      return
    }

    logger.debug('generation-worker', 'start message received', {
      jobId: message.jobId,
      mock: isMockLlmEnabled(),
      resumeCheckpoint: message.resumeCheckpoint?.checkpoint ?? null,
      hasPromptOverride: Boolean(message.promptOverride?.trim()),
      ...summarizeWorkerSessions(message.sessions)
    })
    void runStart(message)
  }
)
