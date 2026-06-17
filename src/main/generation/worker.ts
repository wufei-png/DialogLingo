import { parentPort } from 'node:worker_threads'
import type { Settings } from '../../shared/schemas/settings'
import { mineCandidateGroups } from './candidates'
import { enrichCandidateBatch } from './enrichCandidateBatch'
import { finalizeWorkbookItems } from './finalizeWorkbookItems'
import { ModelAdapterError, type LearningItemDraft } from './modelAdapter'
import { createMockLearningItemDrafts, isMockLlmEnabled } from './mockLlm'
import { precleanTurns } from './preclean'
import {
  collectGenerationPromptCandidates,
  type GenerationPromptCandidate
} from './promptPreview'
import { buildGenerationPrompt } from './prompts'

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
  }
  promptOverride?: string | null
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
    currentBatchLabel: 'type-balance rerank'
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

async function runMockStart(message: StartMessage) {
  const session =
    message.sessions[0] ??
    ({
      sessionId: 'mock-session',
      title: 'Mock generation',
      turns: []
    } satisfies WorkerSession)
  const drafts = createMockLearningItemDrafts()
  const items = finalizeWorkbookItems(
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
    })
  )

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

async function runStart(message: StartMessage) {
  if (isMockLlmEnabled()) {
    await runMockStart(message)
    return
  }

  if (message.promptOverride?.trim()) {
    await runPromptOverrideStart(message, message.promptOverride)
    return
  }

  const items: WorkerItem[] = []
  const promptCandidates: Array<GenerationPromptCandidate & { session: WorkerSession }> = []
  let failedBatchCount = 0

  for (let index = 0; index < message.sessions.length; index += 1) {
    const session = message.sessions[index]
    if (cancelled) {
      parentPort?.postMessage({
        kind: 'snapshot',
        jobId: message.jobId,
        status: 'cancelled',
        totalSelectedSessionCount: message.sessions.length,
        processedSessionCount: index,
        createdItemCount: items.length,
        warningCount: 0,
        failureCount: 0,
        currentSessionTitle: session.title,
        currentBatchLabel: null,
        items
      })
      return
    }

    emit({
      kind: 'phase',
      jobId: message.jobId,
      status: 'normalizing',
      totalSelectedSessionCount: message.sessions.length,
      processedSessionCount: index,
      createdItemCount: items.length,
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
      ...candidates.map((candidate) => ({
        sessionId: session.sessionId,
        sessionTitle: session.title,
        sourceSpanRef: candidate.sourceSpanRef,
        promptText: candidate.promptText,
        ...(candidate.role ? { role: candidate.role } : {}),
        session
      }))
    )

    emit({
      kind: 'phase',
      jobId: message.jobId,
      status: 'mining',
      totalSelectedSessionCount: message.sessions.length,
      processedSessionCount: index + 1,
      createdItemCount: items.length,
      warningCount: 0,
      failureCount: 0,
      currentSessionTitle: session.title,
      currentBatchLabel: `${candidates.length} candidates`
    })
  }

  for (
    let batchStart = 0;
    batchStart < promptCandidates.length;
    batchStart += message.generation.batchSize
  ) {
    const batch = promptCandidates.slice(batchStart, batchStart + message.generation.batchSize)
    const batchLabel = `llm batch ${Math.floor(batchStart / message.generation.batchSize) + 1}`

    if (cancelled) {
      parentPort?.postMessage({
        kind: 'snapshot',
        jobId: message.jobId,
        status: 'cancelled',
        totalSelectedSessionCount: message.sessions.length,
        processedSessionCount: message.sessions.length,
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
      jobId: message.jobId,
      status: 'enriching',
      totalSelectedSessionCount: message.sessions.length,
      processedSessionCount: message.sessions.length,
      createdItemCount: items.length,
      warningCount: 0,
      failureCount: failedBatchCount,
      currentSessionTitle: null,
      currentBatchLabel: batchLabel
    })

    try {
      const drafts = await enrichCandidateBatch({
        provider: message.provider,
        modelBackend: message.modelBackend,
        prompt: buildGenerationPrompt({
          sessionTitle:
            message.sessions.length === 1
              ? message.sessions[0]?.title ?? 'Selected session'
              : `${message.sessions.length} selected sessions`,
          expressionDifficulty: message.generation.expressionDifficulty,
          candidates: batch
        })
      })

      drafts.forEach((draft, draftIndex) => {
        const sourceCandidate = batch[draftIndex % batch.length]
        items.push(
          toWorkerItem({
            jobId: message.jobId,
            session: sourceCandidate.session,
            draft,
            itemIndex: items.length + 1,
            sourceSpanRef: sourceCandidate.sourceSpanRef,
            excerpt: sourceCandidate.promptText
          })
        )
      })
    } catch (error) {
      failedBatchCount += 1
      const reason =
        error instanceof ModelAdapterError
          ? error.reason
          : 'model-request-failure'

      emit({
        kind: 'failure',
        jobId: message.jobId,
        status: 'failed',
        totalSelectedSessionCount: message.sessions.length,
        processedSessionCount: message.sessions.length,
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

  const completedItems = finalizeWorkbookItems(items)

  emitTerminalPhases({
    jobId: message.jobId,
    totalSelectedSessionCount: message.sessions.length,
    createdItemCount: completedItems.length,
    failedBatchCount
  })

  parentPort?.postMessage({
    kind: 'completed',
    jobId: message.jobId,
    status: 'completed',
    totalSelectedSessionCount: message.sessions.length,
    processedSessionCount: message.sessions.length,
    createdItemCount: completedItems.length,
    warningCount: 0,
    failureCount: failedBatchCount,
    currentSessionTitle: null,
    currentBatchLabel: null,
    items: completedItems
  })
}

async function runPromptOverrideStart(message: StartMessage, promptOverride: string) {
  const items: WorkerItem[] = []
  const promptCandidates: GenerationPromptCandidate[] = []
  let failedBatchCount = 0

  for (let index = 0; index < message.sessions.length; index += 1) {
    const session = message.sessions[index]

    if (cancelled) {
      parentPort?.postMessage({
        kind: 'snapshot',
        jobId: message.jobId,
        status: 'cancelled',
        totalSelectedSessionCount: message.sessions.length,
        processedSessionCount: index,
        createdItemCount: items.length,
        warningCount: 0,
        failureCount: 0,
        currentSessionTitle: session.title,
        currentBatchLabel: null,
        items
      })
      return
    }

    emit({
      kind: 'phase',
      jobId: message.jobId,
      status: 'normalizing',
      totalSelectedSessionCount: message.sessions.length,
      processedSessionCount: index,
      createdItemCount: items.length,
      warningCount: 0,
      failureCount: 0,
      currentSessionTitle: session.title,
      currentBatchLabel: 'custom prompt'
    })

    const sessionCandidates = collectGenerationPromptCandidates({
      sessions: [session],
      maxItemsPerSession: message.generation.maxItemsPerSession
    })
    promptCandidates.push(...sessionCandidates)

    emit({
      kind: 'phase',
      jobId: message.jobId,
      status: 'mining',
      totalSelectedSessionCount: message.sessions.length,
      processedSessionCount: index + 1,
      createdItemCount: items.length,
      warningCount: 0,
      failureCount: 0,
      currentSessionTitle: session.title,
      currentBatchLabel: `${sessionCandidates.length} candidates`
    })
  }

  emit({
    kind: 'phase',
    jobId: message.jobId,
    status: 'enriching',
    totalSelectedSessionCount: message.sessions.length,
    processedSessionCount: message.sessions.length,
    createdItemCount: items.length,
    warningCount: 0,
    failureCount: failedBatchCount,
    currentSessionTitle: null,
    currentBatchLabel: 'custom prompt'
  })

  try {
    const drafts = await enrichCandidateBatch({
      provider: message.provider,
      modelBackend: message.modelBackend,
      prompt: promptOverride
    })
    const fallbackSession =
      message.sessions[0] ??
      ({
        sessionId: 'custom-prompt',
        title: 'Custom prompt',
        turns: []
      } satisfies WorkerSession)

    drafts.forEach((draft, draftIndex) => {
      const sourceCandidate =
        promptCandidates.length > 0
          ? promptCandidates[draftIndex % promptCandidates.length]
          : null
      const session =
        message.sessions.find((row) => row.sessionId === sourceCandidate?.sessionId) ??
        fallbackSession

      items.push(
        toWorkerItem({
          jobId: message.jobId,
          session,
          draft,
          itemIndex: items.length + 1,
          sourceSpanRef: sourceCandidate?.sourceSpanRef ?? 'custom-prompt',
          excerpt: sourceCandidate?.promptText ?? promptOverride.slice(0, 500)
        })
      )
    })
  } catch (error) {
    failedBatchCount += 1
    const reason =
      error instanceof ModelAdapterError
        ? error.reason
        : 'model-request-failure'

    emit({
      kind: 'failure',
      jobId: message.jobId,
      status: 'failed',
      totalSelectedSessionCount: message.sessions.length,
      processedSessionCount: message.sessions.length,
      createdItemCount: items.length,
      warningCount: 0,
      failureCount: failedBatchCount,
      failedBatchCount,
      failureReason: reason,
      currentSessionTitle: null,
      currentBatchLabel: 'custom prompt'
    })
    return
  }

  const completedItems = finalizeWorkbookItems(items)

  emitTerminalPhases({
    jobId: message.jobId,
    totalSelectedSessionCount: message.sessions.length,
    createdItemCount: completedItems.length,
    failedBatchCount
  })

  parentPort?.postMessage({
    kind: 'completed',
    jobId: message.jobId,
    status: 'completed',
    totalSelectedSessionCount: message.sessions.length,
    processedSessionCount: message.sessions.length,
    createdItemCount: completedItems.length,
    warningCount: 0,
    failureCount: failedBatchCount,
    currentSessionTitle: null,
    currentBatchLabel: null,
    items: completedItems
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
