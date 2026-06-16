import { parentPort } from 'node:worker_threads'
import { mineCandidateGroups } from './candidates'
import {
  LiteLlmClientError,
  enrichCandidateBatch,
  type LearningItemDraft
} from './litellmClient'
import { precleanTurns } from './preclean'

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
  provider: {
    baseUrl: string
    apiKey: string
    defaultModel: string
  }
  generation: {
    batchSize: number
    maxItemsPerSession: number
  }
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
    | 'litellm-request-failure'
    | 'invalid-structured-payload'
}) {
  parentPort?.postMessage(input)
}

function toPrompt(input: {
  sessionTitle: string
  candidates: Array<{ sourceSpanRef: string; promptText: string }>
}) {
  const candidateText = input.candidates
    .map(
      (candidate, index) =>
        `${index + 1}. source_span_ref=${candidate.sourceSpanRef}\n${candidate.promptText}`
    )
    .join('\n\n')

  return [
    `Create English-learning workbook items from the session "${input.sessionTitle}".`,
    'Use Expression for reusable terms/phrases and Sentence for useful full sentences.',
    'If source text is Chinese, generate useful English-side learning material; if source text is English, generate Chinese support.',
    'Return only JSON matching the requested schema.',
    '',
    candidateText
  ].join('\n')
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

async function runStart(message: StartMessage) {
  const items: WorkerItem[] = []
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

    for (
      let batchStart = 0;
      batchStart < candidates.length;
      batchStart += message.generation.batchSize
    ) {
      const batch = candidates.slice(batchStart, batchStart + message.generation.batchSize)
      const batchLabel = `llm batch ${Math.floor(batchStart / message.generation.batchSize) + 1}`

      emit({
        kind: 'phase',
        jobId: message.jobId,
        status: 'enriching',
        totalSelectedSessionCount: message.sessions.length,
        processedSessionCount: index + 1,
        createdItemCount: items.length,
        warningCount: 0,
        failureCount: failedBatchCount,
        currentSessionTitle: session.title,
        currentBatchLabel: batchLabel
      })

      try {
        const drafts = await enrichCandidateBatch({
          baseUrl: message.provider.baseUrl,
          apiKey: message.provider.apiKey,
          model: message.provider.defaultModel,
          prompt: toPrompt({ sessionTitle: session.title, candidates: batch })
        })

        drafts.forEach((draft, draftIndex) => {
          const sourceCandidate = batch[draftIndex % batch.length]
          items.push(
            toWorkerItem({
              jobId: message.jobId,
              session,
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
          error instanceof LiteLlmClientError
            ? error.reason
            : 'litellm-request-failure'

        emit({
          kind: 'failure',
          jobId: message.jobId,
          status: 'failed',
          totalSelectedSessionCount: message.sessions.length,
          processedSessionCount: index + 1,
          createdItemCount: items.length,
          warningCount: 0,
          failureCount: failedBatchCount,
          failedBatchCount,
          failureReason: reason,
          currentSessionTitle: session.title,
          currentBatchLabel: batchLabel
        })
        return
      }
    }
  }

  emit({
    kind: 'phase',
    jobId: message.jobId,
    status: 'ranking',
    totalSelectedSessionCount: message.sessions.length,
    processedSessionCount: message.sessions.length,
    createdItemCount: items.length,
    warningCount: 0,
    failureCount: failedBatchCount,
    currentSessionTitle: null,
    currentBatchLabel: 'type-balance rerank'
  })

  emit({
    kind: 'phase',
    jobId: message.jobId,
    status: 'materializing',
    totalSelectedSessionCount: message.sessions.length,
    processedSessionCount: message.sessions.length,
    createdItemCount: items.length,
    warningCount: 0,
    failureCount: failedBatchCount,
    currentSessionTitle: null,
    currentBatchLabel: 'write workbook items'
  })

  parentPort?.postMessage({
    kind: 'completed',
    jobId: message.jobId,
    status: 'completed',
    totalSelectedSessionCount: message.sessions.length,
    processedSessionCount: message.sessions.length,
    createdItemCount: items.length,
    warningCount: 0,
    failureCount: failedBatchCount,
    currentSessionTitle: null,
    currentBatchLabel: null,
    items
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
