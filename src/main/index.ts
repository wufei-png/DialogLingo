import crypto from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, dialog } from 'electron'
import type { OpenDialogOptions } from 'electron'
import { buildRouter } from '../shared/ipc/router'
import type { ScanEvent } from '../shared/ipc/events'
import type { Settings } from '../shared/schemas/settings'
import { createDb } from './db/client'
import { runMigrations } from './db/migrate'
import { chooseExportFallback } from './errors/sourceIssues'
import { writeAnkiTextBundle } from './export/ankiTextBundle'
import { buildAnkiPackage } from './export/apkg'
import { writeGenericTextBundle } from './export/genericTextBundle'
import {
  createUniqueExportSubdirectory,
  ensureApkgFileName,
  normalizeExportOutputName
} from './export/outputDirectory'
import {
  countExportRows,
  filterExportableItems,
  type ExportDirection,
  type ExportFormat,
  type ExportRowsInput,
  type StudyItemType
} from './export/manifest'
import { buildWorkbookExportRows } from './export/workbookRows'
import {
  buildGenerationRunSnapshot,
  createGenerationJobCheckpoint,
  assertGenerationJobStopped,
  getJobResumeStatus,
  loadResumeCheckpointPayload,
  persistGenerationCheckpointEvent,
  readGenerationRunSnapshot,
  resolveGenerationSettingsForRun,
  type GenerationRunSnapshot,
  type JobSessionSnapshot
} from './generation/checkpointStore'
import { requestGenerationCancel } from './generation/cancelWorker'
import { runGenerationJob } from './generation/jobRunner'
import { writeWorkbookDraft } from './generation/materializeWorkbook'
import {
  createMockLearningItemDrafts,
  isMockLlmEnabled
} from './generation/mockLlm'
import { buildGenerationPromptPreview } from './generation/promptPreview'
import { validateGenerationRequest } from './generation/validateGeneration'
import { createPreviewQuery, createWorkbookPreviewQuery } from './search/queryPreview'
import { createSessionSearch, type SearchInput } from './search/querySessions'
import { listActiveProjects } from './projects/listProjects'
import { buildLaunchPlan, type LaunchPlan } from './scan/scanCoordinator'
import { scanSessions } from './scan/scanSessions'
import { createSettingsService } from './settings/service'
import { createWorkbookService } from './workbook/service'
import { logger } from './logging'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const { createIPCHandler } = require('electron-trpc/main') as {
  createIPCHandler: (input: {
    router: ReturnType<typeof buildRouter>
    windows: BrowserWindow[]
  }) => {
    attachWindow: (window: BrowserWindow) => void
  }
}

function resolveDbPath() {
  if (process.env.DIALOGLINGO_DB_PATH) {
    return process.env.DIALOGLINGO_DB_PATH
  }

  if (!app.isPackaged) {
    return 'dialoglingo.db'
  }

  const userDataDir = app.getPath('userData')
  mkdirSync(userDataDir, { recursive: true })
  return path.join(userDataDir, 'dialoglingo.db')
}

const dbPath = resolveDbPath()
logger.info('startup', `initializing database at ${dbPath}`)
const { sqlite } = createDb(dbPath)

runMigrations(sqlite)
logger.debug('startup', 'database migrations complete')

const settings = createSettingsService(dbPath, {
  runMigrations: true
})
const workbookService = createWorkbookService(dbPath, {
  runMigrations: true
})

type JobSnapshot = {
  id: string
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
  selectedSessionCount: number
  processedSessionCount: number
  createdItemCount: number
  warningCount: number
  failureCount: number
  workbookId: string | null
  currentSessionTitle?: string | null
  currentBatchLabel?: string | null
  lastCheckpoint?: string | null
  failedBatchCount?: number
  failureReason?: string | null
  canResume?: boolean
  resumeBlockedReason?: string | null
}

type WorkbookListItem = {
  id: string
  workbookId: string
  itemType: 'Expression' | 'Sentence'
  state: 'active' | 'deleted'
  generatedSnapshot: Record<string, unknown>
  currentSnapshot: Record<string, unknown>
  sourceRefs: Array<{
    sessionId: string
    sourceSpanRef: string
    excerpt: string
  }>
  isEdited: boolean
}

const jobSnapshots = new Map<string, JobSnapshot>()
const jobWorkers = new Map<string, Awaited<ReturnType<typeof runGenerationJob>>>()
const sourceGroupIds = ['codex', 'claude', 'opencode']

type ScanPhase = ScanEvent['phase']
let launchScanPhase: ScanPhase = 'idle'
let lastScanFailureMessage: string | null = null
let lastLaunchPlan: LaunchPlan | null = null
let activeSessionScan: Promise<{ projectCount: number; sessionCount: number }> | null = null

function elapsedMs(startedAt: number) {
  return Date.now() - startedAt
}

function summarizeGenerationSessions(sessions: GenerationSessionRow[]) {
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

function emitScanEvent(event: ScanEvent) {
  launchScanPhase = event.phase

  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('dialoglingo:scan-event', event)
  }
}

function hasIndexedSessions(includeArchived: boolean) {
  const row = sqlite
    .prepare(
      `
        select exists(
          select 1
          from sessions
          where ? = 1 or is_archived = 0
          limit 1
        ) as hasIndexedSessions
      `
    )
    .get(includeArchived ? 1 : 0) as { hasIndexedSessions: number }

  return row.hasIndexedSessions === 1
}

