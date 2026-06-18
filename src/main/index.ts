import crypto from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow } from 'electron'
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
  countExportRows,
  filterExportableItems,
  type ExportDirection,
  type ExportFormat,
  type ExportRowsInput,
  type StudyItemType
} from './export/manifest'
import { buildWorkbookExportRows } from './export/workbookRows'
import { runGenerationJob } from './generation/jobRunner'
import { writeWorkbookDraft } from './generation/materializeWorkbook'
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

const dbPath = 'dialoglingo.db'
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

function emitScanEvent(event: ScanEvent) {
  launchScanPhase = event.phase

  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('dialoglingo:scan-event', event)
  }
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
  jobSnapshots.set(event.jobId, {
    id: event.jobId,
    status: event.status,
    selectedSessionCount: event.totalSelectedSessionCount,
    processedSessionCount: event.processedSessionCount,
    createdItemCount: event.createdItemCount,
    warningCount: event.warningCount,
    failureCount: event.failureCount,
    workbookId: jobSnapshots.get(event.jobId)?.workbookId ?? null
  })

  sqlite
    .prepare(
      `
        update generation_jobs
        set status = ?, progress_json = ?
        where id = ?
      `
    )
    .run(event.status, JSON.stringify(event), event.jobId)

  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('dialoglingo:job-event', event)
  }
}

function querySessionRows(sessionIds: string[]) {
  const query = sqlite.prepare(
    `
      select
        s.id,
        s.title,
        st.role,
        st.text,
        st.source_span_ref as sourceSpanRef,
        st.is_tool_noise as isToolNoise
      from sessions s
      join session_turns st on st.session_id = s.id
      where s.id = ?
      order by st.seq asc
    `
  )

  return sessionIds.map((sessionId) => {
    const turns = query.all(sessionId) as Array<{
      title: string
      role: 'user' | 'assistant'
      text: string
      sourceSpanRef: string
      isToolNoise: number
    }>

    return {
      sessionId,
      title:
        (
          sqlite
            .prepare('select title from sessions where id = ?')
            .get(sessionId) as { title?: string } | undefined
        )?.title ?? sessionId,
      turns: turns.map((turn) => ({
        ...turn,
        isToolNoise: Boolean(turn.isToolNoise)
      }))
    }
  })
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
                progress_json as progressJson
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
              })
            : {}

        return {
          id: row.id,
          status: row.status,
          selectedSessionCount: row.selectedSessionCount,
          processedSessionCount: progress.processedSessionCount ?? 0,
          createdItemCount: progress.createdItemCount ?? 0,
          warningCount: progress.warningCount ?? 0,
          failureCount: progress.failureCount ?? 0,
          workbookId: null
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
      getLaunchStatus: () => ({
        phase: launchScanPhase,
        scanOnLaunch: settings.get().scan.scanOnLaunch,
        failureMessage: lastScanFailureMessage,
        launchPlan: lastLaunchPlan
      })
    },
    generation: {
      previewPrompt: async (input: { sessionIds: string[] }) => {
        if (input.sessionIds.length === 0) {
          throw new Error('Select at least one session before generating.')
        }

        const currentSettings = settings.get() as Settings
        const sessionsForGeneration = querySessionRows(input.sessionIds)

        return buildGenerationPromptPreview({
          sessions: sessionsForGeneration,
          expressionDifficulty: currentSettings.generation.expressionDifficulty,
          maxItemsPerSession: currentSettings.generation.maxItemsPerSession,
          batchSize: currentSettings.generation.batchSize
        })
      },
      start: async (input: { sessionIds: string[]; promptOverride?: string | null }) => {
        const currentSettings = settings.get() as Settings
        const promptOverride = input.promptOverride?.trim()
          ? input.promptOverride
          : undefined
        validateGenerationRequest({
          sessionIds: input.sessionIds,
          settings: currentSettings
        })

        const jobId = crypto.randomUUID()
        const workbookId = `workbook-${jobId}`

        sqlite
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
            jobId,
            new Date().toISOString(),
            JSON.stringify({ sessionIds: input.sessionIds }),
            input.sessionIds.length,
            JSON.stringify({})
          )

        jobSnapshots.set(jobId, {
          id: jobId,
          status: 'pending',
          selectedSessionCount: input.sessionIds.length,
          processedSessionCount: 0,
          createdItemCount: 0,
          warningCount: 0,
          failureCount: 0,
          workbookId
        })

        const sessionsForGeneration = querySessionRows(input.sessionIds)
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

        const worker = await runGenerationJob({
          jobId,
          sessions: sessionsForGeneration,
          settings: currentSettings,
          promptOverride,
          onCompletedItems: (items) => {
            completedItems = items
          },
          emit: (event) => {
            const typedEvent = event as Parameters<typeof emitJobEvent>[0]

            if (typedEvent.status === 'completed' && !workbookWritten) {
              writeWorkbookDraft(sqlite, {
                workbookId,
                jobId,
                items: completedItems
              })
              workbookWritten = true

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

        return {
          jobId,
          workbookId,
          requestedSessionIds: input.sessionIds
        }
      },
      cancel: async (input: { jobId: string }) => ({
        ok: true as const,
        jobId: input.jobId,
        cancelled: Boolean(
          jobWorkers.get(input.jobId)?.postMessage({
            type: 'cancel',
            jobId: input.jobId
          })
        )
      })
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
      saveItem: async (input: { itemId: string; currentSnapshot: unknown }) => ({
        ok: true as const,
        itemId: input.itemId,
        currentSnapshot: workbookService.saveCurrentSnapshot(
          input.itemId,
          input.currentSnapshot
        )
      }),
      deleteItem: async (input: { itemId: string }) => ({
        ok: true as const,
        itemId: input.itemId,
        result: workbookService.deleteItem(input.itemId)
      }),
      restoreItem: async (input: { itemId: string }) => ({
        ok: true as const,
        itemId: input.itemId,
        result: workbookService.restoreItem(input.itemId)
      }),
      revertItem: async (input: { itemId: string }) => ({
        ok: true as const,
        itemId: input.itemId,
        result: workbookService.revertItem(input.itemId)
      })
    },
    exportRuns: {
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

        try {
          if (input.request.format === 'anki-text-bundle') {
            await writeAnkiTextBundle(outputLocation, exportInput)
          } else if (input.request.format === 'generic-text-bundle') {
            await writeGenericTextBundle(outputLocation, exportInput)
          } else {
            const output = await buildAnkiPackage(exportInput)
            const filePath = outputLocation.endsWith('.apkg')
              ? outputLocation
              : path.join(outputLocation, `${input.request.deckName}.apkg`)
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
              outputLocation,
              new Date().toISOString(),
              JSON.stringify({
                deckName: input.request.deckName,
                direction: input.request.direction,
                keepFlaggedItems: input.request.keepFlaggedItems ?? false,
                selectedItemCounts,
                exportedItemCounts: countExportRows(exportInput.expressions, exportInput.sentences),
                includedItemTypes: exportInput.includedItemTypes,
                warnings: [...expressionRows.warnings, ...sentenceRows.warnings]
              })
            )

          return {
            ok: true as const,
            workbookId: input.workbookId,
            format: input.request.format,
            outputLocation
          }
        } catch (error) {
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
