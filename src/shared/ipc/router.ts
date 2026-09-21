import { initTRPC, TRPCError } from '@trpc/server'
import type { AppRouterContext } from './context'
import {
  exportChooseOutputDirectoryInputSchema,
  exportRunInputSchema,
  generationJobInputSchema,
  generationRunInputSchema,
  ipcModelListInputSchema,
  ipcSettingsSaveSchema,
  jobSnapshotInputSchema,
  noIpcInputSchema,
  sessionPreviewInputSchema,
  sessionSearchInputSchema,
  workbookItemActionInputSchema,
  workbookListInputSchema,
  workbookPreviewSourceInputSchema,
  workbookRevertInputSchema,
  workbookSaveItemInputSchema,
  type ExportRunInput,
  type ExportChooseOutputDirectoryInput,
  type GenerationJobInput,
  type GenerationRunInput,
  type IpcModelListInput,
  type IpcSettings,
  type SessionPreviewInput,
  type SessionSearchInput,
  type WorkbookItemActionInput,
  type WorkbookListInput,
  type WorkbookPreviewSourceInput,
  type WorkbookRevertInput,
  type WorkbookSaveItemInput
} from '../schemas/ipc'
import type { Settings } from '../schemas/settings'

const t = initTRPC.context<AppRouterContext>().create()
const ipcProcedure = t.procedure.use(({ ctx, next }) => {
  if (ctx.ipc?.authorized !== true) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'IPC sender is not authorized.'
    })
  }

  return next()
})

export type RouterDeps = {
  settings: {
    get: () => Settings
    save: (next: IpcSettings) => unknown
    reset: () => Settings
  }
  modelCatalog: {
    list: (input: IpcModelListInput) => Promise<unknown>
  }
  jobs: {
    getSnapshot: (jobId: string) => unknown
  }
  sessions: {
    search: (input: SessionSearchInput) => unknown
    preview: (input: SessionPreviewInput) => unknown
    rescan: () => Promise<unknown>
  }
  projects: {
    list: () => unknown
  }
  scan: {
    getLaunchStatus: () => {
      phase: 'idle' | 'scanning' | 'completed' | 'failed'
      scanOnLaunch: boolean
      hasIndexedSessions: boolean
      failureMessage: string | null
      launchPlan: {
        shouldScanOnLaunch: boolean
        selectedProjectIds: string[]
        focusedSessionId: string | null
        collapsedGroupIds: string[]
      } | null
    }
  }
  generation: {
    previewPrompt: (input: GenerationRunInput) => Promise<unknown>
    start: (input: GenerationRunInput) => Promise<unknown>
    resume: (input: GenerationJobInput) => Promise<unknown>
    restart: (input: GenerationJobInput) => Promise<unknown>
    cancel: (input: GenerationJobInput) => Promise<unknown>
  }
  workbook: {
    list: (input: WorkbookListInput) => unknown
    previewSource: (input: WorkbookPreviewSourceInput) => unknown
    saveItem: (input: WorkbookSaveItemInput) => Promise<unknown>
    deleteItem: (input: WorkbookItemActionInput) => Promise<unknown>
    restoreItem: (input: WorkbookItemActionInput) => Promise<unknown>
    revertItem: (input: WorkbookRevertInput) => Promise<unknown>
  }
  exportRuns: {
    run: (input: ExportRunInput) => Promise<unknown>
    defaultOutputLocation: () => string
    chooseOutputDirectory: (input: ExportChooseOutputDirectoryInput) => Promise<unknown>
  }
}

export function buildRouter(deps: RouterDeps) {
  return t.router({
    settingsGet: ipcProcedure.input(noIpcInputSchema).query(() => deps.settings.get()),
    settingsSave: ipcProcedure
      .input(ipcSettingsSaveSchema)
      .mutation(({ input }) => deps.settings.save(input)),
    settingsReset: ipcProcedure.input(noIpcInputSchema).mutation(() => deps.settings.reset()),
    settingsListModels: ipcProcedure
      .input(ipcModelListInputSchema)
      .query(({ input }) => deps.modelCatalog.list(input)),
    jobSnapshot: ipcProcedure
      .input(jobSnapshotInputSchema)
      .query(({ input }) => deps.jobs.getSnapshot(input.jobId)),
    sessionSearch: ipcProcedure
      .input(sessionSearchInputSchema)
      .query(({ input }) => deps.sessions.search(input)),
    sessionPreview: ipcProcedure
      .input(sessionPreviewInputSchema)
      .query(({ input }) => deps.sessions.preview(input)),
    sessionRescan: ipcProcedure.input(noIpcInputSchema).mutation(() => deps.sessions.rescan()),
    projectsList: ipcProcedure.input(noIpcInputSchema).query(() => deps.projects.list()),
    launchScanStatus: ipcProcedure.input(noIpcInputSchema).query(() => deps.scan.getLaunchStatus()),
    generationPromptPreview: ipcProcedure
      .input(generationRunInputSchema)
      .query(({ input }) => deps.generation.previewPrompt(input)),
    generationStart: ipcProcedure
      .input(generationRunInputSchema)
      .mutation(({ input }) => deps.generation.start(input)),
    generationResume: ipcProcedure
      .input(generationJobInputSchema)
      .mutation(({ input }) => deps.generation.resume(input)),
    generationRestart: ipcProcedure
      .input(generationJobInputSchema)
      .mutation(({ input }) => deps.generation.restart(input)),
    generationCancel: ipcProcedure
      .input(generationJobInputSchema)
      .mutation(({ input }) => deps.generation.cancel(input)),
    workbookList: ipcProcedure
      .input(workbookListInputSchema)
      .query(({ input }) => deps.workbook.list(input)),
    workbookPreviewSource: ipcProcedure
      .input(workbookPreviewSourceInputSchema)
      .query(({ input }) => deps.workbook.previewSource(input)),
    workbookSaveItem: ipcProcedure
      .input(workbookSaveItemInputSchema)
      .mutation(({ input }) => deps.workbook.saveItem(input)),
    workbookDeleteItem: ipcProcedure
      .input(workbookItemActionInputSchema)
      .mutation(({ input }) => deps.workbook.deleteItem(input)),
    workbookRestoreItem: ipcProcedure
      .input(workbookItemActionInputSchema)
      .mutation(({ input }) => deps.workbook.restoreItem(input)),
    workbookRevertItem: ipcProcedure
      .input(workbookRevertInputSchema)
      .mutation(({ input }) => deps.workbook.revertItem(input)),
    exportRun: ipcProcedure
      .input(exportRunInputSchema)
      .mutation(({ input }) => deps.exportRuns.run(input)),
    exportDefaultOutputLocation: ipcProcedure.input(noIpcInputSchema).query(() =>
      deps.exportRuns.defaultOutputLocation()
    ),
    exportChooseOutputDirectory: ipcProcedure
      .input(exportChooseOutputDirectoryInputSchema)
      .mutation(({ input }) => deps.exportRuns.chooseOutputDirectory(input)),
    appHealth: ipcProcedure.input(noIpcInputSchema).query(() => ({ ok: true as const }))
  })
}

export type AppRouter = ReturnType<typeof buildRouter>