function readJobProgress(jobId: string) {
  const row = sqlite
    .prepare('select progress_json as progressJson from generation_jobs where id = ?')
    .get(jobId) as { progressJson?: string } | undefined

  if (!row?.progressJson || row.progressJson === '{}') {
    return {}
  }

  try {
    return JSON.parse(row.progressJson) as Record<string, unknown>
  } catch {
    return {}
  }
}

function mergeJobProgress(jobId: string, patch: Record<string, unknown>) {
  const next = {
    ...readJobProgress(jobId),
    ...patch
  }

  sqlite
    .prepare('update generation_jobs set progress_json = ? where id = ?')
    .run(JSON.stringify(next), jobId)

  return next
}

async function runSessionScan(source: 'launch' | 'manual') {
  if (activeSessionScan) {
    return activeSessionScan
  }

  emitScanEvent({ phase: 'scanning', source })
  logger.info('session-scan', `starting ${source} scan`)

  activeSessionScan = (async () => {
    const startedAt = Date.now()
    try {
      const includeArchived = settings.get().scan.includeArchivedSessions
      const result = await scanSessions(sqlite, undefined, {
        includeArchived
      })

      const discoveredProjects = listActiveProjects(sqlite, { includeArchived })
      const discoveredSessionIds = sqlite
        .prepare(
          `
            select id
            from sessions
            where ? = 1 or is_archived = 0
            order by updated_at desc
          `
        )
        .all(includeArchived ? 1 : 0) as Array<{ id: string }>

      const launchPlan = buildLaunchPlan({
        settings: { scanOnLaunch: settings.get().scan.scanOnLaunch },
        discoveredProjects: discoveredProjects.map((row) => row.id),
        discoveredSessionIds: discoveredSessionIds.map((row) => row.id),
        groupIds: sourceGroupIds
      })

      if (source === 'launch') {
        lastLaunchPlan = launchPlan
      }

      lastScanFailureMessage = null
      emitScanEvent({
        phase: 'completed',
        source,
        sessionCount: result.sessionCount,
        projectCount: result.projectCount,
        launchPlan: source === 'launch' ? launchPlan : undefined
      })
      logger.info('session-scan', `${source} scan complete`, {
        ...result,
        durationMs: Date.now() - startedAt
      })

      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      lastScanFailureMessage = message
      emitScanEvent({ phase: 'failed', source, message })
      logger.error('session-scan', `${source} scan failed`, error)
      throw error
    } finally {
      activeSessionScan = null
    }
  })()

  return activeSessionScan
}

function emitJobEvent(event: {
  kind: 'snapshot' | 'phase' | 'warning' | 'failure' | 'completed'
  jobId: string
  status: JobSnapshot['status']
  totalSelectedSessionCount: number
  processedSessionCount: number
  createdItemCount: number
  warningCount: number
  failureCount: number
  currentSessionTitle: string | null
  currentBatchLabel: string | null
  failedBatchCount?: number
  failureReason?:
    | 'missing-provider-config'
    | 'provider-timeout'
    | 'model-request-failure'
    | 'invalid-structured-payload'
}) {
  logger.debug(
    'generation-event',
    `job=${event.jobId} kind=${event.kind} status=${event.status} processed=${event.processedSessionCount}/${event.totalSelectedSessionCount} created=${event.createdItemCount} label=${event.currentBatchLabel ?? ''}`
  )
  const previousProgress = readJobProgress(event.jobId)
  const resumeStatus =
    event.status === 'failed' || event.status === 'cancelled'
      ? getJobResumeStatus(sqlite, event.jobId)
      : {
          canResume: false,
          checkpoint: null,
          resumeBlockedReason: null
        }
  const enrichedEvent = {
    ...event,
    lastCheckpoint:
      resumeStatus.checkpoint ??
      previousProgress.lastCheckpoint ??
      null,
    failedBatchCount:
      event.failedBatchCount ??
      previousProgress.failedBatchCount ??
      0,
    failureReason:
      event.failureReason ??
      previousProgress.failureReason ??
      null,
    canResume: resumeStatus.canResume,
    resumeBlockedReason: resumeStatus.resumeBlockedReason
  }
  logger.debug('generation-event', 'enriched job event', enrichedEvent)

  jobSnapshots.set(event.jobId, {
    id: event.jobId,
    status: event.status,
    selectedSessionCount: event.totalSelectedSessionCount,
    processedSessionCount: event.processedSessionCount,
    createdItemCount: event.createdItemCount,
    warningCount: event.warningCount,
    failureCount: event.failureCount,
    workbookId: jobSnapshots.get(event.jobId)?.workbookId ?? null,
    currentSessionTitle: event.currentSessionTitle,
    currentBatchLabel: event.currentBatchLabel,
    lastCheckpoint: String(enrichedEvent.lastCheckpoint ?? '') || null,
    failedBatchCount: Number(enrichedEvent.failedBatchCount ?? 0),
    failureReason: enrichedEvent.failureReason
      ? String(enrichedEvent.failureReason)
      : null,
    canResume: enrichedEvent.canResume,
    resumeBlockedReason: enrichedEvent.resumeBlockedReason
  })

  sqlite
    .prepare(
      `
        update generation_jobs
        set status = ?, progress_json = ?
        where id = ?
      `
    )
    .run(event.status, JSON.stringify(enrichedEvent), event.jobId)

  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('dialoglingo:job-event', enrichedEvent)
  }
}

type GenerationSessionRow = Parameters<typeof runGenerationJob>[0]['sessions'][number]

