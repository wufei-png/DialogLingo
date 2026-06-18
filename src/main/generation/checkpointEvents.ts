import type { Settings } from '../../shared/schemas/settings'
import type { LearningItemDraft, ModelAdapterFailureReason } from './modelAdapter'

export type GenerationCheckpointName =
  | 'generation_job_sessions'
  | 'candidate_groups'
  | 'enrichment_batches'
  | 'ranked_orders'

export type PersistedCandidate = {
  id: string
  sessionId: string
  sessionTitle: string
  sourceSpanRef: string
  promptText: string
  role?: 'user' | 'assistant'
  status: 'pending'
}

export type PersistedWorkerItem = {
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

export type EnrichmentBatchRequestArtifact = {
  batchIndex: number
  prompt: string
  candidates: PersistedCandidate[]
}

export type EnrichmentBatchResponseArtifact = {
  drafts: LearningItemDraft[]
  items: PersistedWorkerItem[]
  reusedFromJobId?: string
}

export type EnrichmentBatchErrorArtifact = {
  reason: ModelAdapterFailureReason
  message: string
}

export type GenerationCheckpointEvent =
  | {
      kind: 'checkpoint'
      jobId: string
      checkpoint: 'candidate_groups'
      candidates: PersistedCandidate[]
    }
  | {
      kind: 'checkpoint'
      jobId: string
      checkpoint: 'enrichment_batch_started'
      batchIndex: number
      request: EnrichmentBatchRequestArtifact
    }
  | {
      kind: 'checkpoint'
      jobId: string
      checkpoint: 'enrichment_batch_completed'
      batchIndex: number
      request: EnrichmentBatchRequestArtifact
      response: EnrichmentBatchResponseArtifact
    }
  | {
      kind: 'checkpoint'
      jobId: string
      checkpoint: 'enrichment_batch_failed'
      batchIndex: number
      request: EnrichmentBatchRequestArtifact
      error: EnrichmentBatchErrorArtifact
    }
  | {
      kind: 'checkpoint'
      jobId: string
      checkpoint: 'ranked_orders'
      rankProfile: Settings['generation']['typeBalanceProfile']
      orderedIds: string[]
    }

export type ResumeCheckpointPayload = {
  sourceJobId: string
  checkpoint: GenerationCheckpointName
  candidates: PersistedCandidate[]
  completedBatches: Array<{
    batchIndex: number
    request: EnrichmentBatchRequestArtifact
    response: EnrichmentBatchResponseArtifact
  }>
  rankedOrderIds: string[]
  rankProfile: Settings['generation']['typeBalanceProfile'] | null
}

export function isGenerationCheckpointEvent(
  event: unknown
): event is GenerationCheckpointEvent {
  return (
    typeof event === 'object' &&
    event !== null &&
    'kind' in event &&
    event.kind === 'checkpoint'
  )
}
