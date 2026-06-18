import type Database from 'better-sqlite3'
import type { Settings } from '../../shared/schemas/settings'
import {
  type GenerationCheckpointEvent,
  type GenerationCheckpointName,
  type ResumeCheckpointPayload
} from './checkpointEvents'

export type GenerationRunKind = 'start' | 'resume' | 'restart'

export type GenerationRunSnapshot = {
  sessionIds: string[]
  promptOverride: string | null
  generation: Settings['generation']
  modelBackend: Settings['modelBackend']
  provider: {
    baseUrl: string
    defaultModel: string
  }
  runKind: GenerationRunKind
  parentJobId: string | null
}

export type JobSessionSnapshot = {
  sessionId: string
  title: string
  hash: string
}

export type ResumeStatus = {
  canResume: boolean
  checkpoint: GenerationCheckpointName | null
  resumeBlockedReason: string | null
}

type JobRow = {
  id: string
  status: string
  selectedSessionCount: number
  selectedFiltersJson: string
  progressJson: string
}

type RankedRow = {
  rankProfileJson: string
  orderedIdsJson: string
}

function parseJson<T>(value: string, fallback: T): T {
  if (!value) {
    return fallback
  }

  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isCompleteGenerationRunSnapshot(
  value: Partial<GenerationRunSnapshot> & { sessionIds?: unknown }
): value is GenerationRunSnapshot {
  return (
    Array.isArray(value.sessionIds) &&
    value.sessionIds.every((sessionId) => typeof sessionId === 'string') &&
    (typeof value.promptOverride === 'string' || value.promptOverride === null) &&
    isRecord(value.generation) &&
    typeof value.generation.batchSize === 'number' &&
    typeof value.generation.maxItemsPerSession === 'number' &&
    isRecord(value.generation.typeBalanceProfile) &&
    isRecord(value.modelBackend) &&
    typeof value.modelBackend.kind === 'string' &&
    isRecord(value.provider) &&
    typeof value.provider.baseUrl === 'string' &&
    typeof value.provider.defaultModel === 'string' &&
    (value.runKind === 'start' ||
      value.runKind === 'resume' ||
      value.runKind === 'restart') &&
    (typeof value.parentJobId === 'string' || value.parentJobId === null)
  )
}

export function buildGenerationRunSnapshot(input: {
  sessionIds: string[]
  settings: Settings
  promptOverride?: string | null
  runKind: GenerationRunKind
  parentJobId?: string | null
}): GenerationRunSnapshot {
  return {
    sessionIds: input.sessionIds,
    promptOverride: input.promptOverride?.trim() ? input.promptOverride : null,
    generation: input.settings.generation,
    modelBackend: input.settings.modelBackend,
    provider: {
      baseUrl: input.settings.provider.baseUrl,
      defaultModel: input.settings.provider.defaultModel
    },
    runKind: input.runKind,
    parentJobId: input.parentJobId ?? null
  }
}

export function resolveGenerationSettingsForRun(input: {
  snapshot: GenerationRunSnapshot
  currentSettings: Settings
}): Pick<Settings, 'modelBackend'> & {
  provider: Settings['provider']
  generation: Settings['generation']
} {
  return {
    provider: {
      baseUrl: input.snapshot.provider.baseUrl,
      apiKey: input.currentSettings.provider.apiKey,
      defaultModel: input.snapshot.provider.defaultModel
    },
    modelBackend: input.snapshot.modelBackend,
    generation: input.snapshot.generation
  }
}

export function createGenerationJobCheckpoint(input: {
  db: Database.Database
  jobId: string
  createdAt: string
  snapshot: GenerationRunSnapshot
  sessionSnapshots: JobSessionSnapshot[]
}) {
  const write = input.db.transaction(() => {
    input.db
      .prepare(
        `
          insert into generation_jobs (
            id,
            created_at,
            status,
            selected_filters_json,
            selected_session_count,
            progress_json
          )
          values (?, ?, 'pending', ?, ?, ?)
        `
      )
      .run(
        input.jobId,
        input.createdAt,
        JSON.stringify(input.snapshot),
        input.sessionSnapshots.length,
        JSON.stringify({
          lastCheckpoint: 'generation_job_sessions',
          failedBatchCount: 0,
          failureReason: null
        })
      )

    const insertSession = input.db.prepare(
      `
        insert into generation_job_sessions (
          job_id,
          session_id,
          snapshot_title,
          snapshot_hash
        )
        values (?, ?, ?, ?)
      `
    )

    for (const session of input.sessionSnapshots) {
      insertSession.run(input.jobId, session.sessionId, session.title, session.hash)
    }
  })

  write()
}

export function persistGenerationCheckpointEvent(
  db: Database.Database,
  event: GenerationCheckpointEvent
): GenerationCheckpointName {
  if (event.checkpoint === 'candidate_groups') {
    const write = db.transaction(() => {
      db.prepare('delete from candidate_groups where job_id = ?').run(event.jobId)

      const insert = db.prepare(
        `
          insert into candidate_groups (
            id,
            job_id,
            session_id,
            source_span_ref,
            prompt_text,
            status
          )
          values (?, ?, ?, ?, ?, ?)
        `
      )

      for (const candidate of event.candidates) {
        insert.run(
          candidate.id,
          event.jobId,
          candidate.sessionId,
          candidate.sourceSpanRef,
          candidate.promptText,
          candidate.status
        )
      }
    })
    write()
    return 'candidate_groups'
  }

  if (event.checkpoint === 'ranked_orders') {
    db.prepare(
      `
        insert or replace into ranked_orders (
          id,
          job_id,
          rank_profile_json,
          ordered_ids_json
        )
        values (?, ?, ?, ?)
      `
    ).run(
      `${event.jobId}-type-balance`,
      event.jobId,
      JSON.stringify(event.rankProfile),
      JSON.stringify(event.orderedIds)
    )
    return 'ranked_orders'
  }

  const batchId = `${event.jobId}-batch-${event.batchIndex}`
  if (event.checkpoint === 'enrichment_batch_started') {
    db.prepare(
      `
        insert or replace into enrichment_batches (
          id,
          job_id,
          batch_index,
          status,
          request_json,
          response_json
        )
        values (?, ?, ?, 'running', ?, ?)
      `
    ).run(
      batchId,
      event.jobId,
      event.batchIndex,
      JSON.stringify(event.request),
      JSON.stringify({})
    )
    return 'enrichment_batches'
  }

  if (event.checkpoint === 'enrichment_batch_completed') {
    db.prepare(
      `
        insert or replace into enrichment_batches (
          id,
          job_id,
          batch_index,
          status,
          request_json,
          response_json
        )
        values (?, ?, ?, 'completed', ?, ?)
      `
    ).run(
      batchId,
      event.jobId,
      event.batchIndex,
      JSON.stringify(event.request),
      JSON.stringify(event.response)
    )
    return 'enrichment_batches'
  }

  db.prepare(
    `
      insert or replace into enrichment_batches (
        id,
        job_id,
        batch_index,
        status,
        request_json,
        response_json
      )
      values (?, ?, ?, 'failed', ?, ?)
    `
  ).run(
    batchId,
    event.jobId,
    event.batchIndex,
    JSON.stringify(event.request),
    JSON.stringify({ error: event.error })
  )
  return 'enrichment_batches'
}

function getJobRow(db: Database.Database, jobId: string) {
  return db
    .prepare(
      `
        select
          id,
          status,
          selected_session_count as selectedSessionCount,
          selected_filters_json as selectedFiltersJson,
          progress_json as progressJson
        from generation_jobs
        where id = ?
      `
    )
    .get(jobId) as JobRow | undefined
}

export function getGenerationJobStatus(
  db: Database.Database,
  jobId: string
) {
  return getJobRow(db, jobId)?.status ?? null
}

export function assertGenerationJobStopped(
  db: Database.Database,
  jobId: string
) {
  const status = getGenerationJobStatus(db, jobId)
  if (status !== 'failed' && status !== 'cancelled') {
    throw new Error('Only failed or cancelled generation jobs can be resumed or restarted.')
  }
}

export function readGenerationRunSnapshot(
  db: Database.Database,
  jobId: string
): GenerationRunSnapshot | null {
  const row = getJobRow(db, jobId)
  if (!row) {
    return null
  }

  const parsed = parseJson<Partial<GenerationRunSnapshot> & { sessionIds?: unknown }>(
    row.selectedFiltersJson,
    {}
  )
  if (!isCompleteGenerationRunSnapshot(parsed)) {
    return null
  }

  return parsed
}

function validateSessionSnapshots(db: Database.Database, jobId: string) {
  const rows = db
    .prepare(
      `
        select
          g.session_id as sessionId,
          g.snapshot_hash as snapshotHash,
          s.hash as currentHash
        from generation_job_sessions g
        left join sessions s on s.id = g.session_id
        where g.job_id = ?
        order by g.rowid asc
      `
    )
    .all(jobId) as Array<{
      sessionId: string
      snapshotHash: string
      currentHash: string | null
    }>

  if (rows.length === 0) {
    return {
      ok: false,
      reason: 'No persisted session snapshot is available.'
    }
  }

  const missing = rows.find((row) => row.currentHash == null)
  if (missing) {
    return {
      ok: false,
      reason: `Session ${missing.sessionId} is no longer indexed.`
    }
  }

  const changed = rows.find((row) => row.currentHash !== row.snapshotHash)
  if (changed) {
    return {
      ok: false,
      reason: `Session ${changed.sessionId} changed since this generation started.`
    }
  }

  return { ok: true, reason: null }
}

function countRows(db: Database.Database, sql: string, jobId: string) {
  return (
    db.prepare(sql).get(jobId) as {
      count: number
    }
  ).count
}

function expectedBatchCountForSnapshot(input: {
  snapshot: GenerationRunSnapshot
  candidateCount: number
}) {
  if (input.snapshot.promptOverride?.trim()) {
    return 1
  }

  if (input.candidateCount === 0) {
    return 0
  }

  return Math.ceil(input.candidateCount / input.snapshot.generation.batchSize)
}

function getRankedRow(db: Database.Database, jobId: string) {
  return db
    .prepare(
      `
        select
          rank_profile_json as rankProfileJson,
          ordered_ids_json as orderedIdsJson
        from ranked_orders
        where job_id = ?
        order by rowid desc
        limit 1
      `
    )
    .get(jobId) as RankedRow | undefined
}

function getCompletedBatchItems(db: Database.Database, jobId: string) {
  const rows = db
    .prepare(
      `
        select response_json as responseJson
        from enrichment_batches
        where job_id = ? and status = 'completed'
        order by batch_index asc
      `
    )
    .all(jobId) as Array<{ responseJson: string }>

  return rows.flatMap((row) => {
    const response = parseJson<{ items?: Array<{ id?: unknown }> }>(
      row.responseJson,
      {}
    )
    return Array.isArray(response.items) ? response.items : []
  })
}

function isRankedCheckpointComplete(input: {
  db: Database.Database
  jobId: string
  expectedBatchCount: number
  completedBatchCount: number
}) {
  const rankedRow = getRankedRow(input.db, input.jobId)
  if (!rankedRow || input.completedBatchCount !== input.expectedBatchCount) {
    return false
  }

  const orderedIds = parseJson<string[]>(rankedRow.orderedIdsJson, [])
  const completedItemIds = new Set(
    getCompletedBatchItems(input.db, input.jobId)
      .map((item) => item.id)
      .filter((id): id is string => typeof id === 'string')
  )

  return orderedIds.every((id) => completedItemIds.has(id))
}

export function getJobResumeStatus(
  db: Database.Database,
  jobId: string
): ResumeStatus {
  const row = getJobRow(db, jobId)
  if (!row || (row.status !== 'failed' && row.status !== 'cancelled')) {
    return {
      canResume: false,
      checkpoint: null,
      resumeBlockedReason: null
    }
  }

  const snapshotValidation = validateSessionSnapshots(db, jobId)
  if (!snapshotValidation.ok) {
    return {
      canResume: false,
      checkpoint: null,
      resumeBlockedReason: snapshotValidation.reason
    }
  }
  const snapshot = readGenerationRunSnapshot(db, jobId)
  if (!snapshot) {
    return {
      canResume: false,
      checkpoint: null,
      resumeBlockedReason: 'Generation configuration snapshot is incomplete.'
    }
  }

  const completedBatchCount = countRows(
    db,
    "select count(*) as count from enrichment_batches where job_id = ? and status = 'completed'",
    jobId
  )
  const batchCount = countRows(
    db,
    'select count(*) as count from enrichment_batches where job_id = ?',
    jobId
  )
  const candidateCount = countRows(
    db,
    'select count(*) as count from candidate_groups where job_id = ?',
    jobId
  )
  const sessionCount = countRows(
    db,
    'select count(*) as count from generation_job_sessions where job_id = ?',
    jobId
  )
  const expectedBatchCount = expectedBatchCountForSnapshot({
    snapshot,
    candidateCount
  })

  if (
    isRankedCheckpointComplete({
      db,
      jobId,
      expectedBatchCount,
      completedBatchCount
    })
  ) {
    return {
      canResume: true,
      checkpoint: 'ranked_orders',
      resumeBlockedReason: null
    }
  }

  if (batchCount > 0 && candidateCount > 0) {
    return {
      canResume: true,
      checkpoint: 'enrichment_batches',
      resumeBlockedReason: null
    }
  }

  if (candidateCount > 0) {
    return {
      canResume: true,
      checkpoint: 'candidate_groups',
      resumeBlockedReason: null
    }
  }

  if (sessionCount > 0) {
    return {
      canResume: true,
      checkpoint: 'generation_job_sessions',
      resumeBlockedReason: null
    }
  }

  return {
    canResume: false,
    checkpoint: null,
    resumeBlockedReason: 'No complete checkpoint artifact is available.'
  }
}

export function loadResumeCheckpointPayload(
  db: Database.Database,
  jobId: string
): ResumeCheckpointPayload {
  const status = getJobResumeStatus(db, jobId)
  if (!status.canResume || !status.checkpoint) {
    throw new Error(status.resumeBlockedReason ?? 'This job cannot be resumed.')
  }

  const candidates = db
    .prepare(
      `
        select
          cg.id,
          cg.session_id as sessionId,
          coalesce(s.title, cg.session_id) as sessionTitle,
          cg.source_span_ref as sourceSpanRef,
          cg.prompt_text as promptText,
          cg.status
        from candidate_groups cg
        left join sessions s on s.id = cg.session_id
        where cg.job_id = ?
        order by cg.rowid asc
      `
    )
    .all(jobId) as ResumeCheckpointPayload['candidates']

  const completedBatches = db
    .prepare(
      `
        select
          batch_index as batchIndex,
          request_json as requestJson,
          response_json as responseJson
        from enrichment_batches
        where job_id = ? and status = 'completed'
        order by batch_index asc
      `
    )
    .all(jobId)
    .map((row) => {
      const batch = row as {
        batchIndex: number
        requestJson: string
        responseJson: string
      }
      return {
        batchIndex: batch.batchIndex,
        request: parseJson(batch.requestJson, {
          batchIndex: batch.batchIndex,
          prompt: '',
          candidates: []
        }),
        response: parseJson(batch.responseJson, {
          drafts: [],
          items: []
        })
      }
    }) as ResumeCheckpointPayload['completedBatches']

  const rankedRow = getRankedRow(db, jobId)

  return {
    sourceJobId: jobId,
    checkpoint: status.checkpoint,
    candidates,
    completedBatches,
    rankedOrderIds: rankedRow
      ? parseJson<string[]>(rankedRow.orderedIdsJson, [])
      : [],
    rankProfile: rankedRow
      ? parseJson<ResumeCheckpointPayload['rankProfile']>(
          rankedRow.rankProfileJson,
          null
        )
      : null
  }
}

export function getSessionIdsForJob(db: Database.Database, jobId: string) {
  const snapshot = readGenerationRunSnapshot(db, jobId)
  if (snapshot?.sessionIds.length) {
    return snapshot.sessionIds
  }

  return (
    db
      .prepare(
        `
          select session_id as sessionId
          from generation_job_sessions
          where job_id = ?
          order by rowid asc
        `
      )
      .all(jobId) as Array<{ sessionId: string }>
  ).map((row) => row.sessionId)
}