function querySessionRows(sessionIds: string[]): GenerationSessionRow[] {
  if (sessionIds.length === 0) {
    return []
  }

  const startedAt = Date.now()
  logger.debug('generation', `load full sessions start count=${sessionIds.length}`)
  logger.debug('generation', 'load full sessions ids', { sessionIds })

  const placeholders = sessionIds.map(() => '?').join(', ')
  const rows = sqlite
    .prepare(
    `
      select
        s.id as sessionId,
        s.title,
        st.role,
        st.text,
        st.source_span_ref as sourceSpanRef,
        st.is_tool_noise as isToolNoise
      from sessions s
      left join session_turns st on st.session_id = s.id
      where s.id in (${placeholders})
      order by s.id asc, st.seq asc
    `
    )
    .all(...sessionIds) as Array<{
      sessionId: string
      title: string
      role: 'user' | 'assistant' | null
      text: string | null
      sourceSpanRef: string | null
      isToolNoise: number | null
    }>

  const sessionsById = new Map<string, GenerationSessionRow>()

  for (const row of rows) {
    const session =
      sessionsById.get(row.sessionId) ??
      ({
        sessionId: row.sessionId,
        title: row.title,
        turns: []
      } satisfies GenerationSessionRow)
    sessionsById.set(row.sessionId, session)

    if (!row.text || !row.sourceSpanRef || !row.role) {
      continue
    }

    session.turns.push({
      role: row.role,
      text: row.text,
      sourceSpanRef: row.sourceSpanRef,
      isToolNoise: Boolean(row.isToolNoise)
    })
  }

  const sessions = sessionIds.map((sessionId) => {
    const session = sessionsById.get(sessionId)
    if (!session) {
      throw new Error(`Selected session ${sessionId} is no longer indexed.`)
    }

    return session
  })
  const summary = summarizeGenerationSessions(sessions)
  logger.debug('generation', 'load full sessions complete', {
    ...summary,
    rowCount: rows.length,
    durationMs: elapsedMs(startedAt)
  })
  logger.debug(
    'generation',
    'load full sessions per-session summary',
    sessions.map((session) => ({
      sessionId: session.sessionId,
      title: session.title,
      turnCount: session.turns.length,
      textChars: session.turns.reduce((count, turn) => count + turn.text.length, 0)
    }))
  )

  return sessions
}

function queryMockSessionRows(sessionIds: string[]): GenerationSessionRow[] {
  if (sessionIds.length === 0) {
    return []
  }

  const startedAt = Date.now()
  logger.debug('generation', `load mock sessions start count=${sessionIds.length}`)
  logger.debug('generation', 'load mock sessions ids', { sessionIds })

  const placeholders = sessionIds.map(() => '?').join(', ')
  const rows = sqlite
    .prepare(
      `
        select
          s.id as sessionId,
          s.title,
          st.role,
          st.text,
          st.source_span_ref as sourceSpanRef,
          st.is_tool_noise as isToolNoise
        from sessions s
        left join session_turns st
          on st.session_id = s.id
          and st.seq = (
            select min(seq)
            from session_turns
            where session_id = s.id
              and is_tool_noise = 0
          )
        where s.id in (${placeholders})
      `
    )
    .all(...sessionIds) as Array<{
      sessionId: string
      title: string
      role: 'user' | 'assistant' | null
      text: string | null
      sourceSpanRef: string | null
      isToolNoise: number | null
    }>
  const rowsById = new Map(rows.map((row) => [row.sessionId, row]))

  const sessions = sessionIds.map((sessionId) => {
    const row = rowsById.get(sessionId)
    if (!row) {
      throw new Error(`Selected session ${sessionId} is no longer indexed.`)
    }

    return {
      sessionId,
      title: row.title,
      turns:
        row.text && row.sourceSpanRef && row.role
          ? [
              {
                role: row.role,
                text: row.text,
                sourceSpanRef: row.sourceSpanRef,
                isToolNoise: Boolean(row.isToolNoise)
              }
            ]
          : []
    }
  })
  const summary = summarizeGenerationSessions(sessions)
  logger.debug('generation', 'load mock sessions complete', {
    ...summary,
    rowCount: rows.length,
    durationMs: elapsedMs(startedAt)
  })
  logger.debug(
    'generation',
    'load mock sessions per-session summary',
    sessions.map((session) => ({
      sessionId: session.sessionId,
      title: session.title,
      turnCount: session.turns.length,
      textChars: session.turns.reduce((count, turn) => count + turn.text.length, 0)
    }))
  )

  return sessions
}

function buildMockPromptPreview(selectedSessionCount: number) {
  logger.debug(
    'generation-preview',
    `mock prompt preview selectedSessions=${selectedSessionCount}`
  )
  return {
    candidateCount: createMockLearningItemDrafts().length,
    prompt: [
      'Mock LLM mode is enabled.',
      `${selectedSessionCount} selected session${selectedSessionCount === 1 ? '' : 's'} will generate deterministic sample workbook items.`,
      'No provider, CLI, or remote LLM request will be called.'
    ].join('\n')
  }
}

function querySessionsForGeneration(sessionIds: string[]) {
  return isMockLlmEnabled() ? queryMockSessionRows(sessionIds) : querySessionRows(sessionIds)
}

function emitJobLoadingPhase(input: {
  jobId: string
  selectedSessionCount: number
}) {
  logger.debug(
    'generation',
    `job=${input.jobId} loading phase selectedSessions=${input.selectedSessionCount} mock=${isMockLlmEnabled()}`
  )
  emitJobEvent({
    kind: 'phase',
    jobId: input.jobId,
    status: 'normalizing',
    totalSelectedSessionCount: input.selectedSessionCount,
    processedSessionCount: 0,
    createdItemCount: 0,
    warningCount: 0,
    failureCount: 0,
    currentSessionTitle: null,
    currentBatchLabel: isMockLlmEnabled()
      ? 'mock llm startup'
      : 'loading selected sessions'
  })
}

function querySessionSnapshots(sessionIds: string[]): JobSessionSnapshot[] {
  const query = sqlite.prepare(
    `
      select
        id as sessionId,
        title,
        hash
      from sessions
      where id = ?
    `
  )

  return sessionIds.map((sessionId) => {
    const row = query.get(sessionId) as JobSessionSnapshot | undefined
    if (!row) {
      throw new Error(`Selected session ${sessionId} is no longer indexed.`)
    }

    return row
  })
}

async function startGenerationRun(input: {
  snapshot: GenerationRunSnapshot
  runtimeSettings: Pick<Settings, 'modelBackend'> & {
    provider: Settings['provider']
    generation: Settings['generation']
  }
  resumeCheckpoint?: Parameters<typeof runGenerationJob>[0]['resumeCheckpoint']
}) {
  const startedAt = Date.now()
  validateGenerationRequest({
    sessionIds: input.snapshot.sessionIds,
    settings: input.runtimeSettings
  })

  const jobId = crypto.randomUUID()
  const workbookId = `workbook-${jobId}`
  logger.info('generation', 'start requested', {
    jobId,
    workbookId,
    runKind: input.snapshot.runKind,
    selectedSessionCount: input.snapshot.sessionIds.length,
    mock: isMockLlmEnabled(),
    hasPromptOverride: Boolean(input.snapshot.promptOverride?.trim())
  })
  logger.debug('generation', 'start snapshot', {
    jobId,
    sessionIds: input.snapshot.sessionIds,
    backendKind: input.runtimeSettings.modelBackend.kind,
    generation: input.runtimeSettings.generation
  })

  const snapshotStartedAt = Date.now()
  const sessionSnapshots = querySessionSnapshots(input.snapshot.sessionIds)
  logger.debug('generation', 'session snapshots loaded', {
    jobId,
    count: sessionSnapshots.length,
    durationMs: elapsedMs(snapshotStartedAt)
  })

  const checkpointStartedAt = Date.now()
  createGenerationJobCheckpoint({
    db: sqlite,
    jobId,
    createdAt: new Date().toISOString(),
    snapshot: input.snapshot,
    sessionSnapshots
  })
  logger.debug('generation', 'initial checkpoint created', {
    jobId,
    durationMs: elapsedMs(checkpointStartedAt)
  })

  jobSnapshots.set(jobId, {
    id: jobId,
    status: 'pending',
    selectedSessionCount: input.snapshot.sessionIds.length,
    processedSessionCount: 0,
    createdItemCount: 0,
    warningCount: 0,
    failureCount: 0,
    workbookId,
    lastCheckpoint: 'generation_job_sessions',
    failedBatchCount: 0,
    failureReason: null,
    canResume: false,
    resumeBlockedReason: null
  })

  emitJobLoadingPhase({
    jobId,
    selectedSessionCount: input.snapshot.sessionIds.length
  })

  const loadStartedAt = Date.now()
  const sessionsForGeneration = querySessionsForGeneration(input.snapshot.sessionIds)
  logger.info('generation', 'session payload ready', {
    jobId,
    mode: isMockLlmEnabled() ? 'mock-light' : 'full',
    ...summarizeGenerationSessions(sessionsForGeneration),
    durationMs: elapsedMs(loadStartedAt),
    elapsedSinceStartMs: elapsedMs(startedAt)
  })
  let completedItems: Array<{
    id: string
    itemType: 'Expression' | 'Sentence'
    generatedSnapshot: unknown
    currentSnapshot: unknown
    sourceRefs: Array<{
      sessionId: string
      sourceSpanRef: string
      excerpt: string
    }>
  }> = []
  let workbookWritten = false

  logger.debug('generation', 'dispatch worker start', {
    jobId,
    ...summarizeGenerationSessions(sessionsForGeneration),
    elapsedSinceStartMs: elapsedMs(startedAt)
  })
  const worker = await runGenerationJob({
    jobId,
    sessions: sessionsForGeneration,
    settings: input.runtimeSettings,
    promptOverride: input.snapshot.promptOverride ?? undefined,
    resumeCheckpoint: input.resumeCheckpoint ?? null,
    onCheckpoint: (event) => {
      const checkpointPersistStartedAt = Date.now()
      logger.debug('generation-checkpoint', 'received checkpoint', {
        jobId,
        checkpoint: event.checkpoint,
        candidateCount:
          'candidates' in event && Array.isArray(event.candidates)
            ? event.candidates.length
            : undefined,
        batchIndex: 'batchIndex' in event ? event.batchIndex : undefined
      })
      const lastCheckpoint = persistGenerationCheckpointEvent(sqlite, event)
      logger.debug('generation-checkpoint', 'persisted checkpoint', {
        jobId,
        checkpoint: event.checkpoint,
        lastCheckpoint,
        durationMs: elapsedMs(checkpointPersistStartedAt)
      })
      mergeJobProgress(jobId, { lastCheckpoint })
    },
    onCompletedItems: (items) => {
      logger.debug('generation', 'completed items received from worker', {
        jobId,
        itemCount: items.length,
        elapsedSinceStartMs: elapsedMs(startedAt)
      })
      completedItems = items
    },
    emit: (event) => {
      const typedEvent = event as Parameters<typeof emitJobEvent>[0]

      if (typedEvent.status === 'completed' && !workbookWritten) {
        const materializeStartedAt = Date.now()
        logger.debug('generation', 'materialize workbook start', {
          jobId,
          workbookId,
          itemCount: completedItems.length,
          elapsedSinceStartMs: elapsedMs(startedAt)
        })
        writeWorkbookDraft(sqlite, {
          workbookId,
          jobId,
          items: completedItems
        })
        workbookWritten = true
        logger.info('generation', 'materialize workbook complete', {
          jobId,
          workbookId,
          itemCount: completedItems.length,
          durationMs: elapsedMs(materializeStartedAt),
          elapsedSinceStartMs: elapsedMs(startedAt)
        })

        const current = jobSnapshots.get(jobId)
        if (current) {
          jobSnapshots.set(jobId, {
            ...current,
            status: 'completed',
            createdItemCount: completedItems.length,
            workbookId
          })
        }
      }

      emitJobEvent(typedEvent)
    }
  })

  jobWorkers.set(jobId, worker)
  logger.debug('generation', 'worker dispatched', {
    jobId,
    elapsedSinceStartMs: elapsedMs(startedAt)
  })

  return {
    jobId,
    workbookId,
    requestedSessionIds: input.snapshot.sessionIds
  }
}

function childSnapshotFromSource(input: {
  source: GenerationRunSnapshot
  runKind: 'resume' | 'restart'
  parentJobId: string
}): GenerationRunSnapshot {
  return {
    ...input.source,
    runKind: input.runKind,
    parentJobId: input.parentJobId
  }
}

function listWorkbookItems(input: {
  workbookId: string
  tab: 'all' | 'expressions' | 'sentences' | 'deleted'
}): WorkbookListItem[] {
  const rows = sqlite
    .prepare(
      `
        select
          id,
          workbook_id as workbookId,
          item_type as itemType,
          generated_snapshot_json as generatedSnapshotJson,
          current_snapshot_json as currentSnapshotJson,
          source_refs_json as sourceRefsJson,
          state
        from workbook_items
        where workbook_id = ?
        order by rowid asc
      `
    )
    .all(input.workbookId) as Array<{
      id: string
      workbookId: string
      itemType: 'Expression' | 'Sentence'
      generatedSnapshotJson: string
      currentSnapshotJson: string
      sourceRefsJson: string
      state: 'active' | 'deleted'
    }>

  return rows
    .map((row) => ({
      id: row.id,
      workbookId: row.workbookId,
      itemType: row.itemType,
      state: row.state,
      generatedSnapshot: JSON.parse(row.generatedSnapshotJson),
      currentSnapshot: JSON.parse(row.currentSnapshotJson),
      sourceRefs: JSON.parse(row.sourceRefsJson),
      isEdited: row.generatedSnapshotJson !== row.currentSnapshotJson
    }))
    .filter((row) => {
      if (input.tab === 'deleted') {
        return row.state === 'deleted'
      }
      if (input.tab === 'expressions') {
        return row.state === 'active' && row.itemType === 'Expression'
      }
      if (input.tab === 'sentences') {
        return row.state === 'active' && row.itemType === 'Sentence'
      }
      return row.state === 'active'
    })
}

function toLegacyExportRows(items: WorkbookListItem[]) {
  const sourceTypeCache = new Map<string, string | null>()
  const getSourceType = (sessionId: string) => {
    if (!sourceTypeCache.has(sessionId)) {
      const row = sqlite
        .prepare('select source_type as sourceType from sessions where id = ?')
        .get(sessionId) as { sourceType?: string } | undefined
      sourceTypeCache.set(sessionId, row?.sourceType ?? null)
    }

    return sourceTypeCache.get(sessionId) ?? null
  }

  return buildWorkbookExportRows(items, getSourceType)
}

function includedItemTypes(input: {
  includeExpressions: boolean
  includeSentences: boolean
}): StudyItemType[] {
  const types: StudyItemType[] = []
  if (input.includeExpressions) {
    types.push('Expression')
  }
  if (input.includeSentences) {
    types.push('Sentence')
  }
  return types
}

function expandOutputPath(value: string) {
  if (value.startsWith('~/')) {
    return path.join(process.env.HOME ?? '', value.slice(2))
  }

  return value
}

function getDefaultExportDirectory() {
  return app.getPath('downloads')
}

async function chooseExportOutputDirectory(input: {
  currentPath?: string | null
  title?: string
}) {
  const currentPath = input.currentPath?.trim()
  const defaultPath = currentPath
    ? expandOutputPath(currentPath)
    : getDefaultExportDirectory()
  const owner = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const options: OpenDialogOptions = {
    title: input.title,
    defaultPath,
    properties: ['openDirectory', 'createDirectory']
  }
  const result = owner
    ? await dialog.showOpenDialog(owner, options)
    : await dialog.showOpenDialog(options)

  if (result.canceled || result.filePaths.length === 0) {
    return {
      cancelled: true as const,
      outputLocation: null
    }
  }

  return {
    cancelled: false as const,
    outputLocation: result.filePaths[0]
  }
}

function createRouter() {
  const searchSessions = createSessionSearch(sqlite)
  const previewSession = createPreviewQuery(sqlite)
  const previewWorkbookSource = createWorkbookPreviewQuery(sqlite)

  return buildRouter({
    settings,
    jobs: {
      getSnapshot(jobId: string) {
        const snapshot = jobSnapshots.get(jobId)
        if (snapshot) {
          return snapshot
        }

        const row = sqlite
          .prepare(
            `
              select
                id,
                status,
                selected_session_count as selectedSessionCount,
                progress_json as progressJson,
                (
                  select w.id
                  from workbooks w
                  where w.job_id = generation_jobs.id
                  order by w.created_at desc
                  limit 1
                ) as workbookId
              from generation_jobs
              where id = ?
            `
          )
          .get(jobId) as
          | {
              id: string
              status: JobSnapshot['status']
              selectedSessionCount: number
              progressJson: string
              workbookId: string | null
            }
          | undefined

        if (!row) {
          return {
            id: jobId,
            status: 'pending' as const,
            selectedSessionCount: 0,
            processedSessionCount: 0,
            createdItemCount: 0,
            warningCount: 0,
            failureCount: 0,
            workbookId: null
          }
        }

        const progress =
          row.progressJson && row.progressJson !== '{}'
            ? (JSON.parse(row.progressJson) as {
                processedSessionCount?: number
                createdItemCount?: number
                warningCount?: number
                failureCount?: number
                currentSessionTitle?: string | null
                currentBatchLabel?: string | null
                lastCheckpoint?: string | null
                failedBatchCount?: number
                failureReason?: string | null
                canResume?: boolean
                resumeBlockedReason?: string | null
              })
            : {}
        const resumeStatus = getJobResumeStatus(sqlite, jobId)

        return {
          id: row.id,
          status: row.status,
          selectedSessionCount: row.selectedSessionCount,
          processedSessionCount: progress.processedSessionCount ?? 0,
          createdItemCount: progress.createdItemCount ?? 0,
          warningCount: progress.warningCount ?? 0,
          failureCount: progress.failureCount ?? 0,
          currentSessionTitle: progress.currentSessionTitle ?? null,
          currentBatchLabel: progress.currentBatchLabel ?? null,
          lastCheckpoint:
            progress.lastCheckpoint ?? resumeStatus.checkpoint ?? null,
          failedBatchCount: progress.failedBatchCount ?? 0,
          failureReason: progress.failureReason ?? null,
          canResume: resumeStatus.canResume,
          resumeBlockedReason: resumeStatus.resumeBlockedReason,
          workbookId: row.workbookId
        }
      }
    },
    sessions: {
      search: (input: SearchInput) => searchSessions(input),
      preview: (input: {
        sessionId: string
        query: string
        scope?: 'all' | 'titles' | 'transcript'
      }) => previewSession(input.sessionId, input.query, input.scope ?? 'all'),
      rescan: async () => {
        const result = await runSessionScan('manual')
        return {
          ok: true as const,
          rescannedAt: new Date().toISOString(),
          ...result
        }
      }
    },
    projects: {
      list: () =>
        listActiveProjects(sqlite, {
          includeArchived: settings.get().scan.includeArchivedSessions
        })
    },
    scan: {
      getLaunchStatus: () => {
        const currentSettings = settings.get()

        return {
          phase: launchScanPhase,
          scanOnLaunch: currentSettings.scan.scanOnLaunch,
          hasIndexedSessions: hasIndexedSessions(
            currentSettings.scan.includeArchivedSessions
          ),
          failureMessage: lastScanFailureMessage,
          launchPlan: lastLaunchPlan
        }
      }
    },
    generation: {
      previewPrompt: async (input: { sessionIds: string[] }) => {
        if (input.sessionIds.length === 0) {
          throw new Error('Select at least one session before generating.')
        }

        const startedAt = Date.now()
        logger.debug('generation-preview', 'prompt preview start', {
          selectedSessionCount: input.sessionIds.length,
          mock: isMockLlmEnabled()
        })
        const currentSettings = settings.get() as Settings
        if (isMockLlmEnabled()) {
          const preview = buildMockPromptPreview(input.sessionIds.length)
          logger.debug('generation-preview', 'prompt preview complete', {
            selectedSessionCount: input.sessionIds.length,
            candidateCount: preview.candidateCount,
            mode: 'mock',
            durationMs: elapsedMs(startedAt)
          })
          return preview
        }

        const sessionsForGeneration = querySessionRows(input.sessionIds)
        const preview = buildGenerationPromptPreview({
          sessions: sessionsForGeneration,
          expressionDifficulty: currentSettings.generation.expressionDifficulty,
          maxItemsPerSession: currentSettings.generation.maxItemsPerSession,
          batchSize: currentSettings.generation.batchSize
        })
        logger.debug('generation-preview', 'prompt preview complete', {
          selectedSessionCount: input.sessionIds.length,
          candidateCount: preview.candidateCount,
          mode: 'full',
          durationMs: elapsedMs(startedAt)
        })

        return preview
      },
      start: async (input: { sessionIds: string[]; promptOverride?: string | null }) => {
        const currentSettings = settings.get() as Settings
        const promptOverride = input.promptOverride?.trim()
          ? input.promptOverride.trim()
          : null

        return startGenerationRun({
          snapshot: buildGenerationRunSnapshot({
            sessionIds: input.sessionIds,
            settings: currentSettings,
            promptOverride,
            runKind: 'start'
          }),
          runtimeSettings: currentSettings
        })
      },
      resume: async (input: { jobId: string }) => {
        const resumeStatus = getJobResumeStatus(sqlite, input.jobId)
        logger.info('generation', 'resume requested', {
          sourceJobId: input.jobId,
          canResume: resumeStatus.canResume,
          checkpoint: resumeStatus.checkpoint,
          blockedReason: resumeStatus.resumeBlockedReason
        })
        if (!resumeStatus.canResume) {
          logger.warn('generation', 'resume may be blocked', {
            sourceJobId: input.jobId,
            blockedReason: resumeStatus.resumeBlockedReason
          })
        }
        assertGenerationJobStopped(sqlite, input.jobId)
        const sourceSnapshot = readGenerationRunSnapshot(sqlite, input.jobId)
        if (!sourceSnapshot) {
          throw new Error('No generation snapshot is available for this job.')
        }

        const currentSettings = settings.get() as Settings
        const runtimeSettings = resolveGenerationSettingsForRun({
          snapshot: sourceSnapshot,
          currentSettings
        })

        return startGenerationRun({
          snapshot: childSnapshotFromSource({
            source: sourceSnapshot,
            runKind: 'resume',
            parentJobId: input.jobId
          }),
          runtimeSettings,
          resumeCheckpoint: loadResumeCheckpointPayload(sqlite, input.jobId)
        })
      },
      restart: async (input: { jobId: string }) => {
        logger.info('generation', 'restart requested', {
          sourceJobId: input.jobId
        })
        assertGenerationJobStopped(sqlite, input.jobId)
        const sourceSnapshot = readGenerationRunSnapshot(sqlite, input.jobId)
        if (!sourceSnapshot) {
          throw new Error('No generation snapshot is available for this job.')
        }

        const currentSettings = settings.get() as Settings
        const runtimeSettings = resolveGenerationSettingsForRun({
          snapshot: sourceSnapshot,
          currentSettings
        })

        return startGenerationRun({
          snapshot: childSnapshotFromSource({
            source: sourceSnapshot,
            runKind: 'restart',
            parentJobId: input.jobId
          }),
          runtimeSettings
        })
      },
      cancel: async (input: { jobId: string }) => {
        const worker = jobWorkers.get(input.jobId)
        let cancelResult = {
          workerFound: Boolean(worker),
          cancelled: false
        }

        try {
          cancelResult = requestGenerationCancel(worker, input.jobId)
        } catch (error) {
          logger.warn('generation', 'cancel delivery failed', {
            jobId: input.jobId,
            workerFound: Boolean(worker),
            cancelled: false,
            message: error instanceof Error ? error.message : String(error)
          })
        }

        logger.info('generation', 'cancel requested', {
          jobId: input.jobId,
          ...cancelResult
        })

        return {
          ok: true as const,
          jobId: input.jobId,
          cancelled: cancelResult.cancelled
        }
      }
    },
    workbook: {
      list: (input: {
        workbookId: string
        tab: 'all' | 'expressions' | 'sentences' | 'deleted'
      }) => listWorkbookItems(input),
      previewSource: (input: {
        sessionId: string
        sourceSpanRef?: string | null
        highlightText?: string | null
      }) => previewWorkbookSource(input),
      saveItem: async (input: { itemId: string; currentSnapshot: unknown }) => {
        logger.debug('workbook', 'save item requested', { itemId: input.itemId })
        return {
          ok: true as const,
          itemId: input.itemId,
          currentSnapshot: workbookService.saveCurrentSnapshot(
            input.itemId,
            input.currentSnapshot
          )
        }
      },
      deleteItem: async (input: { itemId: string }) => {
        logger.debug('workbook', 'delete item requested', { itemId: input.itemId })
        return {
          ok: true as const,
          itemId: input.itemId,
          result: workbookService.deleteItem(input.itemId)
        }
      },
      restoreItem: async (input: { itemId: string }) => {
        logger.debug('workbook', 'restore item requested', { itemId: input.itemId })
        return {
          ok: true as const,
          itemId: input.itemId,
          result: workbookService.restoreItem(input.itemId)
        }
      },
      revertItem: async (input: { itemId: string }) => {
        logger.debug('workbook', 'revert item requested', { itemId: input.itemId })
        return {
          ok: true as const,
          itemId: input.itemId,
          result: workbookService.revertItem(input.itemId)
        }
      }
    },
    exportRuns: {
      defaultOutputLocation: () => getDefaultExportDirectory(),
      chooseOutputDirectory: (input: {
        currentPath?: string | null
        title?: string
      }) => chooseExportOutputDirectory(input),
      run: async (input: {
        workbookId: string
        request: {
          format: ExportFormat
          deckName: string
          direction: ExportDirection
          includeExpressions: boolean
          includeSentences: boolean
          tagPrefix: string
          outputLocation: string
          outputName?: string
          keepFlaggedItems?: boolean
        }
      }) => {
        const items = listWorkbookItems({
          workbookId: input.workbookId,
          tab: 'all'
        })
        const rows = toLegacyExportRows(items)
        const selectedItemCounts = countExportRows(rows.expressions, rows.sentences)
        const flaggedPolicy = (settings.get() as {
          privacy: { flaggedItemExportPolicy: 'block' | 'warn' }
        }).privacy.flaggedItemExportPolicy
        const expressionRows = filterExportableItems(rows.expressions, {
          includeExpressions: input.request.includeExpressions,
          includeSentences: input.request.includeSentences,
          keepFlaggedItems: input.request.keepFlaggedItems ?? false,
          flaggedItemExportPolicy: flaggedPolicy
        })
        const sentenceRows = filterExportableItems(rows.sentences, {
          includeExpressions: input.request.includeExpressions,
          includeSentences: input.request.includeSentences,
          keepFlaggedItems: input.request.keepFlaggedItems ?? false,
          flaggedItemExportPolicy: flaggedPolicy
        })
        const outputLocation = expandOutputPath(input.request.outputLocation)
        let outputPath = outputLocation
        const isTextBundle =
          input.request.format === 'anki-text-bundle' ||
          input.request.format === 'generic-text-bundle'
        const outputName = normalizeExportOutputName(
          input.request.outputName,
          input.request.deckName
        )
        const exportInput: ExportRowsInput = {
          workbookId: input.workbookId,
          deckName: input.request.deckName,
          direction: input.request.direction,
          tagPrefix: input.request.tagPrefix,
          includedItemTypes: includedItemTypes(input.request),
          selectedItemCounts,
          expressions: expressionRows.items,
          sentences: sentenceRows.items
        }
        const exportedItemCounts = countExportRows(
          exportInput.expressions,
          exportInput.sentences
        )
        const exportWarnings = [...expressionRows.warnings, ...sentenceRows.warnings]
        logger.info('export', 'run requested', {
          workbookId: input.workbookId,
          format: input.request.format,
          outputLocation,
          outputName,
          selectedItemCounts,
          exportedItemCounts,
          warningCount: exportWarnings.length
        })

        try {
          if (input.request.format === 'anki-text-bundle') {
            outputPath = await createUniqueExportSubdirectory(
              outputLocation,
              outputName
            )
            await writeAnkiTextBundle(outputPath, exportInput)
          } else if (input.request.format === 'generic-text-bundle') {
            outputPath = await createUniqueExportSubdirectory(
              outputLocation,
              outputName
            )
            await writeGenericTextBundle(outputPath, exportInput)
          } else {
            const output = await buildAnkiPackage(exportInput)
            const filePath = outputLocation.endsWith('.apkg')
              ? outputLocation
              : path.join(outputLocation, ensureApkgFileName(outputName))
            outputPath = filePath
            await mkdir(path.dirname(filePath), { recursive: true })
            await writeFile(filePath, output.data)
          }

          sqlite
            .prepare(
              `
                insert into export_runs (
                  id,
                  workbook_id,
                  export_type,
                  output_path,
                  created_at,
                  metadata_json
                )
                values (?, ?, ?, ?, ?, ?)
              `
            )
            .run(
              crypto.randomUUID(),
              input.workbookId,
              input.request.format,
              outputPath,
              new Date().toISOString(),
              JSON.stringify({
                deckName: input.request.deckName,
                direction: input.request.direction,
                outputName,
                keepFlaggedItems: input.request.keepFlaggedItems ?? false,
                selectedItemCounts,
                exportedItemCounts,
                includedItemTypes: exportInput.includedItemTypes,
                warnings: exportWarnings
              })
            )

          logger.info('export', 'run complete', {
            workbookId: input.workbookId,
            format: input.request.format,
            outputPath,
            exportedItemCounts,
            warningCount: exportWarnings.length
          })

          return {
            ok: true as const,
            workbookId: input.workbookId,
            format: input.request.format,
            outputLocation,
            outputPath
          }
        } catch (error) {
          logger.error('export', 'run failed', {
            workbookId: input.workbookId,
            format: input.request.format,
            outputLocation,
            message: error instanceof Error ? error.message : String(error)
          })
          return {
            ok: false as const,
            workbookId: input.workbookId,
            format: input.request.format,
            fallback: chooseExportFallback({
              requested: input.request.format,
              failed: true
            }),
            message: error instanceof Error ? error.message : String(error)
          }
        }
      }
    }
  })
}

const router = createRouter()
let ipcHandler:
  | {
      attachWindow: (window: BrowserWindow) => void
    }
  | null = null

function resolvePreloadPath() {
  const preloadDir = path.join(__dirname, '../preload')
  const jsPath = path.join(preloadDir, 'index.js')
  const mjsPath = path.join(preloadDir, 'index.mjs')

  if (existsSync(jsPath)) {
    return jsPath
  }

  if (existsSync(mjsPath)) {
    logger.warn(
      'window',
      'preload index.js missing; falling back to index.mjs which may fail in Electron sandbox'
    )
    return mjsPath
  }

  logger.error('window', 'preload script not found', { preloadDir, jsPath, mjsPath })
  return jsPath
}

function createWindow() {
  const preloadPath = resolvePreloadPath()
  logger.info('window', 'creating browser window', { preloadPath })

  const win = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 760,
    title: 'DialogLingo',
    webPreferences: {
      contextIsolation: true,
      preload: preloadPath
    }
  })

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    logger.error('window', 'renderer failed to load', {
      errorCode,
      errorDescription,
      validatedURL
    })
  })

  win.webContents.on('did-finish-load', () => {
    logger.info('window', 'renderer finished loading')
  })

  if (process.env.DIALOGLINGO_OPEN_DEVTOOLS === '1') {
    win.webContents.openDevTools({ mode: 'detach' })
    logger.debug('window', 'opened devtools')
  }

  if (!ipcHandler) {
    ipcHandler = createIPCHandler({
      router,
      windows: [win]
    })
  } else {
    ipcHandler.attachWindow(win)
  }

  if (process.env.ELECTRON_RENDERER_URL) {
    logger.info('window', `loading renderer url ${process.env.ELECTRON_RENDERER_URL}`)
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    const rendererPath = path.join(__dirname, '../renderer/index.html')
    logger.info('window', `loading renderer file ${rendererPath}`)
    void win.loadFile(rendererPath)
  }

  return win
}

function startLaunchScan() {
  setImmediate(() => {
    void runLaunchScan().catch((error) => {
      logger.error('session-scan', 'launch scan failed', error)
    })
  })
}

async function runLaunchScan() {
  await runSessionScan('launch')
}

app.whenReady().then(() => {
  logger.info('startup', 'electron app ready')
  createWindow()

  if (settings.get().scan.scanOnLaunch) {
    startLaunchScan()
  } else {
    logger.debug('startup', 'scanOnLaunch disabled')
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
